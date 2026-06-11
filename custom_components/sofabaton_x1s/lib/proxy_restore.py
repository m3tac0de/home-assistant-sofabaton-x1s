"""Restore-side orchestration mixin for :class:`X1Proxy`.

Houses the device- and activity-backup replay code paths -- everything
that turns a backup payload back into a sequence of wire writes against
a live hub. The mixin captures roughly nine hundred lines that used to
sit inline in ``x1_proxy.py`` and presents them through one public entry
per entity kind (``restore_device``, ``restore_activity``) plus a small
family of private helpers that map source-side identifiers onto the ids
the destination hub assigns at create time.

The orchestrators are intentionally thin: each step either delegates to
an existing schema-driven builder (``build_device_create_step``,
``build_inputs_write``, ``build_button_binding_step``, ...) or to a
``persist_*`` method on the proxy. No wire bytes are constructed here.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from ..const import (
    ACTIVITY_BACKUP_SCHEMA_VERSION,
    DEVICE_BACKUP_SCHEMA_VERSION,
    HUB_BUNDLE_SCHEMA_VERSION,
    HUB_VERSION_X1,
)
from .device_create import (
    FAMILY_ACTIVITY_CREATE,
    DeviceCreateRequest,
    DeviceCreateResult,
    build_button_binding_step,
    build_command_write_steps,
    build_device_create_step,
    build_device_update_step,
    build_key_sort_steps,
    build_macro_step,
    build_macro_step_record,
    build_remote_sync_step,
    build_set_idle_behavior_step,
    run_create_sequence,
    run_device_create,
    synthesize_command_code,
)
from .blob_decoders import encode_decoded_blob, try_decode_blob
from .devices import device_config_from_backup
from .inputs import ControlKeyBlock, FavoriteSlot, InputEntry, build_inputs_write
from .protocol_const import (
    DEVICE_CLASS_BLUETOOTH,
    DEVICE_CLASS_IR,
    DEVICE_CLASS_RF_315,
    DEVICE_CLASS_RF_433,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    known_public_device_classes,
    normalize_device_class,
)


def _input_create_step_factory():
    # Imported lazily to avoid a circular import at module load: the
    # helper lives in ``x1_proxy`` because it sits next to the other
    # module-level CreateStep builders that haven't moved yet.
    from .x1_proxy import _input_create_step

    return _input_create_step


def _restore_device_dict_from_result(
    request: DeviceCreateRequest,
    result: DeviceCreateResult,
) -> dict[str, Any]:
    """Convert a :class:`DeviceCreateResult` into the legacy restore dict.

    All device classes now share the canonical IR/BT/RF result-counter
    surface; wifi network-callback devices replay their command records
    through :meth:`persist_command_record` the same way BT/RF do, so
    their counters land in :class:`DeviceCreateResult` directly.
    """

    return {
        "status": "success",
        "device_id": result.device_id,
        "restored_commands": result.restored_commands,
        "restored_button_bindings": result.restored_button_bindings,
        "restored_macros": result.restored_macros,
        "restored_inputs": result.restored_inputs,
        "skipped_favorites": result.skipped_favorites,
        "skipped_macro_steps": result.skipped_macro_steps,
        "command_id_map": {
            str(old): new for old, new in sorted(result.command_id_map.items())
        },
    }


def _run_create_sequence(*args, **kwargs):
    # Route through the ``x1_proxy`` module so call sites pick up any
    # monkeypatch of ``x1_proxy.run_create_sequence`` -- test fixtures
    # that stub create-sequence orchestration target that symbol.
    from . import x1_proxy as _xp

    return _xp.run_create_sequence(*args, **kwargs)


_X1_IMPORT_COMMAND_ACK_TIMEOUT = 10.0


class RestoreMixin:
    """Mixin providing device/activity restore orchestration."""

    def _restore_device_class(self, device_block: dict[str, Any]) -> str | None:
        """Return the normalized device class declared by a backup payload."""

        return normalize_device_class(
            device_block.get("device_class", device_block.get("device_class_code"))
        )

    @staticmethod
    def _command_restore_data(command_row: dict[str, Any]) -> dict[str, Any] | None:
        restore_data = command_row.get("restore_data")
        return dict(restore_data) if isinstance(restore_data, dict) else None

    @staticmethod
    def _edited_command_data_hex(
        restore_data: dict[str, Any],
        command_id: int,
    ) -> str | None:
        # When a backup row carries ``decoded.edited = true`` the user has
        # hand-modified the structured payload; re-encode from ``decoded``
        # and verify the encoder is round-trip-stable before letting those
        # bytes near the hub. Returns the new hex string, or ``None`` if
        # the row is a pristine capture (the common case). Raises
        # ``ValueError`` on any encode / round-trip failure so a silent
        # fallback to the stale ``data_hex`` cannot mask a dropped edit.
        #
        # Round-trip verification keys off ``decoded["class"]`` — the
        # decoded block is self-describing, and the outer device-level
        # ``device_class`` is not guaranteed to be present in
        # hand-edited bundles.
        decoded = restore_data.get("decoded")
        if not isinstance(decoded, dict):
            return None
        if not bool(decoded.get("edited")):
            return None
        try:
            encoded = encode_decoded_blob(decoded)
        except (ValueError, KeyError, TypeError) as exc:
            raise ValueError(
                f"command_id {command_id}: edited decoded block could not be "
                f"re-encoded ({exc})"
            ) from exc
        verify = try_decode_blob(decoded.get("class"), encoded)
        if verify is None:
            raise ValueError(
                f"command_id {command_id}: edited decoded block failed "
                f"round-trip self-check"
            )
        if verify.get("fields") != decoded.get("fields") or verify.get(
            "trailer_hex", ""
        ) != decoded.get("trailer_hex", ""):
            raise ValueError(
                f"command_id {command_id}: edited decoded block does not "
                f"round-trip to the same fields"
            )
        return encoded.hex()

    def _validate_restore_capabilities(
        self,
        *,
        hub_version: str,
        device_class: str | None,
        payload: dict[str, Any],
    ) -> None:
        """Fail fast when the current restore path lacks a required writer."""

        known_public_classes = set(known_public_device_classes())

        if device_class is not None and device_class not in known_public_classes:
            raise ValueError(
                "restore_device does not recognize "
                f"device_class={device_class!r} in the public device registry"
            )

        # Non-IR codecs (BT, RF, and the network-callback wifi variants)
        # all live in the same family-0x0E command-record table; the
        # restore path replays them through ``persist_command_record``
        # using the ``hub_code_record`` metadata captured at backup time.
        if device_class in (
            DEVICE_CLASS_BLUETOOTH,
            DEVICE_CLASS_RF_315,
            DEVICE_CLASS_RF_433,
            DEVICE_CLASS_WIFI_ROKU,
            DEVICE_CLASS_WIFI_IP,
            DEVICE_CLASS_WIFI_HUE,
            DEVICE_CLASS_WIFI_MQTT,
            DEVICE_CLASS_WIFI_SONOS,
        ):
            command_rows = payload.get("commands")
            if not isinstance(command_rows, list) or not any(
                isinstance(row, dict) for row in command_rows
            ):
                raise ValueError(
                    "restore_device for "
                    f"{device_class} devices needs command restore metadata "
                    "(library_type/data_hex/button slot) in each command row"
                )
            validated_rows = 0
            for row in command_rows:
                if not isinstance(row, dict):
                    continue
                restore_data = self._command_restore_data(row)
                if (
                    not isinstance(restore_data, dict)
                    or restore_data.get("transport") != "hub_code_record"
                    or restore_data.get("library_type") is None
                    or not str(restore_data.get("data_hex") or "").strip()
                ):
                    raise ValueError(
                        "restore_device for "
                        f"{device_class} devices needs command restore metadata "
                        "(library_type/data_hex/button slot) in each command row"
                    )
                validated_rows += 1
            if validated_rows == 0:
                raise ValueError(
                    "restore_device for "
                    f"{device_class} devices needs command restore metadata "
                    "(library_type/data_hex/button slot) in each command row"
                )
            return

        if device_class != DEVICE_CLASS_IR:
            raise ValueError(
                "restore_device command replay is not implemented yet for "
                f"device_class={device_class or 'unknown'}"
            )

        # Phase 3 unified the family-0x46 inputs writer; the historical
        # "X1-only post-step" guard is gone. Button bindings, macros and
        # inputs replay through schema-driven builders on every variant
        # now; if a future variant lands an entirely new layout the
        # mismatch surfaces as a wire-schema lookup error, not a guard
        # at this layer.

    def _restore_ir_commands(
        self,
        *,
        payload: dict[str, Any],
        device_id: int,
    ) -> tuple[dict[int, int], int]:
        """Replay IR command records from a backup onto ``device_id``.

        Each command row carries a ``restore_data`` block with
        ``library_type``, ``button_code`` (48-bit canonical identifier),
        and ``data_hex``. These are written verbatim via
        :meth:`persist_command_record`, preserving full wire fidelity.
        Rows without a usable ``restore_data`` block are skipped.

        Returns ``(command_id_map, restored_commands)`` where
        ``command_id_map`` translates backup command ids to the
        hub-assigned ids on the new device. The matching captured
        ``button_code`` per new id is also recorded in
        :attr:`_restore_button_code_map_buffer` for the post-create
        binding step to read.
        """

        _command_steps, command_id_map, button_code_map, _command_names = (
            self._build_restore_command_batch(
                payload=payload,
                device_id=device_id,
                strict=False,
            )
        )
        self._restore_button_code_map_buffer = dict(button_code_map)
        return command_id_map, len(command_id_map)

    def _resolve_macro_step_duration(
        self,
        *,
        request: "DeviceCreateRequest",
        button_id: int,
        src_device_id: int,
        new_step_device: int,
        step_command_id: int,
        raw_duration: int,
    ) -> tuple[int, bool]:
        """Translate an activity-macro step's ``duration`` byte at restore time.

        For most macro steps the byte is an opaque hold/timing value
        that round-trips byte-for-byte. The exception is
        ``(device, key_id=0xC5)`` rows in a POWER_ON macro: there the
        byte is a 1-based ordinal into the *source* device's input
        list at backup time. The destination hub almost certainly
        assigned a different ordinal layout to the freshly-restored
        device, so the byte has to be re-resolved.

        Resolution chain (only entered when the request carries
        bundle context, i.e. during a hub-bundle restore):

        1. Source ordinal -> source device's input row's
           ``command_id`` (via the bundled device's ``inputs`` block).
        2. Source ``command_id`` -> destination ``command_id`` via the
           per-source-device map captured during the devices phase.
        3. Destination ``command_id`` -> destination ordinal via a
           live ``query_device_input_index`` on the new device.

        Any step that breaks the chain (no source input row matches,
        no command_id translation, hub doesn't answer the input-index
        query) keeps the raw duration and the caller increments
        ``skipped_input_ordinals``; the surrounding macro entries
        are emitted unchanged.

        Returns ``(resolved_duration, ordinal_skipped)``.
        """

        if step_command_id != 0xC5 or raw_duration == 0:
            return raw_duration, False

        bundle_devices = request.bundle_devices_by_source_id
        command_id_maps = request.command_id_maps_by_source_device_id
        if not bundle_devices or not command_id_maps:
            # No bundle context (standalone restore_activity call).
            # The raw duration is the only signal we have; preserve
            # it byte-for-byte. Callers that need correctness across
            # hubs should restore via the bundle path.
            return raw_duration, False

        source_device_payload = bundle_devices.get(src_device_id)
        if not isinstance(source_device_payload, dict):
            self._log.warning(
                "[RESTORE] activity macro key=0x%02X dev=0x%02X 0xC5 step "
                "ordinal=%d: source device not present in bundle; "
                "preserving raw duration",
                button_id,
                src_device_id,
                raw_duration,
            )
            return raw_duration, True

        source_inputs = source_device_payload.get("inputs")
        if not isinstance(source_inputs, list):
            self._log.warning(
                "[RESTORE] activity macro key=0x%02X dev=0x%02X 0xC5 step "
                "ordinal=%d: source device has no inputs block; "
                "preserving raw duration",
                button_id,
                src_device_id,
                raw_duration,
            )
            return raw_duration, True

        source_command_id: int | None = None
        for input_row in source_inputs:
            if not isinstance(input_row, dict):
                continue
            if int(input_row.get("input_index", 0)) & 0xFF == raw_duration:
                source_command_id = int(input_row.get("command_id", 0)) & 0xFF
                break
        if not source_command_id:
            self._log.warning(
                "[RESTORE] activity macro key=0x%02X dev=0x%02X 0xC5 step "
                "ordinal=%d: source device has no input row with that "
                "ordinal; preserving raw duration",
                button_id,
                src_device_id,
                raw_duration,
            )
            return raw_duration, True

        cmd_map = command_id_maps.get(src_device_id) or {}
        new_command_id = int(cmd_map.get(source_command_id, 0)) & 0xFF
        if not new_command_id:
            self._log.warning(
                "[RESTORE] activity macro key=0x%02X dev=0x%02X 0xC5 step "
                "ordinal=%d -> source cmd=0x%02X has no destination "
                "command_id in the per-device map; preserving raw duration",
                button_id,
                src_device_id,
                raw_duration,
                source_command_id,
            )
            return raw_duration, True

        try:
            new_ordinal = self.query_device_input_index(
                new_step_device, new_command_id
            )
        except Exception:
            # Defensive: a hub that errors mid-resolution shouldn't
            # crash the whole macro replay -- log and preserve the
            # raw byte.
            self._log.exception(
                "[RESTORE] activity macro key=0x%02X dev=0x%02X 0xC5 step: "
                "query_device_input_index raised; preserving raw duration",
                button_id,
                new_step_device,
            )
            return raw_duration, True

        if not new_ordinal:
            self._log.warning(
                "[RESTORE] activity macro key=0x%02X dev=0x%02X 0xC5 step "
                "ordinal=%d -> src cmd=0x%02X -> new cmd=0x%02X: destination "
                "hub returned no ordinal; preserving raw duration",
                button_id,
                new_step_device,
                raw_duration,
                source_command_id,
                new_command_id,
            )
            return raw_duration, True

        return new_ordinal & 0xFF, False

    @staticmethod
    def _coerce_button_code(raw: Any) -> int:
        """Read a backup ``button_code`` field which may be int or hex string."""

        if isinstance(raw, int):
            return raw & 0xFFFFFFFFFFFF
        if isinstance(raw, str):
            stripped = raw.strip().replace(" ", "")
            if not stripped:
                return 0
            try:
                if any(ch in "abcdefABCDEF" for ch in stripped) or stripped.startswith(("0x", "0X")):
                    return int(stripped, 16) & 0xFFFFFFFFFFFF
                return int(stripped) & 0xFFFFFFFFFFFF
            except ValueError:
                return 0
        return 0

    def _build_restore_command_batch(
        self,
        *,
        payload: dict[str, Any],
        device_id: int,
        strict: bool,
        ack_timeout: float = 5.0,
    ) -> tuple[list[Any], dict[int, int], dict[int, int], dict[int, str]]:
        """Build one app-style command burst for a restored device."""

        command_rows = payload.get("commands")
        if not isinstance(command_rows, list):
            command_rows = []

        descriptors: list[dict[str, Any]] = []
        seen_command_ids: set[int] = set()
        for row in sorted(
            (item for item in command_rows if isinstance(item, dict)),
            key=lambda item: int(item.get("command_id", 0)),
        ):
            command_id = int(row.get("command_id", 0)) & 0xFF
            if command_id == 0:
                continue
            if command_id in seen_command_ids:
                raise ValueError(
                    f"duplicate backup command_id 0x{command_id:02X} in restore payload"
                )
            seen_command_ids.add(command_id)

            restore_data = self._command_restore_data(row)
            if not isinstance(restore_data, dict):
                if strict:
                    raise ValueError(
                        f"command_id {command_id} is missing hub_code_record restore data"
                    )
                continue
            if restore_data.get("transport") != "hub_code_record":
                if strict:
                    raise ValueError(
                        f"command_id {command_id} is missing hub_code_record restore data"
                    )
                continue

            edited_hex = self._edited_command_data_hex(restore_data, command_id)
            if edited_hex is not None:
                data_hex = edited_hex
            else:
                data_hex = str(restore_data.get("data_hex") or "").strip()
            if not data_hex:
                if strict:
                    raise ValueError(
                        f"command_id {command_id} is missing non-IR command data"
                    )
                continue
            try:
                library_data = bytes.fromhex(data_hex)
            except ValueError as exc:
                raise ValueError(
                    f"invalid data_hex for command_id {command_id}: {data_hex!r}"
                ) from exc
            if not library_data:
                if strict:
                    raise ValueError(
                        f"command_id {command_id} is missing non-IR command data"
                    )
                continue

            library_type_raw = restore_data.get("library_type")
            if library_type_raw is None:
                if strict:
                    raise ValueError(
                        f"command_id {command_id} is missing a valid library_type"
                    )
                continue
            try:
                library_type = int(library_type_raw) & 0xFF
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"command_id {command_id} is missing a valid library_type"
                ) from exc

            command_code = self._coerce_button_code(restore_data.get("button_code", 0))
            raw_command_code = restore_data.get("command_code")
            if raw_command_code is not None:
                if isinstance(raw_command_code, str):
                    try:
                        command_code = (
                            int.from_bytes(bytes.fromhex(raw_command_code), "big")
                            & 0xFFFFFFFFFFFF
                        )
                    except ValueError as exc:
                        raise ValueError(
                            f"invalid command_code for command_id {command_id}: "
                            f"{raw_command_code!r}"
                        ) from exc
                else:
                    command_code = int(raw_command_code) & 0xFFFFFFFFFFFF

            descriptors.append(
                {
                    "command_id": command_id,
                    "command_name": str(row.get("name") or f"Command {command_id}"),
                    "library_type": library_type,
                    "library_data": library_data,
                    "command_code": command_code,
                }
            )

        burst_size = len(descriptors)
        command_steps: list[Any] = []
        command_id_map: dict[int, int] = {}
        button_code_map: dict[int, int] = {}
        command_names: dict[int, str] = {}
        for command_seq, descriptor in enumerate(descriptors, start=1):
            command_id = int(descriptor["command_id"]) & 0xFF
            command_name = str(descriptor["command_name"] or f"Command {command_id}")
            command_steps.extend(
                build_command_write_steps(
                    hub_version=self.hub_version,
                    command_seq=command_seq,
                    command_burst_size=burst_size,
                    device_id=device_id & 0xFF,
                    button_id=command_id,
                    library_type=int(descriptor["library_type"]) & 0xFF,
                    button_code=int(descriptor["command_code"]) & 0xFFFFFFFFFFFF,
                    label=command_name,
                    library_data=bytes(descriptor["library_data"]),
                    ack_timeout=ack_timeout,
                )
            )
            command_id_map[command_id] = command_id
            button_code_map[command_id] = int(descriptor["command_code"]) & 0xFFFFFFFFFFFF
            command_names[command_id] = command_name

        return command_steps, command_id_map, button_code_map, command_names

    def _restore_input_payload(
        self,
        *,
        device_id: int,
        input_record: dict[str, Any] | None,
        inputs: list[dict[str, Any]],
        map_command_id,
    ) -> tuple[bytes | None, int]:
        """Build the family-0x46 payload from backup metadata.

        Replays the captured page faithfully: entries (with command_id
        remapped to the restored device), plus the captured
        ``source_id_byte``, position flags, trailing control-key rows,
        favorite rows and state byte. ``inputModel`` is ``1`` for *all*
        list-based switching styles (direct, menu, up/down, number-key,
        source-cycling) -- they differ only in the 0x46 page contents,
        so the trailing region must be replayed rather than gated on the
        device-tail mode. A real direct device carries an all-zero
        trailing region, so verbatim replay reproduces it. The page
        round-trips identically on X1 and X1S/X2 via
        :func:`build_inputs_write`.
        """

        record = input_record if isinstance(input_record, dict) else {}
        record_entries = record.get("entries")
        entry_source = (
            list(record_entries)
            if isinstance(record_entries, list) and record_entries
            else list(inputs)
        )

        entries: list[InputEntry] = []
        restored_inputs = 0
        ordered_entries = sorted(
            (item for item in entry_source if isinstance(item, dict)),
            key=lambda item: int(
                item.get("input_index", item.get("ordinal", 0)) or 0
            ),
        )
        for ordinal_pos, row in enumerate(ordered_entries, start=1):
            mapped_command_id = map_command_id(row.get("command_id"))
            if mapped_command_id is None:
                continue
            entries.append(
                InputEntry(
                    key_id=mapped_command_id,
                    fid=self._coerce_button_code(row.get("fid")) or synthesize_command_code(mapped_command_id),
                    ordinal=int(row.get("input_index", row.get("ordinal", ordinal_pos))) & 0xFF,
                    label=str(row.get("name") or row.get("label") or f"Input {mapped_command_id}"),
                )
            )
            restored_inputs += 1

        control_keys_raw = record.get("control_keys")
        control_keys = ControlKeyBlock()
        if isinstance(control_keys_raw, dict):
            try:
                control_keys = ControlKeyBlock(
                    input_list=bytes.fromhex(str(control_keys_raw.get("input_list") or "").strip()) if str(control_keys_raw.get("input_list") or "").strip() else b"",
                    input_up=bytes.fromhex(str(control_keys_raw.get("input_up") or "").strip()) if str(control_keys_raw.get("input_up") or "").strip() else b"",
                    input_down=bytes.fromhex(str(control_keys_raw.get("input_down") or "").strip()) if str(control_keys_raw.get("input_down") or "").strip() else b"",
                    input_confirm=bytes.fromhex(str(control_keys_raw.get("input_confirm") or "").strip()) if str(control_keys_raw.get("input_confirm") or "").strip() else b"",
                )
            except ValueError:
                self._log.warning("[RESTORE] invalid input_record control_keys; falling back to zeroed rows")

        favorite_rows: list[FavoriteSlot] = []
        favorites_raw = record.get("favorites")
        if isinstance(favorites_raw, list):
            for row in favorites_raw:
                if not isinstance(row, str):
                    continue
                stripped = row.strip()
                if not stripped:
                    favorite_rows.append(FavoriteSlot())
                    continue
                try:
                    favorite_rows.append(FavoriteSlot(payload=bytes.fromhex(stripped)))
                except ValueError:
                    self._log.warning("[RESTORE] invalid input_record favorite row %r; zeroing", row)
                    favorite_rows.append(FavoriteSlot())

        source_id_byte = int(record.get("source_id_byte", 0)) & 0xFF
        if source_id_byte == 0 and entries:
            source_id_byte = 1

        payload = build_inputs_write(
            hub_version=self.hub_version,
            device_id=device_id,
            entries=entries,
            source_id_byte=source_id_byte,
            flag_a=int(record.get("flag_a", 0)) & 0xFF,
            flag_b=int(record.get("flag_b", 0)) & 0xFF,
            control_keys=control_keys,
            favorites=favorite_rows,
            state_byte=int(record.get("state_byte", 0)) & 0xFF,
        )
        return payload, restored_inputs

    def _finalize_restore_device_result(
        self,
        *,
        device_block: dict[str, Any],
        device_class: str | None,
        device_id: int,
        command_names: dict[int, str],
        post_steps: list[Any],
        restored_commands: int,
        restored_inputs: int,
        restored_macros: int,
        skipped_macro_steps: int,
        command_id_map: dict[int, int],
        request: DeviceCreateRequest,
    ) -> DeviceCreateResult:
        """Persist local state and build the shared result surface."""

        self.state.commands[device_id] = dict(command_names)
        self._commands_complete.add(device_id)
        self.state.devices[device_id] = {
            "name": str(device_block.get("name") or ""),
            "brand": str(device_block.get("brand") or ""),
            "device_class": device_class,
            "device_class_code": int(device_block.get("device_class_code", 0)) & 0xFF,
            "power_mode": int(device_block.get("power_mode", 0)) & 0xFF,
            "power_model": int(device_block.get("power_mode", 0)) & 0xFF,
        }

        return DeviceCreateResult(
            success=True,
            device_id=device_id,
            restored_commands=restored_commands,
            restored_button_bindings=sum(
                1 for step in post_steps if step.family == 0x3E
            ),
            restored_macros=restored_macros,
            restored_inputs=restored_inputs,
            skipped_favorites=len(request.favorites),
            skipped_macro_steps=skipped_macro_steps,
            command_id_map=dict(command_id_map),
        )

    def _refresh_destination_catalog(self, *, timeout: float = 5.0) -> None:
        """Synchronously refresh the destination hub's device + activity lists.

        Mirrors the official Android app's
        :class:`LoadingActivity.setIds()` prelude: before allocating
        restore ids, query the *live* hub via ``request_devices`` /
        ``request_activities`` so the subsequent
        :meth:`_allocate_restore_device_id` allocates against fresh
        ground truth rather than the proxy's local state (which can be
        stale and lead the hub to silently override our targeted id --
        e.g. the symptom where a freshly-restored device never appears
        because we were writing into an already-allocated slot).

        Best-effort: if the hub doesn't answer one of the requests
        within ``timeout`` the call returns anyway and allocation falls
        back on whatever state is already cached. We do not raise --
        the existing allocator already copes with empty state.
        """

        import threading

        if not self.can_issue_commands():
            return

        devices_done = threading.Event()
        activities_done = threading.Event()

        def _devices_cb(_: str) -> None:
            devices_done.set()

        def _activities_cb(_: str) -> None:
            activities_done.set()

        self._burst.on_burst_end("devices", _devices_cb)
        self._burst.on_burst_end("activities", _activities_cb)

        if not self.request_devices():
            devices_done.set()
        if not self.request_activities():
            activities_done.set()

        devices_done.wait(timeout)
        activities_done.wait(timeout)

    def _allocate_restore_device_id(self, preferred_device_id: int) -> int:
        """Pick a free destination id for restore replay."""

        used_ids = {
            int(entity_id) & 0xFF
            for bucket in (self.state.devices, self.state.activities)
            if isinstance(bucket, dict)
            for entity_id in bucket.keys()
            if 0 < (int(entity_id) & 0xFF) < 0xFF
        }
        preferred = preferred_device_id & 0xFF
        if 0 < preferred < 0xFF and preferred not in used_ids:
            return preferred
        for candidate in range(1, 0xFF):
            if candidate not in used_ids:
                return candidate
        raise ValueError("destination hub has no free device ids for restore")

    def _restore_hub_code_record_commands(
        self,
        *,
        payload: dict[str, Any],
        device_id: int,
    ) -> tuple[dict[int, int], int]:
        """Replay opaque hub-owned command records for Bluetooth and RF devices."""
        _command_steps, command_id_map, button_code_map, _command_names = (
            self._build_restore_command_batch(
                payload=payload,
                device_id=device_id,
                strict=True,
            )
        )
        self._restore_button_code_map_buffer = dict(button_code_map)
        return command_id_map, len(command_id_map)

    def _restore_commands_for_device_class(
        self,
        *,
        payload: dict[str, Any],
        device_id: int,
        device_class: str | None,
    ) -> tuple[dict[int, int], int]:
        """Dispatch command replay to the correct device-class writer."""

        if device_class == DEVICE_CLASS_IR:
            return self._restore_ir_commands(payload=payload, device_id=device_id)
        if device_class in (
            DEVICE_CLASS_BLUETOOTH,
            DEVICE_CLASS_RF_315,
            DEVICE_CLASS_RF_433,
            DEVICE_CLASS_WIFI_ROKU,
            DEVICE_CLASS_WIFI_IP,
            DEVICE_CLASS_WIFI_HUE,
            DEVICE_CLASS_WIFI_MQTT,
            DEVICE_CLASS_WIFI_SONOS,
        ):
            return self._restore_hub_code_record_commands(
                payload=payload,
                device_id=device_id,
            )

        raise ValueError(
            "restore_device command replay is not implemented yet for "
            f"device_class={device_class or 'unknown'}"
        )

    def restore_device(
        self,
        payload: dict[str, Any],
        *,
        wifi_commands_request_port: int = 8060,
    ) -> dict[str, Any] | None:
        """Restore a device from the payload returned by ``backup_device``.

        Validates the payload and translates it into a
        :class:`DeviceCreateRequest`; the on-the-wire orchestration
        lives behind :func:`run_device_create`. All device classes --
        IR, BT, RF, and the network-callback wifi variants -- route
        through the same generic create + replay pipeline now; the
        per-class differences are the codec bytes captured in each
        command row's ``restore_data``, not the orchestration shape.

        The legacy ``wifi_commands_request_port`` keyword is retained
        for call-site compatibility but is otherwise unused -- callback
        URLs in restored wifi devices are replayed byte-for-byte from
        the source hub's capture. Re-pointing a restored wifi device's
        callbacks at a fresh hub's HTTP listener is handled separately
        by the Wifi Commands sync flow.
        """

        del wifi_commands_request_port  # retained for API compatibility

        try:
            if not self.can_issue_commands():
                self._log.info("[RESTORE] restore_device ignored: proxy client is connected")
                return None

            if not isinstance(payload, dict):
                raise ValueError("restore payload must be a dictionary")
            if payload.get("kind") != "device_backup":
                raise ValueError("restore payload kind must be 'device_backup'")
            if int(payload.get("schema_version", 0)) != DEVICE_BACKUP_SCHEMA_VERSION:
                raise ValueError(
                    "restore_device payload schema_version must be "
                    f"{DEVICE_BACKUP_SCHEMA_VERSION} (got "
                    f"{payload.get('schema_version')!r}); re-export the device "
                    "with the current backup format"
                )

            device_block = payload.get("device")
            if not isinstance(device_block, dict):
                raise ValueError("restore payload must include a 'device' block")
            device_class = self._restore_device_class(device_block)

            self._validate_restore_capabilities(
                hub_version=self.hub_version,
                device_class=device_class,
                payload=payload,
            )

            # Input entries flow exclusively through ``input_record`` in
            # the slim format; device-level favorites are an activity
            # concept and are not part of a device backup.
            request = DeviceCreateRequest(
                transport="ir",
                device_block=dict(device_block),
                commands=list(payload.get("commands") or []),
                button_bindings=list(payload.get("button_bindings") or []),
                macros=list(payload.get("macros") or []),
                input_record=(
                    dict(payload.get("input_record"))
                    if isinstance(payload.get("input_record"), dict)
                    else None
                ),
                key_sort=(
                    dict(payload.get("key_sort"))
                    if isinstance(payload.get("key_sort"), dict)
                    else None
                ),
            )

            result = run_device_create(self, request)
            if not result.success or result.device_id is None:
                return None
            return _restore_device_dict_from_result(request, result)
        except Exception:
            self._log.exception("[RESTORE] restore_device failed")
            raise

    def _run_ir_device_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        """Run the IR / BT / RF device-create pipeline.

        Body relocated from ``restore_device``; inputs flow in through
        :class:`DeviceCreateRequest` rather than directly off the
        backup payload. Phase 7 keeps this method's wire-orchestration
        shape identical to the previous restore-device pipeline -- the
        unification target was the *entry point*, not the wire
        sequence, since that sequence was already canonical (no
        wifi-specific quirks, schema-driven step builders throughout).
        """
        if self.hub_version == HUB_VERSION_X1:
            return self._run_x1_import_device_create(request)

        return self._run_restore_style_device_create(request)

    def _run_restore_style_device_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        """Run the restore-style device-create flow used on X1S/X2."""

        _input_create_step = _input_create_step_factory()
        device_block = request.device_block
        device_class = self._restore_device_class(device_block)
        # Match the official app's setIds() prelude: query the live hub
        # for its current device/activity lists before picking an id, so
        # the allocator avoids slots the hub already considers taken.
        # Without this, stale proxy state can lead us to target an id
        # the hub silently overrides -- and subsequent writes end up
        # addressing the wrong (or no) device on the hub.
        self._refresh_destination_catalog()
        target_device_id = self._allocate_restore_device_id(
            int(device_block.get("device_id", 0)) & 0xFF
        )
        create_config = replace(
            device_config_from_backup(device_block, for_create=False),
            device_id=target_device_id,
        )

        self.reset_ack_queues()
        create_result = _run_create_sequence(
            self,
            [build_device_create_step(create_config, hub_version=self.hub_version)],
        )
        if not create_result.success or create_result.assigned_device_id is None:
            failed = (
                create_result.failed_step.label
                if create_result.failed_step is not None
                else "device-create"
            )
            self._log.warning("[RESTORE] create phase failed at step %s", failed)
            return DeviceCreateResult(success=False, failed_step_label=failed)

        old_device_id = int(device_block.get("device_id", 0)) & 0xFF
        new_device_id = create_result.assigned_device_id & 0xFF
        if new_device_id != target_device_id:
            self._log.warning(
                "[RESTORE] hub assigned device_id=0x%02X after targeting 0x%02X",
                new_device_id,
                target_device_id,
            )
        self._log.info(
            "[RESTORE] created device from backup old=0x%02X new=0x%02X",
            old_device_id,
            new_device_id,
        )

        self.state.commands.pop(new_device_id, None)
        self.state.buttons.pop(new_device_id, None)
        self.state.button_details.pop(new_device_id, None)
        self.clear_entity_cache(new_device_id, clear_buttons=True)

        command_steps, command_id_map, button_code_map, command_names = (
            self._build_restore_command_batch(
                payload={"commands": request.commands},
                device_id=new_device_id,
                strict=(device_class != DEVICE_CLASS_IR),
            )
        )
        restored_commands = len(command_id_map)
        self._restore_button_code_map_buffer = dict(button_code_map)

        def _map_command_id(raw_command_id: Any) -> int | None:
            try:
                old_command_id = int(raw_command_id) & 0xFF
            except (TypeError, ValueError):
                return None
            if old_command_id == 0:
                return None
            return command_id_map.get(old_command_id)

        def _button_code_for(command_id: int) -> int:
            captured = button_code_map.get(command_id, 0)
            return captured or synthesize_command_code(command_id)

        post_steps = [
            build_set_idle_behavior_step(
                device_id=new_device_id,
                mode=int(device_block.get("power_mode", 0)) & 0xFF,
            )
        ]
        post_steps.extend(command_steps)
        if isinstance(request.key_sort, dict):
            key_sort_msg_hex = str(request.key_sort.get("msg_hex") or "").strip()
            if key_sort_msg_hex:
                post_steps.extend(
                    build_key_sort_steps(
                        device_id=new_device_id,
                        msg_hex=key_sort_msg_hex,
                    )
                )

        restored_inputs = 0
        input_mode = int(device_block.get("input_mode", 0)) & 0xFF
        inputs_configured = bool(device_block.get("inputs_configured", input_mode != 0))
        if inputs_configured and (request.inputs or request.input_record):
            inputs_payload, restored_inputs = self._restore_input_payload(
                device_id=new_device_id,
                input_record=request.input_record,
                inputs=request.inputs,
                map_command_id=_map_command_id,
            )
            if inputs_payload is not None:
                post_steps.append(
                    _input_create_step(
                        device_id=new_device_id,
                        payload=inputs_payload,
                        label_suffix=f"count={restored_inputs}",
                    )
                )

        skipped_macro_steps = 0
        restored_macros = 0
        for row in sorted(
            (item for item in request.macros if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            button_id = int(row.get("button_id", 0)) & 0xFF
            if button_id == 0:
                continue
            step_records = bytearray()
            steps = row.get("steps")
            if isinstance(steps, list):
                for entry in steps:
                    if not isinstance(entry, dict):
                        continue
                    raw_command_id = entry.get("command_id")
                    raw_command_lo = int(raw_command_id or 0) & 0xFF
                    if raw_command_lo == 0xFF:
                        # Delay/wait row: emit the firmware sentinel
                        # record. All head bytes are 0xFF (dev_id,
                        # cmd_id, the 6-byte fid, and the duration
                        # byte); the last byte holds the pause length.
                        step_records.extend(
                            build_macro_step_record(
                                device_id=0xFF,
                                command_id=0xFF,
                                fid=0xFFFFFFFFFFFF,
                                duration=0xFF,
                                delay=int(entry.get("delay", 0xFF)) & 0xFF,
                            )
                        )
                        continue
                    mapped_command_id = _map_command_id(raw_command_id)
                    if mapped_command_id is None:
                        if raw_command_lo != 0:
                            self._log.warning(
                                "[RESTORE] macro key=0x%02X skipped step "
                                "with unmapped command_id=%r",
                                button_id,
                                raw_command_id,
                            )
                            skipped_macro_steps += 1
                        continue
                    step_records.extend(
                        build_macro_step_record(
                            device_id=new_device_id,
                            command_id=mapped_command_id,
                            fid=_button_code_for(mapped_command_id),
                            duration=int(entry.get("duration", 0)) & 0xFF,
                            delay=int(entry.get("delay", 0xFF)) & 0xFF,
                        )
                    )
            post_steps.append(
                build_macro_step(
                    hub_version=self.hub_version,
                    device_id=new_device_id,
                    key_id=button_id,
                    label=str(row.get("name") or ""),
                    step_records=bytes(step_records),
                )
            )
            restored_macros += 1

        for row in sorted(
            (item for item in request.button_bindings if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            new_command_id = _map_command_id(row.get("command_id"))
            button_id = int(row.get("button_id", 0)) & 0xFF
            if button_id == 0 or new_command_id is None:
                continue
            long_press_command_id = _map_command_id(row.get("long_press_command_id"))
            kwargs: dict[str, Any] = {
                "device_id": new_device_id,
                "button_id": button_id,
                "short_press_device_id": new_device_id,
                "short_press_button_code": _button_code_for(new_command_id),
                "short_press_button_id": new_command_id,
            }
            if long_press_command_id is not None:
                kwargs["long_press_device_id"] = new_device_id
                kwargs["long_press_button_code"] = _button_code_for(long_press_command_id)
                kwargs["long_press_button_id"] = long_press_command_id
            post_steps.append(build_button_binding_step(**kwargs))

        self.reset_ack_queues()
        post_result = _run_create_sequence(self, post_steps)
        if not post_result.success:
            failed = (
                post_result.failed_step.label
                if post_result.failed_step is not None
                else "post-create"
            )
            self._log.warning("[RESTORE] finalize phase failed at step %s", failed)
            return DeviceCreateResult(
                success=False,
                device_id=new_device_id,
                failed_step_label=failed,
            )

        return self._finalize_restore_device_result(
            device_block=device_block,
            device_class=device_class,
            device_id=new_device_id,
            command_names=command_names,
            post_steps=post_steps,
            restored_commands=restored_commands,
            restored_inputs=restored_inputs,
            restored_macros=restored_macros,
            skipped_macro_steps=skipped_macro_steps,
            command_id_map=command_id_map,
            request=request,
        )

    def _run_x1_import_device_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        """Run an X1-specific import flow modeled after normal app add-device."""

        _input_create_step = _input_create_step_factory()
        device_block = request.device_block
        device_class = self._restore_device_class(device_block)
        create_config = replace(
            device_config_from_backup(device_block, for_create=True),
            # On X1, create the device as input-unconfigured and let the
            # later 0x46 + final 0x08 establish the real input state. Keep
            # power-related bytes as-is for now; that path is already
            # behaving correctly in live restores.
            input_flag=0,
            input_mode=0,
        )

        self.reset_ack_queues()
        create_result = _run_create_sequence(
            self,
            [build_device_create_step(create_config, hub_version=self.hub_version)],
        )
        if not create_result.success or create_result.assigned_device_id is None:
            failed = (
                create_result.failed_step.label
                if create_result.failed_step is not None
                else "device-create"
            )
            self._log.warning("[RESTORE] X1 import create phase failed at step %s", failed)
            return DeviceCreateResult(success=False, failed_step_label=failed)

        old_device_id = int(device_block.get("device_id", 0)) & 0xFF
        new_device_id = create_result.assigned_device_id & 0xFF
        self._log.info(
            "[RESTORE] X1 import created device from backup old=0x%02X new=0x%02X",
            old_device_id,
            new_device_id,
        )

        self.state.commands.pop(new_device_id, None)
        self.state.buttons.pop(new_device_id, None)
        self.state.button_details.pop(new_device_id, None)
        self.clear_entity_cache(new_device_id, clear_buttons=True)

        command_steps, command_id_map, button_code_map, command_names = (
            self._build_restore_command_batch(
                payload={"commands": request.commands},
                device_id=new_device_id,
                strict=(device_class != DEVICE_CLASS_IR),
                ack_timeout=_X1_IMPORT_COMMAND_ACK_TIMEOUT,
            )
        )
        restored_commands = len(command_id_map)
        self._restore_button_code_map_buffer = dict(button_code_map)

        def _map_command_id(raw_command_id: Any) -> int | None:
            try:
                old_command_id = int(raw_command_id) & 0xFF
            except (TypeError, ValueError):
                return None
            if old_command_id == 0:
                return None
            return command_id_map.get(old_command_id)

        def _button_code_for(command_id: int) -> int:
            captured = button_code_map.get(command_id, 0)
            return captured or synthesize_command_code(command_id)

        post_steps = list(command_steps)

        for row in sorted(
            (item for item in request.button_bindings if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            new_command_id = _map_command_id(row.get("command_id"))
            button_id = int(row.get("button_id", 0)) & 0xFF
            if button_id == 0 or new_command_id is None:
                continue
            long_press_command_id = _map_command_id(row.get("long_press_command_id"))
            kwargs: dict[str, Any] = {
                "device_id": new_device_id,
                "button_id": button_id,
                "short_press_device_id": new_device_id,
                "short_press_button_code": _button_code_for(new_command_id),
                "short_press_button_id": new_command_id,
            }
            if long_press_command_id is not None:
                kwargs["long_press_device_id"] = new_device_id
                kwargs["long_press_button_code"] = _button_code_for(long_press_command_id)
                kwargs["long_press_button_id"] = long_press_command_id
            post_steps.append(build_button_binding_step(**kwargs))

        post_steps.append(
            build_set_idle_behavior_step(
                device_id=new_device_id,
                mode=int(device_block.get("power_mode", 0)) & 0xFF,
            )
        )

        skipped_macro_steps = 0
        restored_macros = 0
        for row in sorted(
            (item for item in request.macros if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            button_id = int(row.get("button_id", 0)) & 0xFF
            if button_id == 0:
                continue
            step_records = bytearray()
            steps = row.get("steps")
            if isinstance(steps, list):
                for entry in steps:
                    if not isinstance(entry, dict):
                        continue
                    raw_command_id = entry.get("command_id")
                    raw_command_lo = int(raw_command_id or 0) & 0xFF
                    if raw_command_lo == 0xFF:
                        # Delay/wait row: emit the firmware sentinel
                        # record. All head bytes are 0xFF (dev_id,
                        # cmd_id, the 6-byte fid, and the duration
                        # byte); the last byte holds the pause length.
                        step_records.extend(
                            build_macro_step_record(
                                device_id=0xFF,
                                command_id=0xFF,
                                fid=0xFFFFFFFFFFFF,
                                duration=0xFF,
                                delay=int(entry.get("delay", 0xFF)) & 0xFF,
                            )
                        )
                        continue
                    mapped_command_id = _map_command_id(raw_command_id)
                    if mapped_command_id is None:
                        if raw_command_lo != 0:
                            self._log.warning(
                                "[RESTORE] macro key=0x%02X skipped step "
                                "with unmapped command_id=%r",
                                button_id,
                                raw_command_id,
                            )
                            skipped_macro_steps += 1
                        continue
                    step_records.extend(
                        build_macro_step_record(
                            device_id=new_device_id,
                            command_id=mapped_command_id,
                            fid=_button_code_for(mapped_command_id),
                            duration=int(entry.get("duration", 0)) & 0xFF,
                            delay=int(entry.get("delay", 0xFF)) & 0xFF,
                        )
                    )
            post_steps.append(
                build_macro_step(
                    hub_version=self.hub_version,
                    device_id=new_device_id,
                    key_id=button_id,
                    label=str(row.get("name") or ""),
                    step_records=bytes(step_records),
                )
            )
            restored_macros += 1

        restored_inputs = 0
        input_mode = int(device_block.get("input_mode", 0)) & 0xFF
        inputs_configured = bool(device_block.get("inputs_configured", input_mode != 0))
        inputs_payload: bytes | None = None
        if inputs_configured and (request.inputs or request.input_record):
            inputs_payload, restored_inputs = self._restore_input_payload(
                device_id=new_device_id,
                input_record=request.input_record,
                inputs=request.inputs,
                map_command_id=_map_command_id,
            )
        if inputs_payload is not None:
            post_steps.append(
                _input_create_step(
                    device_id=new_device_id,
                    payload=inputs_payload,
                    label_suffix=f"count={restored_inputs}",
                )
            )
        else:
            post_steps.append(
                _input_create_step(
                    device_id=new_device_id,
                    payload=build_inputs_write(
                        hub_version=self.hub_version,
                        device_id=new_device_id,
                        source_id_byte=0,
                    ),
                    label_suffix="default",
                )
            )

        finalize_config = replace(
            device_config_from_backup(device_block, for_create=False),
            device_id=new_device_id,
        )
        post_steps.append(
            build_device_update_step(
                finalize_config,
                hub_version=self.hub_version,
            )
        )

        self.reset_ack_queues()
        post_result = _run_create_sequence(self, post_steps)
        if not post_result.success:
            failed = (
                post_result.failed_step.label
                if post_result.failed_step is not None
                else "post-create"
            )
            self._log.warning("[RESTORE] X1 import finalize phase failed at step %s", failed)
            return DeviceCreateResult(
                success=False,
                device_id=new_device_id,
                failed_step_label=failed,
            )

        return self._finalize_restore_device_result(
            device_block=device_block,
            device_class=device_class,
            device_id=new_device_id,
            command_names=command_names,
            post_steps=post_steps,
            restored_commands=restored_commands,
            restored_inputs=restored_inputs,
            restored_macros=restored_macros,
            skipped_macro_steps=skipped_macro_steps,
            command_id_map=command_id_map,
            request=request,
        )

    def restore_activity(
        self,
        payload: dict[str, Any],
        *,
        device_id_map: dict[int, int],
        bundle_devices_by_source_id: dict[int, dict[str, Any]] | None = None,
        command_id_maps_by_source_device_id: dict[int, dict[int, int]] | None = None,
    ) -> dict[str, Any] | None:
        """Restore an activity from a backup payload.

        Thin adapter over :func:`run_device_create` with
        ``entity_kind='activity'``. Activities share the device-record
        schema but live in a different opcode family (``0x37``) and
        their content is references to other devices' commands; the
        caller-supplied ``device_id_map`` translates source-side
        device ids to the ids the destination hub has assigned to
        those devices.

        ``bundle_devices_by_source_id`` and
        ``command_id_maps_by_source_device_id`` are populated by the
        bundle-restore orchestrator (:meth:`restore_hub_bundle`) and
        carry the data needed to re-resolve ``key_id=0xC5`` macro
        rows (the "set input on device" marker) against the
        freshly-restored devices' command ids. Both are optional;
        when omitted, ``0xC5`` rows preserve their raw ``duration``
        byte verbatim.

        Validation:

        - Payload must declare ``kind == 'activity_backup'``.
        - ``device_id_map`` must cover every distinct source device id
          referenced anywhere in the payload's button bindings, macro
          steps, and favourites; missing keys raise ``ValueError``.
        """

        try:
            if not self.can_issue_commands():
                self._log.info("[RESTORE] restore_activity ignored: proxy client is connected")
                return None
            if not isinstance(payload, dict):
                raise ValueError("restore payload must be a dictionary")
            if payload.get("kind") != "activity_backup":
                raise ValueError("restore_activity expects kind == 'activity_backup'")
            if int(payload.get("schema_version", 0)) != ACTIVITY_BACKUP_SCHEMA_VERSION:
                raise ValueError(
                    "restore_activity payload schema_version must be "
                    f"{ACTIVITY_BACKUP_SCHEMA_VERSION} (got "
                    f"{payload.get('schema_version')!r}); re-export the activity "
                    "with the current backup format"
                )
            activity_block = payload.get("device")
            if not isinstance(activity_block, dict):
                raise ValueError("restore payload must include a 'device' block")
            if activity_block.get("entity_type") != "activity":
                raise ValueError(
                    "restore_activity payload's 'device' block must mark entity_type='activity'"
                )

            referenced = self._collect_referenced_source_device_ids(payload)
            missing = referenced - {int(k) & 0xFF for k in device_id_map.keys()}
            if missing:
                missing_list = ", ".join(f"0x{m:02X}" for m in sorted(missing))
                raise ValueError(
                    "device_id_map is missing the following source device ids "
                    f"referenced by this activity backup: {missing_list}"
                )

            remap_lookup = {
                int(k) & 0xFF: int(v) & 0xFF for k, v in device_id_map.items()
            }
            bundle_devices = {
                int(k) & 0xFF: v
                for k, v in (bundle_devices_by_source_id or {}).items()
                if isinstance(v, dict)
            }
            command_id_maps = {
                int(k) & 0xFF: {
                    int(src) & 0xFF: int(dst) & 0xFF for src, dst in (m or {}).items()
                }
                for k, m in (command_id_maps_by_source_device_id or {}).items()
                if isinstance(m, dict)
            }
            request = DeviceCreateRequest(
                transport="ir",
                entity_kind="activity",
                device_block=dict(activity_block),
                button_bindings=list(payload.get("button_bindings") or []),
                macros=list(payload.get("macros") or []),
                favorites=list(payload.get("favorite_slots") or []),
                device_id_map=remap_lookup,
                bundle_devices_by_source_id=bundle_devices,
                command_id_maps_by_source_device_id=command_id_maps,
            )

            result = run_device_create(self, request)
            if not result.success or result.device_id is None:
                return None
            return {
                "status": "success",
                "activity_id": result.device_id,
                "restored_button_bindings": result.restored_button_bindings,
                "restored_macros": result.restored_macros,
                "restored_favorites": result.restored_inputs,
                "skipped_favorites": result.skipped_favorites,
                "skipped_macro_steps": result.skipped_macro_steps,
                "skipped_input_ordinals": result.skipped_input_ordinals,
                "device_id_map": {
                    str(old): new for old, new in sorted(remap_lookup.items())
                },
            }
        except Exception:
            self._log.exception("[RESTORE] restore_activity failed")
            raise

    def restore_hub_bundle(
        self,
        payload: dict[str, Any],
        *,
        wifi_commands_request_port: int = 8060,
        progress_callback=None,
        progress_offset: int = 0,
        progress_total_steps: int | None = None,
    ) -> dict[str, Any]:
        """Restore a ``hub_bundle`` payload onto the live hub.

        Devices in the bundle are restored first; the
        ``source_device_id -> new_device_id`` map is auto-built from
        their results. Activities are restored second, threaded with
        that map plus the per-source-device ``command_id_map`` and
        the original device payloads so ``0xC5`` macro rows can be
        re-resolved against the freshly-restored devices.

        Returns a dict describing the outcome:

        - ``status`` -- ``"success"`` or ``"failed"``.
        - ``failed_at`` -- ``["device" | "activity", source_id]``
          when a phase fails; absent on success.
        - ``device_id_map`` -- mapping of source_device_id (string)
          to assigned device_id (int).
        - ``restored_devices`` / ``restored_activities`` -- counts.

        On mid-bundle failure no rollback is attempted: previously
        restored devices stay on the hub and the unfinished tail is
        skipped. The caller surfaces the partial state to the user.
        """

        def _progress(**progress_payload: Any) -> None:
            if callable(progress_callback):
                progress_callback(**progress_payload)

        if not isinstance(payload, dict):
            raise ValueError("restore_hub_bundle payload must be a dict")
        if payload.get("kind") != "hub_bundle":
            raise ValueError(
                "restore_hub_bundle expects kind == 'hub_bundle'"
            )
        if int(payload.get("schema_version", 0)) != HUB_BUNDLE_SCHEMA_VERSION:
            raise ValueError(
                "restore_hub_bundle payload schema_version must be "
                f"{HUB_BUNDLE_SCHEMA_VERSION} "
                f"(got {payload.get('schema_version')!r})"
            )
        if not self.can_issue_commands():
            self._log.info(
                "[RESTORE] restore_hub_bundle ignored: proxy client is connected"
            )
            return {"status": "failed", "failed_at": ["proxy", None]}

        devices = list(payload.get("devices") or [])
        activities = list(payload.get("activities") or [])
        total_steps = int(progress_total_steps or (progress_offset + len(devices) + len(activities)))
        completed_steps = int(progress_offset)

        device_id_map: dict[int, int] = {}
        command_id_maps: dict[int, dict[int, int]] = {}
        bundle_devices_by_source_id: dict[int, dict[str, Any]] = {}
        restored_devices: list[dict[str, Any]] = []
        for device_payload in devices:
            if not isinstance(device_payload, dict):
                continue
            device_block = device_payload.get("device") or {}
            src_id = int(device_block.get("device_id", 0)) & 0xFF
            if src_id == 0:
                self._log.warning(
                    "[RESTORE] bundle device payload has no source device_id; skipping"
                )
                continue
            _progress(
                status="running",
                phase="device",
                message=f"Restoring device {src_id}…",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_device_id=src_id,
            )
            bundle_devices_by_source_id[src_id] = device_payload
            result = self.restore_device(
                payload=device_payload,
                wifi_commands_request_port=wifi_commands_request_port,
            )
            if not isinstance(result, dict) or result.get("status") != "success":
                self._log.warning(
                    "[RESTORE] bundle device 0x%02X failed -- "
                    "leaving previously restored devices in place",
                    src_id,
                )
                return {
                    "status": "failed",
                    "failed_at": ["device", src_id],
                    "device_id_map": {
                        str(s): n for s, n in sorted(device_id_map.items())
                    },
                    "restored_devices": restored_devices,
                    "restored_activities": [],
                }
            new_id = int(result.get("device_id", 0)) & 0xFF
            device_id_map[src_id] = new_id
            cmd_map_raw = result.get("command_id_map") or {}
            command_id_maps[src_id] = {
                int(k) & 0xFF: int(v) & 0xFF for k, v in cmd_map_raw.items()
            }
            restored_devices.append(
                {
                    "source_device_id": src_id,
                    "device_id": new_id,
                    "restored_commands": result.get("restored_commands", 0),
                }
            )
            completed_steps += 1
            _progress(
                status="running",
                phase="device",
                message=f"Restored device {src_id}.",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_device_id=src_id,
            )

        restored_activities: list[dict[str, Any]] = []
        for activity_payload in activities:
            if not isinstance(activity_payload, dict):
                continue
            activity_block = activity_payload.get("device") or {}
            src_act_id = int(activity_block.get("device_id", 0)) & 0xFF
            _progress(
                status="running",
                phase="activity",
                message=f"Restoring activity {src_act_id}…",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_activity_id=src_act_id,
            )
            try:
                result = self.restore_activity(
                    payload=activity_payload,
                    device_id_map=device_id_map,
                    bundle_devices_by_source_id=bundle_devices_by_source_id,
                    command_id_maps_by_source_device_id=command_id_maps,
                )
            except Exception:
                self._log.exception(
                    "[RESTORE] bundle activity 0x%02X raised", src_act_id
                )
                return {
                    "status": "failed",
                    "failed_at": ["activity", src_act_id],
                    "device_id_map": {
                        str(s): n for s, n in sorted(device_id_map.items())
                    },
                    "restored_devices": restored_devices,
                    "restored_activities": restored_activities,
                }
            if not isinstance(result, dict) or result.get("status") != "success":
                return {
                    "status": "failed",
                    "failed_at": ["activity", src_act_id],
                    "device_id_map": {
                        str(s): n for s, n in sorted(device_id_map.items())
                    },
                    "restored_devices": restored_devices,
                    "restored_activities": restored_activities,
                }
            restored_activities.append(
                {
                    "source_activity_id": src_act_id,
                    "activity_id": int(result.get("activity_id", 0)) & 0xFF,
                    "skipped_input_ordinals": result.get(
                        "skipped_input_ordinals", 0
                    ),
                }
            )
            completed_steps += 1
            _progress(
                status="running",
                phase="activity",
                message=f"Restored activity {src_act_id}.",
                completed_steps=completed_steps,
                total_steps=total_steps,
                current_activity_id=src_act_id,
            )

        return {
            "status": "success",
            "device_id_map": {
                str(s): n for s, n in sorted(device_id_map.items())
            },
            "restored_devices": restored_devices,
            "restored_activities": restored_activities,
        }

    def _run_activity_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        """Run the family-0x37 activity-create pipeline.

        Mirrors :meth:`_run_ir_device_create` but writes the activity
        record (family ``0x37``), skips the per-device command-write
        phase (activities reference commands on other devices, they
        own none), runs no device-update / inputs page, and replays
        favorites via :meth:`command_to_favorite` -- the same write
        path the live UI uses when the user adds a favorite.

        Inputs come from :class:`DeviceCreateRequest`:
        :attr:`device_block` carries the activity record fields,
        :attr:`button_bindings` / :attr:`macros` / :attr:`favorites`
        carry the backup content, and :attr:`device_id_map` translates
        the source-side device ids embedded in those rows.
        """

        activity_block = request.device_block
        remap_lookup = dict(request.device_id_map)

        def _map_device_id(raw: Any) -> int | None:
            try:
                src = int(raw) & 0xFF
            except (TypeError, ValueError):
                return None
            if src == 0:
                return None
            return remap_lookup.get(src)

        create_config = device_config_from_backup(activity_block, for_create=True)
        self.reset_ack_queues()
        create_result = _run_create_sequence(
            self,
            [
                build_device_create_step(
                    create_config,
                    hub_version=self.hub_version,
                    family=FAMILY_ACTIVITY_CREATE,
                )
            ],
        )
        if not create_result.success or create_result.assigned_device_id is None:
            failed = (
                create_result.failed_step.label
                if create_result.failed_step is not None
                else "activity-create"
            )
            self._log.warning("[RESTORE] activity create phase failed at step %s", failed)
            return DeviceCreateResult(success=False, failed_step_label=failed)

        old_activity_id = int(activity_block.get("device_id", 0)) & 0xFF
        new_activity_id = create_result.assigned_device_id & 0xFF
        self._log.info(
            "[RESTORE] created activity from backup old=0x%02X new=0x%02X",
            old_activity_id,
            new_activity_id,
        )

        self.state.commands.pop(new_activity_id, None)
        self.state.buttons.pop(new_activity_id, None)
        self.state.button_details.pop(new_activity_id, None)
        self.clear_entity_cache(new_activity_id, clear_buttons=True)

        post_steps = []
        restored_button_bindings = 0

        for row in sorted(
            (item for item in request.button_bindings if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            button_id = int(row.get("button_id", 0)) & 0xFF
            new_target_device = _map_device_id(row.get("device_id"))
            if button_id == 0 or new_target_device is None:
                continue
            target_command_id = int(row.get("command_id", 0)) & 0xFF
            short_press_code = (
                synthesize_command_code(target_command_id)
                if target_command_id
                else 0
            )
            kwargs: dict[str, Any] = {
                "device_id": new_activity_id,
                "button_id": button_id,
                "short_press_device_id": new_target_device,
                "short_press_button_code": short_press_code,
                "short_press_button_id": target_command_id,
            }
            new_lp_device = _map_device_id(row.get("long_press_device_id"))
            if new_lp_device is not None:
                lp_command_id = int(row.get("long_press_command_id", 0)) & 0xFF
                kwargs["long_press_device_id"] = new_lp_device
                kwargs["long_press_button_code"] = (
                    synthesize_command_code(lp_command_id) if lp_command_id else 0
                )
                kwargs["long_press_button_id"] = lp_command_id
            post_steps.append(build_button_binding_step(**kwargs))
            restored_button_bindings += 1

        restored_macros = 0
        skipped_macro_steps = 0
        skipped_input_ordinals = 0
        for row in sorted(
            (item for item in request.macros if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            button_id = int(row.get("button_id", 0)) & 0xFF
            if button_id == 0:
                continue
            step_records = bytearray()
            steps = row.get("steps")
            if isinstance(steps, list):
                for entry in steps:
                    if not isinstance(entry, dict):
                        continue
                    raw_device = entry.get("device_id")
                    raw_device_lo = int(raw_device or 0) & 0xFF
                    raw_step_command_lo = int(entry.get("command_id", 0)) & 0xFF
                    if raw_device_lo == 0xFF or raw_step_command_lo == 0xFF:
                        # Delay/wait row inside an activity power macro:
                        # emit the firmware sentinel record verbatim.
                        # All head bytes are 0xFF (incl. fid and the
                        # duration byte); the last byte holds the pause.
                        step_records.extend(
                            build_macro_step_record(
                                device_id=0xFF,
                                command_id=0xFF,
                                fid=0xFFFFFFFFFFFF,
                                duration=0xFF,
                                delay=int(entry.get("delay", 0xFF)) & 0xFF,
                            )
                        )
                        continue
                    new_step_device = _map_device_id(raw_device)
                    if new_step_device is None:
                        # E6 silent-drop fix (activity-side): a step
                        # whose source device_id is 0 is a hub no-op;
                        # any other unmapped id means the backup
                        # referenced a device that wasn't in the
                        # device_id_map (caller missed a remap,
                        # caught at validation but logged here for
                        # defence-in-depth).
                        if int(raw_device or 0) & 0xFF != 0:
                            self._log.warning(
                                "[RESTORE] activity macro key=0x%02X skipped step "
                                "with unmapped device_id=%r",
                                button_id,
                                raw_device,
                            )
                            skipped_macro_steps += 1
                        continue
                    src_device_id = int(raw_device) & 0xFF
                    step_command_id = int(entry.get("command_id", 0)) & 0xFF
                    raw_duration = int(entry.get("duration", 0)) & 0xFF
                    resolved_duration, ordinal_skipped = (
                        self._resolve_macro_step_duration(
                            request=request,
                            button_id=button_id,
                            src_device_id=src_device_id,
                            new_step_device=new_step_device,
                            step_command_id=step_command_id,
                            raw_duration=raw_duration,
                        )
                    )
                    if ordinal_skipped:
                        skipped_input_ordinals += 1
                    step_records.extend(
                        build_macro_step_record(
                            device_id=new_step_device,
                            command_id=step_command_id,
                            fid=self._coerce_button_code(entry.get("button_code", 0)),
                            duration=resolved_duration,
                            delay=int(entry.get("delay", 0xFF)) & 0xFF,
                        )
                    )
            post_steps.append(
                build_macro_step(
                    hub_version=self.hub_version,
                    device_id=new_activity_id,
                    key_id=button_id,
                    label=str(row.get("name") or ""),
                    step_records=bytes(step_records),
                )
            )
            restored_macros += 1

        post_steps.append(build_remote_sync_step())

        self.reset_ack_queues()
        post_result = _run_create_sequence(self, post_steps)
        if not post_result.success:
            failed = (
                post_result.failed_step.label
                if post_result.failed_step is not None
                else "activity post-create"
            )
            self._log.warning("[RESTORE] activity finalize phase failed at step %s", failed)
            return DeviceCreateResult(
                success=False,
                device_id=new_activity_id,
                failed_step_label=failed,
            )

        # Replay favourites via the same write path the live UI uses
        # to add a favorite (family-0x3E map + family-0x61 stage +
        # family-0x65 commit). Each favorite is its own multi-step
        # sequence with dynamic payloads that read back fav_id from
        # the map ack, so the sequence does not fit inside the
        # post_steps CreateStep batch above.
        restored_favorites = 0
        skipped_favorites = 0
        for row in sorted(
            (item for item in request.favorites if isinstance(item, dict)),
            key=lambda item: int(item.get("button_id", 0)),
        ):
            new_target_device = _map_device_id(row.get("device_id"))
            target_command_id = int(row.get("command_id", 0)) & 0xFF
            slot_id = int(row.get("button_id", 0)) & 0xFF
            if new_target_device is None or target_command_id == 0:
                self._log.warning(
                    "[RESTORE] skipped favorite slot=0x%02X: unmapped device_id=%r "
                    "or zero command_id",
                    slot_id,
                    row.get("device_id"),
                )
                skipped_favorites += 1
                continue
            written = self.command_to_favorite(
                new_activity_id,
                new_target_device,
                target_command_id,
                slot_id=slot_id,
                refresh_after_write=False,
                query_existing_order=False,
            )
            if not written:
                self._log.warning(
                    "[RESTORE] favorite slot=0x%02X write failed dev=0x%02X cmd=0x%02X",
                    slot_id,
                    new_target_device,
                    target_command_id,
                )
                skipped_favorites += 1
                continue
            restored_favorites += 1

        # Materialise the activity entry in local state so other
        # readers see it before the next catalog refresh.
        self.state.activities[new_activity_id] = {
            "name": str(activity_block.get("name") or ""),
            "active": False,
            "needs_confirm": False,
        }

        # ``restored_inputs`` carries the favorite-replay count for
        # activities (DeviceCreateResult has no dedicated favorites
        # counter -- activities don't write an inputs page so the
        # field is otherwise unused on this path). The adapter at
        # :meth:`restore_activity` renames it back to
        # ``restored_favorites`` in the public dict surface.
        return DeviceCreateResult(
            success=True,
            device_id=new_activity_id,
            restored_button_bindings=restored_button_bindings,
            restored_macros=restored_macros,
            restored_inputs=restored_favorites,
            skipped_favorites=skipped_favorites,
            skipped_macro_steps=skipped_macro_steps,
            skipped_input_ordinals=skipped_input_ordinals,
        )

    @staticmethod
    def _collect_referenced_source_device_ids(payload: dict[str, Any]) -> set[int]:
        """Walk an activity backup payload and return the set of source
        device ids referenced by buttons, macro steps, and favourites.
        """

        referenced: set[int] = set()

        def _add(raw: Any) -> None:
            try:
                value = int(raw) & 0xFF
            except (TypeError, ValueError):
                return
            # 0x00 = unset; 0xFF = delay/wait sentinel (no real device).
            if value != 0 and value != 0xFF:
                referenced.add(value)

        for row in payload.get("button_bindings") or []:
            if not isinstance(row, dict):
                continue
            _add(row.get("device_id"))
            _add(row.get("long_press_device_id"))
        for row in payload.get("macros") or []:
            if not isinstance(row, dict):
                continue
            for entry in row.get("steps") or []:
                if isinstance(entry, dict):
                    _add(entry.get("device_id"))
        for row in payload.get("favorite_slots") or []:
            if isinstance(row, dict):
                _add(row.get("device_id"))
        return referenced


__all__ = ["RestoreMixin"]
