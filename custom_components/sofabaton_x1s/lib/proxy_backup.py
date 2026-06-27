"""Cache export/import + catalog clearing mixin for :class:`X1Proxy`.

Provides the serialisable view of the proxy's in-memory catalog (used by
the persistent cache store and the control-panel websocket feed) along
with the small family of bulk-clear methods that prepare the proxy for
a fresh hub poll. The export side deliberately strips ``raw_body`` from
device entries -- those bytes are not JSON-safe and are re-populated on
the next catalog refresh after a restart.

The mixin owns no state of its own; all reads and writes go through
``self.state`` and the per-snapshot completion sets carried on the
``X1Proxy`` instance.
"""

from __future__ import annotations

import time
from typing import Any

from .protocol_const import OP_ERASE_CONFIGURATION
from .state_helpers import normalize_device_entry


class CacheBackupMixin:
    """Mixin providing cache export/import and catalog clearing."""

    def export_cache_state(self) -> dict[str, Any]:
        # ``raw_body`` is the original device record bytes kept in memory for
        # on-demand schema parsing (e.g. by the backup flow). It is excluded
        # from exports because:
        #   1) it is not JSON-serializable (bytes), and the export feeds both
        #      the persistent cache and the control-panel WS payload;
        #   2) it would not survive a JSON round-trip anyway, and is
        #      re-populated on the next catalog refresh after a restart.
        def _device_for_export(v: dict[str, Any]) -> dict[str, Any]:
            entry = dict(v)
            entry.pop("raw_body", None)
            return entry

        return {
            "banner_info": self.get_banner_info(),
            "devices": {str(k): _device_for_export(v) for k, v in self.state.entities("device").items()},
            "buttons": {str(k): sorted(v) for k, v in self.state.buttons.items()},
            "commands": {
                str(k): {str(cmd_id): label for cmd_id, label in commands.items()}
                for k, commands in self.state.commands.items()
            },
            "device_key_sorts": {
                str(k): dict(v) for k, v in self.state.device_key_sorts.items()
            },
            "ip_devices": {str(k): dict(v) for k, v in self.state.ip_devices.items()},
            "ip_buttons": {
                str(k): {str(btn_id): dict(meta) for btn_id, meta in buttons.items()}
                for k, buttons in self.state.ip_buttons.items()
            },
            "activity_macros": {
                str(k): list(macros) for k, macros in self.state.activity_macros.items()
            },
            "activity_command_refs": {
                str(k): [[dev_id, command_id] for dev_id, command_id in sorted(refs)]
                for k, refs in self.state.activity_command_refs.items()
            },
            "activity_favorite_slots": {
                str(k): [dict(slot) for slot in slots]
                for k, slots in self.state.activity_favorite_slots.items()
            },
            "activity_keybinding_slots": {
                str(k): [dict(slot) for slot in slots]
                for k, slots in self.state.activity_keybinding_slots.items()
            },
            "activity_members": {
                str(k): sorted(members)
                for k, members in self.state.activity_members.items()
            },
            "activity_favorite_labels": {
                str(k): [
                    {
                        "device_id": dev_id,
                        "command_id": command_id,
                        "label": label,
                    }
                    for (dev_id, command_id), label in labels.items()
                ]
                for k, labels in self.state.activity_favorite_labels.items()
            },
            "activity_keybinding_labels": {
                str(k): [
                    {
                        "device_id": dev_id,
                        "command_id": command_id,
                        "label": label,
                    }
                    for (dev_id, command_id), label in labels.items()
                ]
                for k, labels in self.state.activity_keybinding_labels.items()
            },
        }

    def import_cache_state(self, payload: dict[str, Any]) -> None:
        from .x1_proxy import _normalize_banner_model

        data = payload if isinstance(payload, dict) else {}

        banner_info = data.get("banner_info", {})
        if isinstance(banner_info, dict):
            sanitized: dict[str, Any] = {}
            model = _normalize_banner_model(banner_info.get("model"))
            if model:
                sanitized["model"] = model
            batch = str(banner_info.get("production_batch", "")).strip()
            if batch:
                sanitized["production_batch"] = batch
            firmware_version = banner_info.get("firmware_version")
            if isinstance(firmware_version, (int, float)):
                sanitized["firmware_version"] = int(firmware_version)
            name = str(banner_info.get("name", "")).strip()
            if name:
                sanitized["name"] = name
            with self._banner_info_lock:
                self._banner_info = sanitized
            if sanitized.get("model"):
                self.hub_version = str(sanitized["model"])
            self._banner_info_event.set()

        has_devices_catalog = "devices" in data
        devices = data.get("devices", {})
        self.state.devices = {
            int(k) & 0xFF: normalize_device_entry(v)
            for k, v in devices.items()
            if isinstance(v, dict)
        }
        self._devices_catalog_ready = has_devices_catalog and isinstance(devices, dict)

        buttons = data.get("buttons", {})
        self.state.buttons = {
            int(k) & 0xFF: {int(btn) & 0xFF for btn in v}
            for k, v in buttons.items()
            if isinstance(v, list)
        }

        self.state.commands.clear()
        commands = data.get("commands", {})
        for key, entity_commands in commands.items():
            if not isinstance(entity_commands, dict):
                continue
            ent_id = int(key) & 0xFF
            self.state.commands[ent_id] = {
                int(cmd_id) & 0xFF: str(label)
                for cmd_id, label in entity_commands.items()
            }

        self.state.device_key_sorts.clear()
        device_key_sorts = data.get("device_key_sorts", {})
        for key, sort_meta in device_key_sorts.items():
            if isinstance(sort_meta, dict):
                self.state.device_key_sorts[int(key) & 0xFF] = dict(sort_meta)

        ip_devices = data.get("ip_devices", {})
        self.state.ip_devices = {
            int(k) & 0xFF: dict(v) for k, v in ip_devices.items() if isinstance(v, dict)
        }

        self.state.ip_buttons.clear()
        ip_buttons = data.get("ip_buttons", {})
        for key, button_map in ip_buttons.items():
            if not isinstance(button_map, dict):
                continue
            ent_id = int(key) & 0xFF
            self.state.ip_buttons[ent_id] = {
                int(btn_id) & 0xFF: dict(meta)
                for btn_id, meta in button_map.items()
                if isinstance(meta, dict)
            }

        activity_macros = data.get("activity_macros", {})
        self.state.activity_macros = {
            int(k) & 0xFF: list(v)
            for k, v in activity_macros.items()
            if isinstance(v, list)
        }

        self.state.activity_command_refs.clear()
        activity_command_refs = data.get("activity_command_refs", {})
        for key, refs in activity_command_refs.items():
            if not isinstance(refs, list):
                continue
            act_lo = int(key) & 0xFF
            parsed_refs: set[tuple[int, int]] = set()
            for item in refs:
                if isinstance(item, (list, tuple)) and len(item) == 2:
                    parsed_refs.add((int(item[0]) & 0xFF, int(item[1]) & 0xFF))
            if parsed_refs:
                self.state.activity_command_refs[act_lo] = parsed_refs

        self.state.activity_favorite_slots.clear()
        activity_favorite_slots = data.get("activity_favorite_slots", {})
        for key, slots in activity_favorite_slots.items():
            if not isinstance(slots, list):
                continue
            act_lo = int(key) & 0xFF
            normalized_slots: list[dict[str, int]] = []
            for slot in slots:
                if not isinstance(slot, dict):
                    continue
                normalized_slots.append(
                    {
                        "button_id": int(slot.get("button_id", 0)) & 0xFF,
                        "device_id": int(slot.get("device_id", 0)) & 0xFF,
                        "command_id": int(slot.get("command_id", 0)) & 0xFF,
                        "source": str(slot.get("source", "cache")),
                    }
                )
            if normalized_slots:
                self.state.activity_favorite_slots[act_lo] = normalized_slots

        self.state.activity_keybinding_slots.clear()
        activity_keybinding_slots = data.get("activity_keybinding_slots", {})
        for key, slots in activity_keybinding_slots.items():
            if not isinstance(slots, list):
                continue
            act_lo = int(key) & 0xFF
            normalized_slots: list[dict[str, int]] = []
            for slot in slots:
                if not isinstance(slot, dict):
                    continue
                normalized_slots.append(
                    {
                        "button_id": int(slot.get("button_id", 0)) & 0xFF,
                        "device_id": int(slot.get("device_id", 0)) & 0xFF,
                        "command_id": int(slot.get("command_id", 0)) & 0xFF,
                        "source": str(slot.get("source", "cache")),
                    }
                )
            if normalized_slots:
                self.state.activity_keybinding_slots[act_lo] = normalized_slots

        self.state.activity_members.clear()
        activity_members = data.get("activity_members", {})
        for key, members in activity_members.items():
            if isinstance(members, list):
                self.state.activity_members[int(key) & 0xFF] = {int(member) & 0xFF for member in members}

        self.state.activity_favorite_labels.clear()
        activity_favorite_labels = data.get("activity_favorite_labels", {})
        for key, labels in activity_favorite_labels.items():
            if not isinstance(labels, list):
                continue
            act_lo = int(key) & 0xFF
            parsed_labels: dict[tuple[int, int], str] = {}
            for row in labels:
                if not isinstance(row, dict):
                    continue
                dev_id = int(row.get("device_id", 0)) & 0xFF
                command_id = int(row.get("command_id", 0)) & 0xFF
                label = str(row.get("label", "")).strip()
                if dev_id and command_id and label:
                    parsed_labels[(dev_id, command_id)] = label
            if parsed_labels:
                self.state.activity_favorite_labels[act_lo] = parsed_labels

        self.state.activity_keybinding_labels.clear()
        activity_keybinding_labels = data.get("activity_keybinding_labels", {})
        for key, labels in activity_keybinding_labels.items():
            if not isinstance(labels, list):
                continue
            act_lo = int(key) & 0xFF
            parsed_labels: dict[tuple[int, int], str] = {}
            for row in labels:
                if not isinstance(row, dict):
                    continue
                dev_id = int(row.get("device_id", 0)) & 0xFF
                command_id = int(row.get("command_id", 0)) & 0xFF
                label = str(row.get("label", "")).strip()
                if dev_id and command_id and label:
                    parsed_labels[(dev_id, command_id)] = label
            if parsed_labels:
                self.state.activity_keybinding_labels[act_lo] = parsed_labels

        has_activities_catalog = "activities" in data
        activities = data.get("activities", {})
        if has_activities_catalog and isinstance(activities, dict):
            self.state.activities = {
                int(k) & 0xFF: dict(v)
                for k, v in activities.items()
                if isinstance(v, dict)
            }
            self._activities_catalog_ready = True
        else:
            self._activities_catalog_ready = False

        self._commands_complete = set(self.state.commands.keys())
        self._macros_complete = set(self.state.activity_macros.keys())

        self._activity_map_complete = {
            act_lo
            for act_lo in set(self.state.activity_favorite_slots.keys())
            | set(self.state.activity_members.keys())
            | set(self.state.activity_command_refs.keys())
        }

        self._pending_button_requests.clear()
        self._pending_command_requests.clear()
        self._pending_macro_requests.clear()
        self._pending_activity_map_requests.clear()

    def clear_cached_entity_detail(self, ent_id: int, *, kind: str) -> None:
        ent_lo = ent_id & 0xFF
        if kind == "device":
            self.state.devices.pop(ent_lo, None)
            self.state.buttons.pop(ent_lo, None)
            self.state.commands.pop(ent_lo, None)
            self.state.device_key_sorts.pop(ent_lo, None)
            self.state.ip_devices.pop(ent_lo, None)
            self.state.ip_buttons.pop(ent_lo, None)
            self._commands_complete.discard(ent_lo)
            return

        if kind == "activity":
            self.state.activity_macros.pop(ent_lo, None)
            self.state.activity_members.pop(ent_lo, None)
            self.state.activity_favorite_slots.pop(ent_lo, None)
            self.state.activity_keybinding_slots.pop(ent_lo, None)
            self.state.activity_favorite_labels.pop(ent_lo, None)
            self.state.activity_keybinding_labels.pop(ent_lo, None)
            self.state.activity_command_refs.pop(ent_lo, None)
            self._macros_complete.discard(ent_lo)

    def get_known_device_ids(self) -> set[int]:
        """Return the set of device IDs currently known from the catalog."""
        return set(self.state.entities("device").keys()) | set(self.state.ip_devices.keys())

    def get_known_activity_ids(self) -> set[int]:
        """Return the set of activity IDs currently known from the catalog."""
        return set(self.state.entities("activity").keys())

    def get_cached_activity_detail_ids(self) -> set[int]:
        """Return activity IDs referenced by per-activity cached detail tables."""

        return (
            set(self.state.activity_macros.keys())
            | set(self.state.activity_members.keys())
            | set(self.state.activity_favorite_slots.keys())
            | set(self.state.activity_keybinding_slots.keys())
            | set(self.state.activity_favorite_labels.keys())
            | set(self.state.activity_keybinding_labels.keys())
            | set(self.state.activity_command_refs.keys())
        )

    def clear_devices_catalog(self) -> None:
        """Clear only the device name catalog before a fresh device list fetch.

        Deliberately does NOT clear per-device commands or ip_buttons — those are
        preserved for devices that still exist and pruned separately (via
        clear_cached_entity_detail) for devices that were removed.
        """
        self.state.devices.clear()
        self.state.ip_devices.clear()
        self._devices_catalog_ready = False

    def clear_activities_catalog(self) -> None:
        """Clear only the activity name catalog before a fresh activity list fetch.

        Deliberately does NOT clear per-activity keymaps, favorites, keybindings,
        or macros — those are not returned by OP_REQ_ACTIVITIES and would not be
        repopulated by the burst.  Per-activity detail data for removed activities
        is pruned separately via clear_cached_entity_detail.
        """
        self.state.activities.clear()
        self._activity_row_payloads.clear()
        self.state.set_hint(None)
        self._activities_catalog_ready = False

    def wipe_all_cached_state(self) -> None:
        """Drop every per-entity cache so a fresh catalog poll is required.

        Called by :meth:`erase_configuration` after the hub confirms it
        has wiped its persistent tables. Everything keyed by device or
        activity id is no longer valid; the next catalog request must
        start from zero. The banner / hub-identity state is preserved
        (the hub model didn't change) along with the proxy's transport
        and listener wiring.
        """

        # Top-level name catalogs (parallel to clear_devices_catalog +
        # clear_activities_catalog).
        self.clear_devices_catalog()
        self.clear_activities_catalog()

        # Per-device detail surfaces.
        self.state.commands.clear()
        self.state.device_key_sorts.clear()
        self.state.buttons.clear()
        if hasattr(self.state, "button_details"):
            self.state.button_details.clear()
        if hasattr(self.state, "command_metadata"):
            self.state.command_metadata.clear()
        self.state.ip_buttons.clear()
        self.state.ip_devices.clear()

        # Per-activity detail surfaces.
        self.state.activity_macros.clear()
        self.state.activity_members.clear()
        self.state.activity_favorite_slots.clear()
        self.state.activity_keybinding_slots.clear()
        self.state.activity_favorite_labels.clear()
        self.state.activity_keybinding_labels.clear()
        self.state.activity_command_refs.clear()

        # Completion / pending sets.
        self._commands_complete.clear()
        self._macros_complete.clear()
        self._activity_map_complete.clear()
        self._pending_button_requests.clear()
        self._pending_command_requests.clear()
        self._pending_macro_requests.clear()
        self._pending_activity_map_requests.clear()


    def erase_configuration(
        self,
        *,
        timeout: float = 120.0,
        settle_seconds: float = 2.0,
    ) -> bool:
        """Wipe the hub's user-visible configuration tables (opcode ``0x001D``).

        Sends the empty-payload erase frame, waits up to ``timeout``
        seconds for any first response from the hub, then clears the
        proxy's catalog mirrors and sleeps ``settle_seconds`` before
        returning so callers can immediately issue follow-up requests.

        Returns ``True`` on success, ``False`` when the hub disconnects
        before any response arrives or when no response arrives within
        ``timeout``.

        The hub commonly drops the session after the ack. A
        ``False`` return that's actually caused by a hub-initiated
        disconnect *after* an ack would be a misreport; the wait loop
        therefore requires the ack first and treats any later
        disconnect as the expected post-erase behaviour. See
        ``docs/protocol/erase.md`` for the wire layout.
        """

        if not self.can_issue_commands():
            self._log.info(
                "[ERASE] erase_configuration ignored: proxy client is connected"
            )
            return False

        self.clear_ack_queue()
        send_ts = time.monotonic()
        self._log.info(
            "[ERASE] sending opcode 0x%04X (timeout=%.0fs)",
            OP_ERASE_CONFIGURATION,
            timeout,
        )
        self._send_cmd_frame(OP_ERASE_CONFIGURATION, b"")

        def _disconnected() -> bool:
            # ``_hub_connected`` is updated by the transport bridge as
            # frames arrive / connections drop. A drop arriving before
            # any ack means the hub didn't even acknowledge the erase
            # request; treat as failure.
            return not getattr(self, "_hub_connected", True)

        result = self.wait_for_any_response(
            timeout=timeout,
            not_before=send_ts,
            disconnect_check=_disconnected,
        )
        if result is None:
            if _disconnected():
                self._log.warning(
                    "[ERASE] hub disconnected before any ack -- treating as failure"
                )
            else:
                self._log.warning(
                    "[ERASE] no response within %.0fs -- treating as failure",
                    timeout,
                )
            return False

        ack_opcode, ack_payload = result
        self._log.info(
            "[ERASE] hub answered opcode=0x%04X payload_len=%d -- wiping local caches",
            ack_opcode,
            len(ack_payload),
        )

        # The persistent tables on the hub are now empty; everything
        # we have cached locally is stale.
        self.wipe_all_cached_state()

        # The hub commonly cycles the session after the ack and needs
        # a moment before answering anything new. A brief sleep here
        # lets callers (e.g. the bundle-restore orchestrator) issue
        # follow-up requests immediately without retry loops.
        if settle_seconds > 0:
            time.sleep(settle_seconds)

        return True


__all__ = ["CacheBackupMixin"]
