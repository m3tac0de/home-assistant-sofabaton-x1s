"""Wifi-device create flow mixin for :class:`X1Proxy`.

Provides the user-facing ``create_wifi_device`` / ``create_ip_button``
entry points together with the multi-step orchestration helpers they
rely on (input configuration writes, power-button bindings, IP-callback
finalize). The X1 and X1S/X2 variants share the high-level shape but
differ in the family-0x08 finalize and the slot stride; the variant
branch is taken in :meth:`create_wifi_device` based on
``self.hub_version`` rather than from any payload heuristic.

The constants near the top of the module describe the wire layout of
the user-defined wifi command slots and the X1S/X2 finalize bookends.
Everything else in this file is high-level orchestration that delegates
its wire-building back to :mod:`lib.inputs`, :mod:`lib.macros` and the
``_build_wifi_device_payload`` helper preserved on the mixin.
"""

from __future__ import annotations

import ipaddress
import re
import time
from typing import Any

from ..const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from .device_create import DeviceCreateRequest, DeviceCreateResult, run_device_create
from .devices import DeviceConfig, build_device_create_payload
from .inputs import InputEntry, build_inputs_write
from .macros import MacroKeyEntry, build_macro_save_payload
from .protocol_const import (
    ButtonName,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_ROKU,
    NATIVE_CMD_COMMIT_DEVICE,
    NATIVE_CMD_CREATE_DEVICE,
    NATIVE_CMD_POWER_MODE_SET,
    NATIVE_CMD_SYNC_KEY,
    OP_CREATE_DEVICE_HEAD,
    OP_DEFINE_IP_CMD,
    OP_DEFINE_IP_CMD_EXISTING,
    OP_FINALIZE_DEVICE,
    OP_PREPARE_SAVE,
    OP_REMOTE_SYNC,
    OP_REQ_ACTIVITY_INPUTS,
    OP_REQ_BLOB,
    OP_SAVE_COMMIT,
    SYNC0,
    SYNC1,
)
from .state_helpers import normalize_device_entry


def _hex_to_bytes(raw_hex: str) -> bytes:
    return bytes.fromhex(raw_hex)


def _sum8(b: bytes | bytearray) -> int:
    return sum(b) & 0xFF


def _validate_wifi_input_ids(
    raw_ids: list[int] | None, *, max_command_id: int
) -> list[int] | None:
    """Range-check the input_command_ids surface of the wifi profile.

    Raises ``ValueError`` if any id falls outside 1..max_command_id.
    Returns ``None`` for ``None`` input so the profile dict carries
    "leave inputs unconfigured" through the orchestrator unchanged.
    """

    if raw_ids is None:
        return None
    normalized: list[int] = []
    for raw in raw_ids:
        command_id = int(raw)
        if command_id < 1 or command_id > max_command_id:
            raise ValueError(
                f"Unsupported input command_id {command_id}; expected 1..{max_command_id}"
            )
        normalized.append(command_id)
    return normalized


def _wifi_command_label(command_spec: Any, idx: int) -> str:
    if isinstance(command_spec, dict):
        return (
            str(
                command_spec.get("display_name")
                or command_spec.get("name")
                or f"Command {idx + 1}"
            ).strip()
            or f"Command {idx + 1}"
        )
    return str(command_spec or f"Command {idx + 1}").strip() or f"Command {idx + 1}"


# Per-slot (key_id, command_code) pairs assigned to the user-defined wifi
# command buttons. The 0x4E2X codes mirror the synthetic codes the
# keymap layer writes for the same slots so the binding rows can be
# round-tripped against the records the hub stores.
_ROKU_APP_SLOTS: list[tuple[int, int]] = [
    (0x18, 0x4E21),
    (0x19, 0x4E22),
    (0x1A, 0x4E23),
    (0x1B, 0x4E24),
    (0x1C, 0x4E25),
    (0x1D, 0x4E26),
    (0x1E, 0x4E27),
    (0x1F, 0x4E28),
    (0x20, 0x4E29),
    (0x21, 0x4E2A),
    (0x22, 0x4E2B),
    (0x23, 0x4E2C),
    (0x24, 0x4E2D),
    (0x25, 0x4E2E),
    (0x26, 0x4E2F),
    (0x27, 0x4E30),
    (0x28, 0x4E31),
    (0x29, 0x4E32),
    (0x2A, 0x4E33),
    (0x2B, 0x4E34),
]


_ROKU_X1S_INPUT_FINALIZE_HEADER = _hex_to_bytes(
    "01 00 01 01 00 01 00 0b 01 0b 1c 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
)

_ROKU_X1S_INPUT_FINALIZE_TAIL = _hex_to_bytes(
    "fc 00 01 fc 01 01 01 00 fc 01 fc 01 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00"
)


class WifiDeviceMixin:
    """Mixin providing the wifi-command and IP-button create flows."""

    def _build_wifi_device_payload(
        self,
        *,
        device_name: str,
        ip_address: str,
        state_byte: int,
        device_id: int = 0xFF,
        device_class_byte: int = 0x01,
        ip_device: bool = False,
        brand_name: str = "m3tac0de",
        wifi_power_state: tuple[int, int, int] | None = None,
    ) -> bytes:
        """Serialise a wifi-callback device record into the family-0x07 body.

        Wifi devices share the same on-the-wire body shape as IR/BT/RF
        devices (120 bytes on X1, 210 bytes on X1S/X2 -- terminated by a
        body-checksum byte and wrapped in the standard ``[01][seq_be]``
        page header). This routes wifi creates through the canonical
        :func:`build_device_create_payload` so the same builder/parser
        round-trip applies, instead of hand-patching offsets into a
        captured hex blob.

        The Roku-on-X1 and IP-generic-on-X1S/X2 variants differ in three
        structured fields rather than in body shape:

        - ``code_type`` -- ``0x0A`` for the Roku launcher class,
          ``0x1C`` for the IP-generic class.
        - tail IP marker -- present (``fc 55 [ip]``) on Roku, suppressed
          on IP-generic (the destination address is carried inside each
          command payload instead of the device record).
        - the ``state_byte`` argument maps onto ``power_mode`` for the
          Roku flow (the X1 power-mode default of ``1`` for the
          ``tail_marker`` is preserved) and onto ``tail_marker`` for the
          IP-generic flow (which leaves ``power_mode`` / ``power_style``
          at zero). ``wifi_power_state`` overrides both with an explicit
          ``(power_mode, power_style, tail_marker)`` triple, used when
          the caller is committing a fully-configured device record.

        ``device_class_byte`` is accepted for caller-shape parity but
        no longer affects the wire body; the body's sub-marker is
        always ``0x01`` per the canonical schema.
        """

        del device_class_byte  # legacy parameter; the body sub-marker is fixed.

        if wifi_power_state is not None:
            power_mode = wifi_power_state[0] & 0xFF
            power_style = wifi_power_state[1] & 0xFF
            tail_marker = wifi_power_state[2] & 0xFF
        elif ip_device:
            # IP-generic devices keep the power fields at zero; the
            # state byte drives the commit marker (``tail_marker``).
            power_mode = 0
            power_style = 0
            tail_marker = state_byte & 0xFF
        else:
            # Roku-on-X1 flow: the state byte drives the power-mode
            # field. The commit marker stays at the X1 firmware's
            # historical default of ``1`` for this device class.
            power_mode = state_byte & 0xFF
            power_style = 2
            tail_marker = 1

        config = DeviceConfig(
            name=device_name,
            brand=brand_name,
            device_id=device_id & 0xFF,
            record_kind=0,
            icon=1,
            sort=0,
            code_type=(0x1C if ip_device else 0x0A),
            device_type=0x10,
            code_id=b"\x00" * 16,
            hide=0,
            input_flag=0,
            channel=0,
            power_state=0,
            ip_address=(None if ip_device else ip_address),
            poll_time=0,
            input_mode=2,
            power_mode=power_mode,
            power_style=power_style,
            share_mode=0,
            tail_marker=tail_marker,
        )
        return build_device_create_payload(config, hub_version=self.hub_version)

    def _cache_created_wifi_device(
        self,
        *,
        device_id: int,
        device_name: str,
        brand_name: str,
        device_class: str,
        device_class_code: int,
    ) -> None:
        dev_lo = device_id & 0xFF
        self.state.devices[dev_lo] = normalize_device_entry(
            {"brand": brand_name, "name": device_name},
            default_class=device_class,
            default_class_code=device_class_code,
        )

    def _build_device_power_binding_payload(
        self,
        *,
        device_id: int,
        button_id: int,
        command_id: int | None,
    ) -> bytes:
        """Build the family-0x12 payload that binds a wifi device's POWER button.

        The wire layout is identical to the standard macro-save body used by
        the activity power-macro flow: a one-row binding keyed on the
        device id and the POWER_ON / POWER_OFF button, optionally pointing
        at a wifi command slot to invoke. When command_id is None the body
        carries an empty key sequence, which the hub treats as an unbound
        slot during initial device creation.

        The X1 firmware variant carries the slot's command code embedded in
        the row's fid field; the newer firmware variant looks the code up
        by slot id internally and the fid is left zero.
        """

        label = "POWER_ON" if button_id == ButtonName.POWER_ON else "POWER_OFF"

        if command_id is None:
            key_sequence: list[MacroKeyEntry] = []
        else:
            if command_id < 1 or command_id > len(_ROKU_APP_SLOTS):
                raise ValueError(f"Unsupported power command_id {command_id}")

            _slot_id, command_code = _ROKU_APP_SLOTS[command_id - 1]
            # Per-variant schema property: on X1 the row's fid field
            # carries the synthetic command code; on X1S/X2 the hub
            # looks the code up by slot id and the fid is zero. The
            # same convention appears in the wifi-inputs entry build
            # path in :mod:`lib.inputs` (see ``InputEntry.fid`` use in
            # ``_apply_wifi_input_configuration``).
            row_fid = command_code if self.hub_version == HUB_VERSION_X1 else 0
            key_sequence = [
                MacroKeyEntry(
                    device_id=device_id & 0xFF,
                    key_id=command_id & 0xFF,
                    fid=row_fid,
                    duration=0,
                    delay=0xFF,
                )
            ]

        return build_macro_save_payload(
            activity_id=device_id,
            key_id=button_id,
            key_sequence=key_sequence,
            label=label,
            hub_version=self.hub_version,
        )

    def _build_virtual_ip_wifi_input_finalize_payload(
        self,
        *,
        device_id: int,
        device_name: str,
        brand_name: str,
    ) -> bytes:
        """Build the X1S/X2 wifi-create finalize payload.

        Despite the historical name (it was once filed under the
        family-0x46 "inputs" umbrella) this is a family-0x08 step that
        commits the new wifi device's identity and signals the hub to
        publish it. Phase 7 of the protocol refactor folds this into
        the unified ``run_device_create`` orchestrator; it lives here
        in the meantime so the wifi-create flow keeps working.
        """

        payload = bytearray()
        payload.extend(_ROKU_X1S_INPUT_FINALIZE_HEADER)
        payload[7] = device_id & 0xFF
        payload[9] = device_id & 0xFF
        payload.extend(b"\x4d\x00")
        payload.extend(b"\x00" + device_name.encode("utf-16le")[:59].ljust(59, b"\x00"))
        payload.extend(b"\x00" + brand_name.encode("utf-16le")[:59].ljust(59, b"\x00"))
        payload.extend(_ROKU_X1S_INPUT_FINALIZE_TAIL)
        payload[-1] = (sum(payload[:-1]) - 0x02) & 0xFF
        return bytes(payload)

    def _send_virtual_ip_wifi_publish_finalize(
        self,
        *,
        device_id: int,
        device_name: str,
        brand_name: str,
    ) -> bool:
        """Send the X1S/X2 wifi-device "publish identity" finalize (0xD508).

        Despite living near the inputs flow historically, this step is
        what flips the hub-side "device configured" flag on X1S/X2 and
        must run on every wifi-create regardless of whether the caller
        configured any input slots. (The canonical family-0x08 device
        record finalize sent earlier in the create flow is not enough on
        these variants -- the firmware also needs this identity-publish
        body, which carries a fixed bookend header/tail wrapped around
        the device_id, name, and brand.)
        """

        finalize_payload = self._build_virtual_ip_wifi_input_finalize_payload(
            device_id=device_id,
            device_name=device_name,
            brand_name=brand_name,
        )
        self._log.info(
            "[WIFI][STEP] publish-finalize tx opcode=0x%04X expect_ack=0x0103 first_byte=* attempt=1/1",
            0xD508,
        )
        send_ts = time.monotonic()
        self._send_cmd_frame(0xD508, finalize_payload)
        ack = self.wait_for_ack_any([(0x0103, None)], timeout=5.0, not_before=send_ts)
        if ack is None:
            self._log.warning(
                "[WIFI][STEP] publish-finalize failed waiting ack=0x0103 first_byte=*"
            )
            return False
        self._log.info("[WIFI][STEP] publish-finalize acked via 0x%04X", ack[0])
        return True

    def _wait_for_wifi_input_refresh(
        self,
        *,
        device_id: int,
        command_id: int,
        timeout: float = 5.0,
    ) -> bool:
        dev_lo = device_id & 0xFF
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            device_commands = self.state.commands.get(dev_lo, {})
            if command_id in device_commands:
                return True
            time.sleep(0.05)
        self._log.warning(
            "[WIFI] timeout waiting for input refresh dev=0x%02X slot=%d",
            dev_lo,
            command_id,
        )
        return False

    def _apply_wifi_input_configuration(
        self,
        *,
        device_id: int,
        device_name: str,
        ip_address: str,
        brand_name: str,
        commands: list[Any],
        input_command_ids: list[int] | None,
    ) -> bool:
        if not input_command_ids:
            return True

        if self.hub_version not in (HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2):
            self._log.info(
                "[WIFI] input configuration is not yet implemented for hub version %s; skipping ids=%s",
                self.hub_version,
                input_command_ids,
            )
            return True

        self._send_cmd_frame(OP_REQ_ACTIVITY_INPUTS, bytes([device_id & 0xFF]))
        burst = self.wait_for_activity_inputs_burst(timeout=5.0)
        if not burst.ok:
            self._log.warning(
                "[WIFI] missing activity-input candidates before input config dev=0x%02X (%s)",
                device_id & 0xFF,
                burst.outcome.value,
            )
            return False

        wifi_entries: list[InputEntry] = []
        for ordinal, command_id in enumerate(input_command_ids, start=1):
            label = _wifi_command_label(commands[command_id - 1], command_id - 1)
            _slot_id, command_code = _ROKU_APP_SLOTS[command_id - 1]
            # On X1 the entry's fid field carries the same code byte the
            # keymap layer would; X1S/X2 keeps the field zero (the wide
            # ordinal byte already disambiguates entries).
            row_fid = command_code if self.hub_version == HUB_VERSION_X1 else 0
            wifi_entries.append(
                InputEntry(
                    key_id=command_id & 0xFF,
                    fid=row_fid,
                    ordinal=ordinal,
                    label=label,
                )
            )

        input_config_payload = build_inputs_write(
            hub_version=self.hub_version,
            device_id=device_id,
            entries=wifi_entries,
        )

        page_payloads = self._build_paged_macro_save_payloads(input_config_payload)
        for seq, page_payload in enumerate(page_payloads, start=1):
            _step = self._send_step(
                step_name=f"input-config-save[{seq}/{len(page_payloads)}]",
                family=0x46,
                payload=page_payload,
                ack_opcode=0x0103,
            )
            if not _step.ok:
                return False

        for command_id in input_command_ids:
            dev_commands = self.state.commands.get(device_id & 0xFF)
            if isinstance(dev_commands, dict):
                dev_commands.pop(command_id, None)
            self._log.info(
                "[WIFI] refresh input-config entry dev=0x%02X slot=%d",
                device_id & 0xFF,
                command_id,
            )
            self._send_cmd_frame(OP_REQ_BLOB, bytes([device_id & 0xFF, command_id & 0xFF]))
            if not self._wait_for_wifi_input_refresh(
                device_id=device_id,
                command_id=command_id,
                timeout=5.0,
            ):
                return False

        # X1 re-runs the canonical family-0x08 device-record finalize
        # after writing inputs; the X1S/X2 identity-publish finalize
        # (0xD508 with a different body shape) is sent unconditionally
        # by :meth:`_run_wifi_create_virtual_ip` so it also fires when
        # no inputs are configured.
        if self.hub_version == HUB_VERSION_X1:
            finalize_payload = self._build_wifi_device_payload(
                device_name=device_name,
                ip_address=ip_address,
                state_byte=0x01,
                device_id=device_id,
                brand_name=brand_name,
            )
            _step = self._send_step(
                step_name="input-config-finalize",
                family=0x08,
                payload=finalize_payload,
                ack_opcode=0x0103,
            )
            if not _step.ok:
                return False

        return True

    def _apply_wifi_power_configuration(
        self,
        *,
        device_id: int,
        device_name: str,
        ip_address: str,
        brand_name: str,
        power_on_command_id: int | None,
        power_off_command_id: int | None,
    ) -> bool:
        if power_on_command_id is None and power_off_command_id is None:
            return True

        payload_7b08 = self._build_wifi_device_payload(
            device_name=device_name,
            ip_address=ip_address,
            state_byte=0x01,
            device_id=device_id,
            brand_name=brand_name,
            wifi_power_state=(0x01, 0x03, 0x01),
        )
        _step = self._send_step(
            step_name="power-config-7b08",
            family=0x08,
            payload=payload_7b08,
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return False

        _step = self._send_step(
            step_name="power-config-enable",
            family=0x41,
            payload=bytes([device_id, 0x01]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return False

        for button_id, command_id, name in (
            (ButtonName.POWER_ON, power_on_command_id, "POWER_ON"),
            (ButtonName.POWER_OFF, power_off_command_id, "POWER_OFF"),
        ):
            payload = self._build_device_power_binding_payload(
                device_id=device_id,
                button_id=button_id,
                command_id=command_id,
            )
            _step = self._send_step(
                step_name=f"power-config[{name}]",
                family=0x12,
                payload=payload,
                ack_opcode=0x0112,
                ack_first_byte=button_id,
                ack_fallback_opcodes=(0x0103,),
            )
            if not _step.ok:
                return False

        return True

    def _apply_virtual_ip_wifi_power_configuration(
        self,
        *,
        device_id: int,
        device_name: str,
        ip_address: str,
        brand_name: str,
        power_on_command_id: int | None,
        power_off_command_id: int | None,
    ) -> bool:
        if power_on_command_id is None and power_off_command_id is None:
            return True

        payload_d508 = self._build_wifi_device_payload(
            device_name=device_name,
            ip_address=ip_address,
            state_byte=0x01,
            device_id=device_id,
            ip_device=True,
            brand_name=brand_name,
        )
        _step = self._send_step(
            step_name="power-config-d508",
            family=0x08,
            payload=payload_d508,
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return False

        _step = self._send_step(
            step_name="power-config-enable",
            family=0x41,
            payload=bytes([device_id, 0x01]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return False

        for button_id, command_id, name in (
            (ButtonName.POWER_ON, power_on_command_id, "POWER_ON"),
            (ButtonName.POWER_OFF, power_off_command_id, "POWER_OFF"),
        ):
            if command_id is None:
                continue
            payload = self._build_device_power_binding_payload(
                device_id=device_id,
                button_id=button_id,
                command_id=command_id,
            )
            _step = self._send_step(
                step_name=f"power-config[{name}]",
                family=0x12,
                payload=payload,
                ack_opcode=0x0112,
                ack_first_byte=button_id,
                ack_fallback_opcodes=(0x0103,),
            )
            if not _step.ok:
                return False

        return True

    def create_wifi_device(
        self,
        device_name: str = "Home Assistant",
        commands: list[Any] | None = None,
        request_port: int = 8060,
        brand_name: str = "m3tac0de",
        power_on_command_id: int | None = None,
        power_off_command_id: int | None = None,
        input_command_ids: list[int] | None = None,
    ) -> dict[str, Any] | None:
        """Build a network-callback :class:`DeviceCreateRequest` and run it.

        Thin adapter over :func:`run_device_create`; the dict return
        value preserves the legacy contract used by service / WS
        callers.
        """

        if not self.can_issue_commands():
            self._log.info("[WIFI] create_wifi_device ignored: proxy client is connected")
            return None
        normalized_commands = list(commands or [])
        request = DeviceCreateRequest(
            transport="network_callback",
            network_callback_profile={
                "device_name": device_name,
                "brand_name": brand_name,
                "ip_address": self.get_routed_local_ip(),
                "request_port": request_port,
                "slots": normalized_commands,
                "power_on_command_id": power_on_command_id,
                "power_off_command_id": power_off_command_id,
                "input_command_ids": _validate_wifi_input_ids(
                    input_command_ids, max_command_id=len(normalized_commands)
                ),
            },
        )
        result = run_device_create(self, request)
        if not result.success or result.device_id is None:
            return None
        return {"device_id": result.device_id, "status": "success"}

    def _run_network_callback_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        """Dispatch the WiFi-create pipeline by hub variant.

        Both per-variant pipelines (Roku-on-X1, IP-generic-on-X1S/X2)
        read their inputs from ``request.network_callback_profile``;
        the variant selection itself is local to this method so the
        :class:`DeviceCreateRequest` surface stays variant-agnostic.

        Each internal pipeline still returns the legacy
        ``{"device_id": ..., "status": "success"} | None`` shape; the
        conversion to :class:`DeviceCreateResult` lives here so the
        wifi-write bodies can stay focused on wire orchestration. The
        ``restored_inputs`` counter reflects the input slots requested
        by the caller (non-zero only when input switching was wired in
        via ``input_command_ids``); the wifi pipelines do not write
        backup-style ``commands`` / ``button_bindings`` / ``macros``
        rows so the other counters stay at zero.
        """

        profile = request.network_callback_profile or {}
        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            legacy = self._run_wifi_create_virtual_ip(profile)
        else:
            legacy = self._run_wifi_create_x1_roku(profile)
        if not legacy or legacy.get("device_id") is None:
            return DeviceCreateResult(
                success=False,
                failed_step_label="network-callback-create",
            )
        input_ids = profile.get("input_command_ids") or []
        return DeviceCreateResult(
            success=True,
            device_id=int(legacy["device_id"]) & 0xFF,
            restored_inputs=len(input_ids),
        )

    def _run_wifi_create_x1_roku(
        self, profile: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Run the X1 Roku-style WiFi-create sequence.

        Body relocated from the previous public ``create_wifi_device``
        method; inputs flow in through the network-callback profile
        dict carried on :class:`DeviceCreateRequest`.
        """

        device_name = str(profile.get("device_name") or "Home Assistant")
        brand_name = str(profile.get("brand_name") or "m3tac0de")
        ip_address = str(profile.get("ip_address") or self.get_routed_local_ip())
        normalized_commands = list(profile.get("slots") or [])
        power_on_command_id = profile.get("power_on_command_id")
        power_off_command_id = profile.get("power_off_command_id")
        normalized_input_command_ids = profile.get("input_command_ids")

        self.reset_ack_queues()
        self._log.info("[WIFI] starting exact Wifi Device create replay sequence")

        _step = self._send_step(
            step_name="create-device",
            family=0x07,
            payload=self._build_wifi_device_payload(device_name=device_name, ip_address=ip_address, state_byte=0x00, brand_name=brand_name),
            ack_opcode=0x0107,
        )
        if not _step.ok:
            return None

        device_id = self.wait_for_assigned_device_id(timeout=5.0)
        if device_id is None:
            self._log.warning("[WIFI] hub did not provide device id after create request")
            return None
        self._log.info("[WIFI] hub assigned device id=0x%02X", device_id)

        command_defs: list[tuple[int, int, str, str]] = []

        if normalized_commands:
            for idx, command_spec in enumerate(normalized_commands[: len(_ROKU_APP_SLOTS)]):
                slot, code = _ROKU_APP_SLOTS[idx]
                if isinstance(command_spec, dict):
                    command_name = _wifi_command_label(command_spec, idx)
                    trigger_name = str(
                        command_spec.get("trigger_name")
                        or command_spec.get("name")
                        or command_name
                    ).strip() or command_name
                    press_type = str(command_spec.get("press_type") or "short").strip().lower()
                else:
                    command_name = _wifi_command_label(command_spec, idx)
                    trigger_name = command_name
                    press_type = "short"
                command_index = int(command_spec.get("command_index", idx)) if isinstance(command_spec, dict) else idx
                action = self._build_launch_action_path(
                    device_id=device_id,
                    command_index=command_index,
                    press_type=press_type,
                )
                command_defs.append((slot, code, command_name, action))

        for slot, code, name, action in command_defs:
            if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
                name_utf16 = name.encode("utf-16le")[:59]
                name_blob = b"\x00" + name_utf16
                name_blob = name_blob.ljust(60, b"\x00")
            else:
                name_blob = name.encode("ascii", errors="ignore")[:30].ljust(30, b"\x00")
            action_blob = action.encode("ascii", errors="ignore")[:255]
            payload_base = (
                bytes([slot, 0x00, 0x01, 0x21, 0x00, 0x01, device_id, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x00])
                + code.to_bytes(2, "big")
                + name_blob
                + bytes([len(action_blob)])
                + action_blob
            )
            payload_token = (sum(payload_base) - (slot + 1)) & 0xFF
            payload = payload_base + bytes([payload_token])
            _step = self._send_step(
                step_name=f"define-command[{slot:02d}] {name}",
                family=0x0E,
                payload=payload,
                ack_opcode=0x0103,
            )
            if not _step.ok:
                return None

        for button_id, name in (
            (ButtonName.POWER_ON, "POWER_ON"),
            (ButtonName.POWER_OFF, "POWER_OFF"),
        ):
            payload = self._build_device_power_binding_payload(
                device_id=device_id,
                button_id=button_id,
                command_id=None,
            )
            _step = self._send_step(
                step_name=f"configure-power[{name}]",
                family=0x12,
                payload=payload,
                ack_opcode=0x0112,
                ack_first_byte=button_id,
                ack_fallback_opcodes=(0x0103,),
            )
            if not _step.ok:
                return None

        # Phase 10: the wifi-create "sync stage" mid-flow write is an
        # empty/disabled family-0x46 inputs page. Route through the
        # canonical builder so every family-0x46 send in the
        # integration originates from :func:`build_inputs_write`.
        _step = self._send_step(
            step_name="sync-stage-7746",
            family=0x46,
            payload=build_inputs_write(
                hub_version=self.hub_version,
                device_id=device_id,
                source_id_byte=0,
            ),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        _step = self._send_step(
            step_name="confirm-power-config",
            family=0x41,
            payload=bytes([device_id, 0x04]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        payload_7b08 = self._build_wifi_device_payload(
            device_name=device_name,
            ip_address=ip_address,
            state_byte=0x01,
            device_id=device_id,
            brand_name=brand_name,
        )
        _step = self._send_step(
            step_name="finalize-device-7b08",
            family=0x08,
            payload=payload_7b08,
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        _step = self._send_step(
            step_name="save-tail-0064",
            family=0x64,
            payload=b"",
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        self._cache_created_wifi_device(
            device_id=device_id,
            device_name=device_name,
            brand_name=brand_name,
            device_class=DEVICE_CLASS_WIFI_ROKU,
            device_class_code=0x0A,
        )

        if not self._apply_wifi_power_configuration(
            device_id=device_id,
            device_name=device_name,
            ip_address=ip_address,
            brand_name=brand_name,
            power_on_command_id=power_on_command_id,
            power_off_command_id=power_off_command_id,
        ):
            return None

        if not self._apply_wifi_input_configuration(
            device_id=device_id,
            device_name=device_name,
            ip_address=ip_address,
            brand_name=brand_name,
            commands=normalized_commands,
            input_command_ids=normalized_input_command_ids,
        ):
            return None

        self._log.info("[WIFI] replayed Wifi Device create sequence for dev=0x%02X", device_id)
        return {"device_id": device_id, "status": "success"}

    def _run_wifi_create_virtual_ip(
        self, profile: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Run the X1S/X2 virtual-IP WiFi-create sequence.

        Companion to :meth:`_run_wifi_create_x1_roku`; same dispatch
        surface (a network-callback profile dict), different on-the-
        wire shape (IP-generic family-0x0E payloads, the X1S/X2
        finalize step, and the IP power configuration pass).
        """

        device_name = str(profile.get("device_name") or "Home Assistant")
        brand_name = str(profile.get("brand_name") or "m3tac0de")
        ip_address = str(profile.get("ip_address") or self.get_routed_local_ip())
        commands = profile.get("slots")
        request_port = int(profile.get("request_port") or 8060)
        power_on_command_id = profile.get("power_on_command_id")
        power_off_command_id = profile.get("power_off_command_id")
        input_command_ids = profile.get("input_command_ids")

        self.reset_ack_queues()
        self._log.info("[WIFI] starting virtual IP Wifi Device create replay sequence")

        _step = self._send_step(
            step_name="create-device",
            family=0x07,
            payload=self._build_wifi_device_payload(device_name=device_name, ip_address=ip_address, state_byte=0x00, ip_device=True, brand_name=brand_name),
            ack_opcode=0x0107,
        )
        if not _step.ok:
            return None

        device_id = self.wait_for_assigned_device_id(timeout=5.0)
        if device_id is None:
            self._log.warning("[WIFI] hub did not provide device id after create request")
            return None

        request_ip = ipaddress.IPv4Address(ip_address).packed
        for idx, command_spec in enumerate((commands or [])[: len(_ROKU_APP_SLOTS)]):
            slot = (idx + 1) & 0xFF
            if isinstance(command_spec, dict):
                command_name = _wifi_command_label(command_spec, idx)
                trigger_name = str(
                    command_spec.get("trigger_name")
                    or command_spec.get("name")
                    or command_name
                ).strip() or command_name
                press_type = str(command_spec.get("press_type") or "short").strip().lower()
            else:
                command_name = _wifi_command_label(command_spec, idx)
                trigger_name = command_name
                press_type = "short"
            # Observed X1S/X2 0x?E0E payloads encode command labels in a 59-byte field.
            # Using 59 keeps downstream request bytes aligned so method parses as POST (not xPOST).
            command_utf16 = command_name.encode("utf-16le")[:59].ljust(59, b"\x00")
            command_index = int(command_spec.get("command_index", idx)) if isinstance(command_spec, dict) else idx
            request_blob = self._build_virtual_ip_http_request(
                host=ip_address,
                port=request_port,
                path=self._build_launch_action_path(
                    device_id=device_id,
                    command_index=command_index,
                    press_type=press_type,
                ),
            )
            payload_base = (
                bytes([slot, 0x00, 0x01, 0x03, 0x00, 0x01, device_id, 0x00, 0x1C])
                + (b"\x00" * 7)
                + command_utf16
                + request_ip
                + int(request_port & 0xFFFF).to_bytes(2, "big")
                + b"\x00"
                + bytes([len(request_blob) & 0xFF])
                + request_blob
            )
            payload_token = (sum(payload_base) - (slot + 1)) & 0xFF
            payload = payload_base + bytes([payload_token])
            _step = self._send_step(
                step_name=f"define-ip-command[{slot:02d}] {command_name}",
                family=0x0E,
                payload=payload,
                ack_opcode=0x0103,
            )
            if not _step.ok:
                return None

        _step = self._send_step(
            step_name="post-map-commit",
            family=0x41,
            payload=bytes([device_id, 0x04]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        # Phase 10: the wifi-create "sync stage" mid-flow write is an
        # empty/disabled family-0x46 inputs page. Route through the
        # canonical builder so every family-0x46 send in the
        # integration originates from :func:`build_inputs_write`.
        _step = self._send_step(
            step_name="sync-stage-7746",
            family=0x46,
            payload=build_inputs_write(
                hub_version=self.hub_version,
                device_id=device_id,
                source_id_byte=0,
            ),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        payload_7b08 = self._build_wifi_device_payload(
            device_name=device_name,
            ip_address=ip_address,
            state_byte=0x01,
            device_id=device_id,
            ip_device=True,
            brand_name=brand_name,
        )
        _step = self._send_step(
            step_name="finalize-device-7b08",
            family=0x08,
            payload=payload_7b08,
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        _step = self._send_step(
            step_name="save-tail-0064",
            family=0x64,
            payload=b"",
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        self._cache_created_wifi_device(
            device_id=device_id,
            device_name=device_name,
            brand_name=brand_name,
            device_class=DEVICE_CLASS_WIFI_IP,
            device_class_code=0x1C,
        )

        if not self._apply_virtual_ip_wifi_power_configuration(
            device_id=device_id,
            device_name=device_name,
            ip_address=ip_address,
            brand_name=brand_name,
            power_on_command_id=power_on_command_id,
            power_off_command_id=power_off_command_id,
        ):
            return None

        if not self._apply_wifi_input_configuration(
            device_id=device_id,
            device_name=device_name,
            ip_address=ip_address,
            brand_name=brand_name,
            commands=list(commands or []),
            input_command_ids=input_command_ids,
        ):
            return None

        # X1S/X2 firmware only marks the device as "configured" once the
        # identity-publish finalize lands, regardless of whether any
        # input slots were configured. Always run it after power and
        # input writes so it observes their final state.
        if not self._send_virtual_ip_wifi_publish_finalize(
            device_id=device_id,
            device_name=device_name,
            brand_name=brand_name,
        ):
            return None

        self._log.info("[WIFI] replayed virtual IP Wifi Device create sequence for dev=0x%02X", device_id)
        return {"device_id": device_id, "status": "success"}

    def _build_launch_action_path(
        self,
        *,
        device_id: int,
        command_index: int,
        press_type: str = "short",
    ) -> str:
        hub_action_id = self._stable_hub_action_id()
        normalized_press_type = "long" if str(press_type).lower() == "long" else "short"
        return f"launch/{hub_action_id}/{device_id}/{command_index}/{normalized_press_type}"

    def _build_virtual_ip_http_request(self, host: str, port: int, path: str) -> bytes:
        normalized_path = f"/{path.lstrip('/')}"
        return (
            f"POST {normalized_path} HTTP/1.1\r\n"
            f"Host:{host}:{int(port) & 0xFFFF}\r\n"
            "Content-Type:application/x-www-form-urlencoded\r\n"
            "\r\n"
        ).encode("ascii")

    def _stable_hub_action_id(self) -> str:
        """Return a stable hub identifier for WiFi command actions."""

        raw_mac = str(self.mdns_txt.get("MAC") or self.mdns_txt.get("mac") or "").strip()
        if raw_mac:
            normalized_mac = re.sub(r"[^0-9A-Fa-f]", "", raw_mac).lower()
            if normalized_mac:
                return normalized_mac

        return str(self.proxy_id).strip()

    def _build_virtual_device_frames(
        self,
        *,
        device_name: str,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
    ) -> list[tuple[int, bytes]]:
        name_blob = self._utf16le_padded(device_name, length=64)
        button_blob = self._utf16le_padded(button_name, length=64)
        method_blob = method.encode("utf-8")
        url_blob = url.encode("utf-8")
        header_blob = self._encode_headers(headers)

        create_payload = b"\x01\x00\x00\x00" + name_blob
        define_payload = (
            button_blob
            + self._encode_len_prefixed(method_blob)
            + self._encode_len_prefixed(url_blob)
            + self._encode_len_prefixed(header_blob)
        )
        prepare_payload = b"\x01\x00"
        finalize_payload = name_blob[:8] + button_blob[:8]

        return [
            (OP_CREATE_DEVICE_HEAD, create_payload),
            (OP_DEFINE_IP_CMD, define_payload),
            (OP_PREPARE_SAVE, prepare_payload),
            (OP_FINALIZE_DEVICE, finalize_payload),
            (OP_SAVE_COMMIT, b""),
        ]

    def _encode_http_request(self, method: str, url: str, headers: dict[str, str]) -> bytes:
        header_lines = "".join(f"{k}:{v}\r\n" for k, v in headers.items())
        request = f"{method} {url} HTTP/1.1\r\n{header_lines}\r\n"
        return request.encode("utf-8")

    def _build_existing_device_frame(
        self,
        *,
        device_id: int,
        button_id: int,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
    ) -> tuple[int, bytes]:
        """Construct the opcode/payload needed to add an IP command to an existing device."""

        header = bytes(
            [
                button_id & 0xFF,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                device_id & 0xFF,
                button_id & 0xFF,
                0x1C,
            ]
        ) + b"\x00" * 7

        payload = bytearray(header)
        payload.extend(self._utf16le_padded(button_name, length=64))
        payload.extend(self._encode_http_request(method, url, headers))
        return OP_DEFINE_IP_CMD_EXISTING, bytes(payload)

    # ------------------------------------------------------------------
    # Native frame builders (X1S/X2 hub protocol)
    # ------------------------------------------------------------------
    # The following helpers build raw frames for the hub's native binary
    # protocol (A5 5A frames) used by CMD=7 (create device), CMD=14
    # (sync key), and CMD=8 (commit device).  This path is faster and
    # more reliable than the virtual-device/Roku replay path because it
    # does not require the hub to be in an idle "create" state.
    # ------------------------------------------------------------------

    def _utf16be_padded(self, text: str, *, length: int) -> bytes:
        """Encode ``text`` as UTF-16BE, truncated/zero-padded to ``length`` bytes."""
        data = text.encode("utf-16-be")
        truncated = data[:length]
        return truncated + b"\x00" * max(0, length - len(truncated))

    def _build_native_frame(self, cmd: int, overhead: bytes, data: bytes) -> bytes:
        """Wrap ``overhead + data`` in an A5 5A native frame for ``cmd``."""
        payload = overhead + data
        frame = bytearray([SYNC0, SYNC1, len(payload) & 0xFF, cmd & 0xFF])
        frame.extend(payload)
        frame.append(_sum8(frame))
        return bytes(frame)

    def _build_device_data_x2(
        self,
        name: str,
        *,
        icon: int = 1,
        device_id: int = 0xFF,
        sign: int = 0,
        commit: bool = False,
        target_ip: str = "",
    ) -> bytes:
        """Build the 210-byte X1S/X2 device payload for CMD=7 (create) or CMD=8 (commit).

        For CMD=7 pass ``device_id=0xFF`` — the hub assigns a new ID.
        For CMD=8 pass the hub-assigned ``device_id``.
        ``powerModel=1`` (``cfg[11]``) tells the app that power settings
        have been configured, preventing the "Not configured" warning.
        """
        d = bytearray(210)
        d[0] = 0x01
        d[1:3] = (1).to_bytes(2, "big")
        d[3] = sign & 0xFF
        d[4] = device_id & 0xFF
        d[5] = icon & 0xFF
        d[6] = (device_id & 0xFF) if commit else 0x00
        d[7] = 28   # codeType: WiFi DIY
        d[8] = 16   # type: WiFi
        d[29:89] = self._utf16be_padded(name, length=60)
        d[89:149] = self._utf16be_padded(name, length=60)  # brand = name

        cfg = bytearray(60)
        if target_ip:
            cfg[0] = 0xFC
            cfg[1] = 0x55
            for i, octet in enumerate(target_ip.split(".")[:4]):
                cfg[2 + i] = int(octet) & 0xFF
        cfg[6] = 0xFC
        cfg[9] = 0xFC
        cfg[10] = 0x02  # inputModel: WiFi
        cfg[11] = 0x01  # powerModel=1: power settings present (prevents "Not configured")
        cfg[14] = 0xFC
        cfg[16] = 0xFC
        if commit:
            cfg[17] = 0x01
        d[149:209] = cfg
        d[209] = _sum8(d[:209])
        return bytes(d)

    def _build_key_frame_x2(
        self,
        *,
        key_index: int,
        total_keys: int,
        device_id: int,
        key_id: int,
        key_name: str,
        ip: str,
        port: int,
        pulse: str,
    ) -> bytes:
        """Build CMD=14 key-sync frame(s) in X1S/X2 format (81-byte overhead).

        Returns all pages concatenated as a single bytes object.
        ``key_index`` and ``key_id`` are 1-based; the caller must supply
        them correctly (1 for the first button, 2 for the second, etc.).
        """
        pulse_bytes = pulse.encode("ascii", errors="replace")
        pulse_len = len(pulse_bytes)

        ip_block = bytearray(pulse_len + 8)
        for i, p in enumerate(ip.split(".")[:4]):
            ip_block[i] = int(p) & 0xFF
        ip_block[4:6] = port.to_bytes(2, "big")
        ip_block[6:8] = pulse_len.to_bytes(2, "big")
        ip_block[8 : 8 + pulse_len] = pulse_bytes

        key_data_len = pulse_len + 81
        total_pages = (key_data_len + 246) // 247

        kd = bytearray(key_data_len)
        kd[0] = total_keys & 0xFF
        kd[1:3] = total_pages.to_bytes(2, "big")
        kd[3] = device_id & 0xFF
        kd[4] = key_id & 0xFF
        kd[5] = 0x1C   # codeType: WiFi DIY
        kd[12:72] = self._utf16be_padded(key_name, length=60)
        kd[72 : 72 + len(ip_block)] = ip_block
        kd[key_data_len - 1] = _sum8(kd[: key_data_len - 1])

        all_frames = bytearray()
        for page_idx in range(total_pages):
            offset = page_idx * 247
            end = min(offset + 247, key_data_len)
            chunk = kd[offset:end]
            f = bytearray()
            f.extend([SYNC0, SYNC1, (len(chunk) + 3) & 0xFF, NATIVE_CMD_SYNC_KEY])
            f.append((key_index + 1) & 0xFF)
            f.extend((page_idx + 1).to_bytes(2, "big"))
            f.extend(chunk)
            f.append(_sum8(f))
            all_frames.extend(f)
        return bytes(all_frames)

    def _build_ip_pulse(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        body: str = "",
    ) -> str:
        """Build the raw HTTP request string the hub sends when a key is pressed."""
        from urllib.parse import urlparse  # noqa: PLC0415

        parsed = urlparse(url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"

        parts = [f"{method} {path} HTTP/1.1\r\n", f"Host:{host}:{port}\r\n"]
        for k, v in headers.items():
            parts.append(f"{k}:{v}\r\n")
        if body:
            parts.append(f"Content-Length:{len(body.encode('ascii', errors='replace'))}\r\n")
        parts.append("\r\n")
        if body:
            parts.append(body)
        return "".join(parts)

    @staticmethod
    def _extract_host(url: str) -> str:
        from urllib.parse import urlparse  # noqa: PLC0415

        return urlparse(url).hostname or "127.0.0.1"

    @staticmethod
    def _extract_port(url: str) -> int:
        from urllib.parse import urlparse  # noqa: PLC0415

        parsed = urlparse(url)
        if parsed.port:
            return parsed.port
        return 443 if parsed.scheme == "https" else 80

    # ------------------------------------------------------------------
    # Native IP device creation
    # ------------------------------------------------------------------

    def create_ip_button(
        self,
        *,
        device_name: str,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
        body: str = "",
        icon: int = 1,
    ) -> dict[str, Any] | None:
        """Create a new IP device on the hub with one button.

        Uses the hub's native protocol: CMD=7 (create), CMD=14 (key sync),
        CMD=8 (commit), then REMOTE_SYNC.  Each frame is sent individually
        with a delay so the hub can process them one at a time.

        The caller should follow up with :meth:`disable_device_power_control`
        to set ``powerMode=4`` (no automatic power control) after creation.
        """
        if not self.can_issue_commands():
            self._log.info("[CREATE] create_ip_button ignored: proxy client is connected")
            return None

        overhead = b"\x01" + (1).to_bytes(2, "big")  # action=1, count=1

        # CMD=7: create device
        target_ip = self._extract_host(url)
        create_data = self._build_device_data_x2(
            device_name, device_id=0xFF, target_ip=target_ip, icon=icon,
        )
        create_frame = self._build_native_frame(NATIVE_CMD_CREATE_DEVICE, overhead, create_data)

        self.reset_ack_queues()
        self._log.info("[CREATE] sending CMD=7 (create) for '%s'", device_name)
        self.transport.send_local(create_frame)

        device_id = self.wait_for_assigned_device_id(timeout=3.0)
        if device_id is None:
            self._log.warning("[CREATE] hub did not assign device_id after CMD=7")
            return None
        self._log.info("[CREATE] hub assigned device_id=%d", device_id)

        # CMD=14: key sync — hub uses 1-based button slots
        pulse = self._build_ip_pulse(method, url, headers, body=body)
        key_frame = self._build_key_frame_x2(
            key_index=1,
            total_keys=1,
            device_id=device_id,
            key_id=1,
            key_name=button_name,
            ip=self._extract_host(url),
            port=self._extract_port(url),
            pulse=pulse,
        )

        time.sleep(1)
        self._log.info("[CREATE] sending CMD=14 (key sync) for '%s'", button_name)
        self.transport.send_local(key_frame)

        # CMD=8: commit
        commit_data = self._build_device_data_x2(
            device_name, device_id=device_id, commit=True,
            target_ip=target_ip, icon=icon,
        )
        commit_frame = self._build_native_frame(NATIVE_CMD_COMMIT_DEVICE, overhead, commit_data)

        time.sleep(1)
        self._log.info("[CREATE] sending CMD=8 (commit) dev=%d", device_id)
        self.transport.send_local(commit_frame)

        # REMOTE_SYNC
        sync_frame = self._build_frame(OP_REMOTE_SYNC, b"")
        time.sleep(1)
        self._log.info("[CREATE] sending REMOTE_SYNC")
        self.transport.send_local(sync_frame)

        time.sleep(1)
        self._log.info(
            "[CREATE] device '%s' created with id=%d, button='%s'",
            device_name, device_id, button_name,
        )
        return {
            "device_name": device_name,
            "button_name": button_name,
            "method": method,
            "url": url,
            "headers": headers,
            "device_id": device_id,
            "button_id": 1,
            "status": "success",
        }

    def add_ip_button_to_device(
        self,
        *,
        device_id: int,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
        key_index: int = 1,
        device_name: str | None = None,
        body: str = "",
        icon: int = 1,
    ) -> dict[str, Any] | None:
        """Add an IP-backed command to an existing device using the native protocol.

        ``key_index`` is the 1-based position of this button within the device.
        The caller must track and increment this for each additional button.
        ``device_name`` is needed for the CMD=8 commit frame; if omitted it is
        looked up from the local state cache.
        """
        if not self.can_issue_commands():
            self._log.info("[CREATE] add_ip_button_to_device ignored: proxy client is connected")
            return None

        if device_name is None:
            device_name = self.state.entities("device").get(
                device_id & 0xFF, {}
            ).get("name", f"Device {device_id}")

        overhead = b"\x01" + (1).to_bytes(2, "big")

        # CMD=14: key sync
        pulse = self._build_ip_pulse(method, url, headers, body=body)
        key_frame = self._build_key_frame_x2(
            key_index=key_index,
            total_keys=key_index,
            device_id=device_id,
            key_id=key_index,
            key_name=button_name,
            ip=self._extract_host(url),
            port=self._extract_port(url),
            pulse=pulse,
        )

        self._log.info(
            "[CREATE] sending CMD=14 (key sync) dev=%d key='%s'",
            device_id, button_name,
        )
        self.transport.send_local(key_frame)

        # CMD=8: commit
        target_ip = self._extract_host(url)
        commit_data = self._build_device_data_x2(
            device_name, device_id=device_id, commit=True,
            target_ip=target_ip, icon=icon,
        )
        commit_frame = self._build_native_frame(NATIVE_CMD_COMMIT_DEVICE, overhead, commit_data)

        time.sleep(1)
        self._log.info("[CREATE] sending CMD=8 (commit) dev=%d", device_id)
        self.transport.send_local(commit_frame)

        # REMOTE_SYNC
        sync_frame = self._build_frame(OP_REMOTE_SYNC, b"")
        time.sleep(1)
        self._log.info("[CREATE] sending REMOTE_SYNC")
        self.transport.send_local(sync_frame)

        time.sleep(1)
        self._log.info(
            "[CREATE] added button '%s' to device %d ('%s')",
            button_name, device_id, device_name,
        )
        return {
            "device_name": device_name,
            "button_name": button_name,
            "method": method,
            "url": url,
            "headers": headers,
            "device_id": device_id,
            "button_id": key_index,
            "status": "success",
        }

    def disable_device_power_control(self, device_id: int) -> bool:
        """Set ``powerMode=4`` (no automatic power control) for a device.

        Sends CMD=0x41 with ``[device_id, 0x04]`` to the hub, which maps to
        the app's "No, disable automatic power control" option in
        ``PowerConfigurationActivity``.  Must be called after the device is
        committed (CMD=8) so the hub recognises the device ID.
        """
        if not self.can_issue_commands():
            return False

        self.reset_ack_queues()
        self._log.info("[POWER] disabling automatic power control for dev=%d (powerMode=4)", device_id)
        return self._send_native_step(
            step_name=f"power-disable[dev={device_id}]",
            family=NATIVE_CMD_POWER_MODE_SET,
            payload=bytes([device_id, 0x04]),
            ack_opcode=0x0103,
            timeout=5.0,
        )


__all__ = ["WifiDeviceMixin"]
