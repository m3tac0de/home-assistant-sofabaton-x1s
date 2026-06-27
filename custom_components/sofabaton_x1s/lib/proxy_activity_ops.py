"""Activity-side write/edit-flow mixin for :class:`X1Proxy`.

Houses the operations the user invokes against an existing activity --
removing devices, confirming downstream activity-row updates after a
device delete, adding new commands to physical buttons, reordering /
deleting / appending favourites. Each operation walks the same three-
phase shape (map → stage → commit) implemented as a small handful of
``_send_step`` calls plus a final ``request_activity_mapping`` refresh.

The macro save and ack-wait helpers continue to live on the proxy
itself; this mixin only owns the orchestration of activity-level edits.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from .hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from .hub_logging import LogTag
from .device_create import build_button_binding_step, synthesize_command_code
from .protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    FAMILY_FAV_DELETE,
    FAMILY_FAV_ORDER_REQ,
    OP_ACTIVITY_ASSIGN_FINALIZE,
    OP_ACTIVITY_CONFIRM,
    OP_ACTIVITY_DEVICE_CONFIRM,
    OP_REQ_MACRO_LABELS,
)

log = logging.getLogger("x1proxy")


# Position of the tail token block inside a CATALOG_ROW_ACTIVITY payload.
# See the activity-row schema comment in ``opcode_handlers`` for details.
_ACTIVITY_ROW_TAIL_OFFSET_IN_PAYLOAD = 152
_ACTIVITY_ROW_TAIL_LEN = 60


class ActivityOpsMixin:
    """Mixin providing activity-edit orchestration."""

    def _wait_for_activity_map_burst(self, act_id: int, *, timeout: float = 5.0) -> bool:
        deadline = time.monotonic() + timeout
        act_lo = act_id & 0xFF
        while time.monotonic() < deadline:
            if act_lo in self._activity_map_complete:
                return True
            time.sleep(0.05)
        self._log.warning("[ACTMAP] timeout waiting for activity map burst act=0x%02X", act_lo)
        return False

    def _activities_requiring_confirmation(self) -> list[int]:
        targets: list[int] = []
        for act_lo, details in sorted(self.state.entities("activity").items()):
            if not isinstance(details, dict):
                continue
            if bool(details.get("needs_confirm", False)):
                targets.append(act_lo & 0xFF)
        return targets

    def _clear_x1s_confirm_flag(self, payload: bytes) -> bytes:
        """Return ``payload`` with the activity-row needs-confirm flag cleared.

        The flag lives at the value byte of the final ``fc XX fc YY`` sub-token
        pair inside the row's tail token block (see the activity-row schema
        comment in ``opcode_handlers``). Setting it to ``0x00`` tells the hub
        the user has acknowledged the impact of a device delete.
        """

        mutable = bytearray(payload)
        tail_start = _ACTIVITY_ROW_TAIL_OFFSET_IN_PAYLOAD
        tail_end = min(len(mutable), tail_start + _ACTIVITY_ROW_TAIL_LEN)
        if tail_end - tail_start < 4:
            return bytes(mutable)

        marker_indexes = [
            idx
            for idx in range(tail_start, tail_end - 3)
            if mutable[idx] == 0xFC and mutable[idx + 2] == 0xFC
        ]
        if marker_indexes:
            mutable[marker_indexes[-1] + 3] = 0x00
        return bytes(mutable)

    def _build_activity_confirm_payload(self, activity_id: int) -> bytes | None:
        act_lo = activity_id & 0xFF
        activity = self.state.entities("activity").get(act_lo)
        if not isinstance(activity, dict):
            return None

        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            row_payload = self._activity_row_payloads.get(act_lo)
            if isinstance(row_payload, (bytes, bytearray)) and len(row_payload) >= 120:
                return self._clear_x1s_confirm_flag(bytes(row_payload))

        name = str(activity.get("name", ""))
        encoded_name = name.encode("ascii", errors="ignore")[:60].ljust(60, b"\x00")
        active_flag = 0x01 if bool(activity.get("active", False)) else 0x02

        return (
            bytes([
                0x01,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                0x00,
                act_lo,
                0x01,
                active_flag,
            ])
            + (b"\x00" * 22)
            + encoded_name
            + bytes([0xFC, 0x00, 0xFC, 0x00])
            + (b"\x00" * 27)
        )

    def delete_device(self, device_id: int) -> dict[str, Any] | None:
        if not self.can_issue_commands():
            self._log.info("[DELETE] delete_device ignored: proxy client is connected")
            return None

        dev_lo = device_id & 0xFF
        self.reset_ack_queues()

        _step = self._send_step(
            step_name=f"delete-device[dev=0x{dev_lo:02X}]",
            family=0x09,
            payload=bytes([dev_lo]),
            ack_opcode=0x0103,
            timeout=120.0,
        )
        if not _step.ok:
            return None

        if not self.request_activities():
            self._log.warning("[DELETE] failed to refresh activities after deleting dev=0x%02X", dev_lo)
            return None

        deadline = time.monotonic() + 15.0
        while time.monotonic() < deadline:
            if self._burst.active and self._burst.kind == "activities":
                break
            time.sleep(0.01)
        while time.monotonic() < deadline:
            if not self._burst.active:
                break
            time.sleep(0.01)
        if self._burst.active:
            self._log.warning("[DELETE] timeout waiting for activities burst after deleting dev=0x%02X", dev_lo)
            return None

        confirmed_activities: list[int] = []
        for act_lo in self._activities_requiring_confirmation():
            confirm_payload = self._build_activity_confirm_payload(act_lo)
            if confirm_payload is None:
                self._log.warning("[DELETE] missing cached activity row for confirm act=0x%02X", act_lo)
                return None

            confirm_opcode = (
                OP_ACTIVITY_ASSIGN_FINALIZE
                if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2)
                else OP_ACTIVITY_CONFIRM
            )
            self._log.info("[DELETE] confirming updated activity act=0x%02X", act_lo)
            send_ts = time.monotonic()
            self._send_cmd_frame(confirm_opcode, confirm_payload)
            if self.wait_for_ack_any([(0x0103, None)], timeout=5.0, not_before=send_ts) is None:
                self._log.warning("[DELETE] missing ACK after activity confirm act=0x%02X", act_lo)
                return None

            activity = self.state.entities("activity").get(act_lo)
            if isinstance(activity, dict):
                activity["needs_confirm"] = False
            self.clear_entity_cache(act_lo, clear_buttons=True, clear_favorites=True, clear_macros=True)
            confirmed_activities.append(act_lo)

        self.state.devices.pop(dev_lo, None)
        self.state.buttons.pop(dev_lo, None)
        self.state.ip_devices.pop(dev_lo, None)
        self.state.ip_buttons.pop(dev_lo, None)
        self.clear_entity_cache(dev_lo)

        return {
            "device_id": dev_lo,
            "confirmed_activities": confirmed_activities,
            "status": "success",
        }

    def add_device_to_activity(
        self,
        activity_id: int,
        device_id: int,
        *,
        input_cmd_id: int | None = None,
    ) -> dict[str, Any] | None:
        """Add ``device_id`` to ``activity_id`` and replay POWER_ON/OFF macro updates."""

        if not self.can_issue_commands():
            self._log.info("[ACTIVITY_ASSIGN] add_device_to_activity ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF
        dev_lo = device_id & 0xFF

        self._log.info("[ACTIVITY_ASSIGN] start act=0x%02X (%d) add dev=0x%02X (%d)", act_lo, act_lo, dev_lo, dev_lo)

        self._activity_map_complete.discard(act_lo)
        # Refresh mapping-derived members/slots to avoid carrying stale entries
        # from prior bursts into a new assignment transaction.
        self.state.activity_members.pop(act_lo, None)
        self.state.activity_command_refs.pop(act_lo, None)
        self.state.activity_favorite_slots.pop(act_lo, None)
        self.state.activity_keybinding_slots.pop(act_lo, None)
        self.state.activity_favorite_labels.pop(act_lo, None)
        self.state.activity_keybinding_labels.pop(act_lo, None)
        self._clear_favorite_label_requests_for_activity(act_lo)

        if not self.request_activity_mapping(act_lo):
            self._log.warning("[ACTIVITY_ASSIGN] failed to request activity map for act=0x%02X", act_lo)
            return None
        if not self._wait_for_activity_map_burst(act_lo, timeout=5.0):
            return None

        current_members = self.state.get_activity_members(act_lo)
        if not current_members:
            # Fallback for older cached data paths where only favorites were parsed.
            current_members = sorted(
                {
                    int(slot.get("device_id", 0)) & 0xFF
                    for slot in self.state.get_activity_favorite_slots(act_lo)
                    if int(slot.get("device_id", 0)) & 0xFF
                }
            )
        if not current_members:
            self._log.warning("[ACTIVITY_ASSIGN] no existing members discovered for act=0x%02X", act_lo)

        ordered_members: list[int] = []
        for member in current_members + [dev_lo]:
            if member not in ordered_members:
                ordered_members.append(member)

        self._log.info("[ACTIVITY_ASSIGN] members before=%s target=%s", current_members, ordered_members)

        self.reset_ack_queues()

        for member in ordered_members:
            # Always send 0x00: the hub interprets this second byte as the
            # device's current power state (0x01 = on, 0x00 = off). The earlier
            # pattern of 0x01 for the first two rows was copied from a capture
            # where those devices happened to be on, causing the hub to mark them
            # as powered-on after every device-to-activity operation. Displacement
            # prevention comes from replaying the full ordered member list, not
            # from this flag value.
            include_flag = 0x00
            payload = bytes([member & 0xFF, include_flag])
            self._log.info(
                "[ACTIVITY_ASSIGN] confirm member dev=0x%02X include=0x%02X",
                member & 0xFF,
                include_flag,
            )
            send_ts = time.monotonic()
            self._send_cmd_frame(OP_ACTIVITY_DEVICE_CONFIRM, payload)
            if self.wait_for_ack_any([(0x0103, None)], timeout=5.0, not_before=send_ts) is None:
                self._log.warning(
                    "[ACTIVITY_ASSIGN] missing ACK after 0x024F dev=0x%02X include=0x%02X",
                    member & 0xFF,
                    include_flag,
                )
                return None

        input_index = 0
        if input_cmd_id is not None:
            resolved = self.query_device_input_index(dev_lo, input_cmd_id & 0xFF)
            if resolved is not None:
                input_index = resolved
            else:
                self._log.warning(
                    "[ACTIVITY_ASSIGN] input_cmd_id=0x%02X not found for dev=0x%02X; proceeding without input",
                    input_cmd_id & 0xFF,
                    dev_lo,
                )

        macro_updates: list[int] = []
        for macro_button in (ButtonName.POWER_ON, ButtonName.POWER_OFF):
            macro_name = BUTTONNAME_BY_CODE.get(macro_button, f"0x{macro_button:02X}")
            self._log.info("[ACTIVITY_ASSIGN] fetch macro act=0x%02X button=%s", act_lo, macro_name)
            self._send_cmd_frame(OP_REQ_MACRO_LABELS, bytes([act_lo, macro_button]))

            source_record = self.wait_for_macro_record(act_lo, macro_button, timeout=5.0)
            if source_record is None:
                self._log.warning(
                    "[ACTIVITY_ASSIGN] missing macro record act=0x%02X button=0x%02X",
                    act_lo,
                    macro_button,
                )
                return None

            updated_payload = self._build_macro_save_payload(
                source_record,
                device_id=dev_lo,
                button_id=macro_button,
                allowed_device_ids=set(ordered_members),
                input_index=input_index,
            )

            row_count = updated_payload[8] if len(updated_payload) >= 9 else 0
            page_payloads = self._build_paged_macro_save_payloads(updated_payload)
            self._log.info(
                "[ACTIVITY_ASSIGN] save macro act=0x%02X button=0x%02X payload=%dB rows=%d pages=%d",
                act_lo,
                macro_button,
                len(updated_payload),
                row_count,
                len(page_payloads),
            )
            if self.diag_dump:
                self._log.info("[ACTIVITY_ASSIGN] save macro payload (%dB)", len(updated_payload))

            macro_ack = self._send_paged_macro_save(
                payload=updated_payload,
                macro_button=macro_button,
                ack_timeout=5.0,
            )

            if macro_ack is None:
                return None

            ack_opcode, ack_payload = macro_ack
            if ack_opcode == 0x0112 and ack_payload and ack_payload[0] != (macro_button & 0xFF):
                self._log.info(
                    "[ACTIVITY_ASSIGN] macro save ack fallback act=0x%02X button=0x%02X ack=0x%02X",
                    act_lo,
                    macro_button,
                    ack_payload[0],
                )
            macro_updates.append(macro_button)

        self.clear_entity_cache(
            act_lo,
            clear_buttons=False,
            clear_favorites=False,
            clear_macros=True,
        )

        self._log.info("[ACTIVITY_ASSIGN] completed act=0x%02X add dev=0x%02X with macro updates", act_lo, dev_lo)
        return {
            "activity_id": act_lo,
            "device_id": dev_lo,
            "members_before": current_members,
            "members_confirmed": ordered_members,
            "macros_updated": macro_updates,
            "status": "success",
        }

    def _build_favorite_map_payload(
        self,
        *,
        activity_id: int,
        device_id: int,
        command_id: int,
        slot_id: int,
    ) -> bytes:
        payload = bytearray(
            [
                0x01,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                activity_id & 0xFF,
                slot_id & 0xFF,
                device_id & 0xFF,
                0x00,
                0x00,
                0x00,
                0x00,
            ]
        )
        cmd_lo = command_id & 0xFF
        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            payload.extend([0x4E, 0x20 + cmd_lo])
        else:
            payload.extend((0x4E24).to_bytes(2, "big"))
        payload.extend(
            [
                cmd_lo,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
            ]
        )
        payload.append((sum(payload) - 2) & 0xFF)
        return bytes(payload)

    def _build_favorite_stage_payload(self, activity_id: int, fav_count: int = 4) -> bytes:
        """Build the 0x61 stage payload for favorite writes.

        *fav_count* is the total number of favorites on the activity **after**
        the new entry has been registered by the hub (i.e. the fav_id returned
        in the 0x013E map ACK).  The payload encodes one ``(fav_id, slot)``
        pair per favorite in sequential order:

            01 01  02 02  03 03  …  [fav_count] [fav_count]

        The official app builds this list dynamically — it grows by one entry
        each time a favorite is added.  The previous hard-coded version stopped
        at exactly 4 pairs, which left any 5th-or-later favorite without a
        display slot, making it invisible on the physical remote's touch screen.
        """

        act_lo = activity_id & 0xFF
        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            payload = bytearray([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, act_lo])
            for i in range(1, max(1, fav_count) + 1):
                payload.append(i & 0xFF)  # fav_id
                payload.append(i & 0xFF)  # slot = fav_id (sequential 1-based)
            payload.append((sum(payload) - 2) & 0xFF)
            return bytes(payload)

        return bytes([0x00, 0x01, 0x01, 0x00, 0x01, act_lo, 0x01, 0x01, 0x6A])

    def _build_favorites_reorder_payload(
        self,
        act_lo: int,
        ordered_fav_ids: list[int],
    ) -> bytes:
        """Build the family-0x61 SET_FAVORITES_ORDER payload.

        Frame structure (app→hub):
            [01 00 01 01 00 01] [act_lo] [fav_id slot] × N [token]

        The token is computed with the same formula used by
        _build_favorite_stage_payload: ``(sum(payload_so_far) - 2) & 0xFF``.

        Verified against 5 captured reorder frames (N=5..9).
        """
        act_lo = act_lo & 0xFF
        payload = bytearray([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, act_lo])
        for slot_index, fav_id in enumerate(ordered_fav_ids, start=1):
            payload.append(fav_id & 0xFF)
            payload.append(slot_index & 0xFF)
        payload.append((sum(payload) - 2) & 0xFF)
        return bytes(payload)

    def request_favorites_order(self, activity_id: int) -> list[tuple[int, int]] | None:
        """Request the current favorites ordering from the hub for *activity_id*.

        Sends OP_FAV_ORDER_REQ (opcode 0x0162) and blocks until the hub replies
        with a family-0x63 response (parsed by FavoritesOrderHandler).

        Returns a list of ``(fav_id, slot)`` tuples sorted by slot (ascending),
        or ``None`` on timeout.
        """
        act_lo = activity_id & 0xFF
        self.reset_ack_queues()
        send_ts = time.monotonic()
        self._send_family_frame(FAMILY_FAV_ORDER_REQ, bytes([act_lo]))
        # FavoritesOrderHandler fires synthetic ack 0xFF63 with first byte = act_lo
        result = self.wait_for_ack_any([(0xFF63, act_lo)], timeout=5.0, not_before=send_ts)
        if result is None:
            self._log.warning("[FAV_ORDER] timeout waiting for hub response act=0x%02X", act_lo)
            return None
        return self.state.activity_favorites_order.get(act_lo)

    def _validate_favorite_fav_id(
        self,
        act_lo: int,
        fav_id: int,
        current_order: list[tuple[int, int]],
    ) -> int | None:
        """Validate that *fav_id* is a known quick-access identifier.

        X1S hubs may return a partial 0x63 favorites-order response even when
        the app's Macro & Favorite Keys UI exposes additional quick-access
        entries discovered through the activity keymap and macro caches. Treat
        the latest hub order as authoritative for ordering when present, but
        also accept cached quick-access ``button_id`` / macro ids as writable
        identifiers when they are visible for the activity.
        """

        fav_lo = fav_id & 0xFF
        if any((known_fav_id & 0xFF) == fav_lo for known_fav_id, _slot in current_order):
            return fav_lo
        if any(
            (int(slot.get("button_id", 0)) & 0xFF) == fav_lo
            for slot in self.state.get_activity_favorite_slots(act_lo)
        ):
            return fav_lo
        if any(
            (int(macro.get("command_id", 0)) & 0xFF) == fav_lo
            for macro in self.state.get_activity_macros(act_lo)
        ):
            return fav_lo
        return None

    def reorder_favorites(
        self,
        activity_id: int,
        ordered_fav_ids: list[int],
        *,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Re-order favorites for *activity_id* to match *ordered_fav_ids*.

        *ordered_fav_ids* is the list of quick-access ``fav_id`` values in the
        desired display order (first element = position 1). On X1S, the latest
        hub-order response may be partial; cached activity keymap/macros can
        still expose additional valid ids that the official app reorders.

        Protocol sequence (mirrors the Sofabaton app):
            1. family 0x61 SET_FAVORITES_ORDER → ACK 0x0103
            2. family 0x65 COMMIT              → ACK 0x0103
        """
        if not self.can_issue_commands():
            self._log.info("[FAV_REORDER] ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF

        # Fetch current ordering to validate the supplied fav_ids
        current_order = self.request_favorites_order(act_lo)
        if current_order is None:
            self._log.warning("[FAV_REORDER] could not fetch current order act=0x%02X", act_lo)
            return None

        ordered_fav_ids_checked: list[int] = []
        for fav_id in ordered_fav_ids:
            validated_fav_id = self._validate_favorite_fav_id(
                act_lo, fav_id, current_order
            )
            if validated_fav_id is None:
                self._log.warning(
                    "[FAV_REORDER] fav_id=0x%02X not present in hub order/cache for act=0x%02X, skipping",
                    fav_id & 0xFF,
                    act_lo,
                )
                continue
            ordered_fav_ids_checked.append(validated_fav_id)

        if not ordered_fav_ids_checked:
            self._log.warning("[FAV_REORDER] no valid fav_ids for act=0x%02X", act_lo)
            return None

        self.reset_ack_queues()

        _step = self._send_step(
            step_name=f"fav-reorder-61[act=0x{act_lo:02X}]",
            family=0x61,
            payload=self._build_favorites_reorder_payload(act_lo, ordered_fav_ids_checked),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        _step = self._send_step(
            step_name=f"fav-reorder-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        self.clear_entity_cache(act_lo, clear_buttons=False, clear_favorites=True, clear_macros=False)
        self.state.activity_favorites_order.pop(act_lo, None)
        self._activity_map_complete.discard(act_lo)
        if refresh_after_write:
            self.request_activity_mapping(act_lo)

        return {
            "activity_id": act_lo,
            "fav_ids": [f & 0xFF for f in ordered_fav_ids_checked],
            "status": "success",
        }

    def delete_favorite(
        self,
        activity_id: int,
        fav_id: int,
        *,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Delete the favorite identified by *fav_id* from *activity_id*.

        *fav_id* must be a hub-order favorite identifier returned by
        ``request_favorites_order`` / the Home Assistant ``get_favorites``
        service.

        The hub requires the remaining ordered list to be re-sent after the
        deletion.  This method first fetches the current ordering from the hub,
        removes the specified entry, then executes:

            1. family 0x10 DELETE_FAV (act_lo, fav_id) → ACK 0x0103  (~5 s hub delay)
            2. family 0x61 SET_FAVORITES_ORDER (remaining) → ACK 0x0103
            3. family 0x65 COMMIT                          → ACK 0x0103
        """
        if not self.can_issue_commands():
            self._log.info("[FAV_DELETE] ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF

        # Fetch current ordering so we can build the post-delete list
        current_order = self.request_favorites_order(act_lo)
        if current_order is None:
            self._log.warning("[FAV_DELETE] could not fetch current order act=0x%02X", act_lo)
            return None

        validated_fav_id = self._validate_favorite_fav_id(
            act_lo, fav_id, current_order
        )
        if validated_fav_id is None:
            self._log.warning(
                "[FAV_DELETE] fav_id=0x%02X not present in current order for act=0x%02X",
                fav_id & 0xFF,
                act_lo,
            )
            return None

        remaining_fav_ids = [fid for fid, _slot in current_order if fid != validated_fav_id]
        self._log.info(
            "[FAV_DELETE] act=0x%02X deleting fav_id=0x%02X; %d remaining",
            act_lo,
            validated_fav_id,
            len(remaining_fav_ids),
        )

        self.reset_ack_queues()

        # Step 1: signal deletion to hub (hub takes ~5 s to process)
        _step = self._send_step(
            step_name=f"fav-delete-10[act=0x{act_lo:02X} fav=0x{validated_fav_id:02X}]",
            family=FAMILY_FAV_DELETE,
            payload=bytes([act_lo, validated_fav_id]),
            ack_opcode=0x0103,
            timeout=7.5,
        )
        if not _step.ok:
            return None

        # Step 2: send the new (shorter) ordering
        _step = self._send_step(
            step_name=f"fav-delete-reorder-61[act=0x{act_lo:02X}]",
            family=0x61,
            payload=self._build_favorites_reorder_payload(act_lo, remaining_fav_ids),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        # Step 3: commit
        _step = self._send_step(
            step_name=f"fav-delete-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        self.clear_entity_cache(act_lo, clear_buttons=False, clear_favorites=True, clear_macros=False)
        self.state.activity_favorites_order.pop(act_lo, None)
        self._activity_map_complete.discard(act_lo)
        if refresh_after_write:
            self.request_activity_mapping(act_lo)

        return {
            "activity_id": act_lo,
            "deleted_fav_id": validated_fav_id,
            "remaining": len(remaining_fav_ids),
            "status": "success",
        }

    def command_to_favorite(
        self,
        activity_id: int,
        device_id: int,
        command_id: int,
        *,
        slot_id: int | None = None,
        refresh_after_write: bool = True,
        query_existing_order: bool = True,
    ) -> dict[str, Any] | None:
        """Add a command favorite to an arbitrary activity."""

        if not self.can_issue_commands():
            self._log.info("[FAVORITE] command_to_favorite ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF
        slot_lo = (0 if slot_id is None else slot_id) & 0xFF

        self.reset_ack_queues()

        # X1 only: query the current favorites order BEFORE the map step so we
        # know which (fav_id, slot) pairs to preserve in the stage payload.
        # On X1, macros share the same fav_id/slot namespace as command favorites
        # and must be included in the stage payload with their actual slot numbers.
        x1_existing_fav_ids: list[int] = []
        if self.hub_version == HUB_VERSION_X1 and query_existing_order:
            existing_order = self.request_favorites_order(act_lo) or []
            x1_existing_fav_ids = [
                fav_id
                for fav_id, _slot in sorted(existing_order, key=lambda x: x[1])
            ]
            self._log.info(
                "%s[STEP] favorite-map[act=0x%02X] x1 pre-existing order: %s",
                LogTag.ACTIVITY,
                act_lo,
                x1_existing_fav_ids,
            )

        # Step 1: Map — inlined so we can read the assigned fav_id from the
        # 0x013E ACK payload.  That fav_id is used to build the stage payload.
        map_step = f"favorite-map[act=0x{act_lo:02X} slot=0x{slot_lo:02X}]"
        map_payload = self._build_favorite_map_payload(
            activity_id=act_lo,
            device_id=dev_lo,
            command_id=cmd_lo,
            slot_id=slot_lo,
        )
        map_ack: tuple[int, bytes] | None = None
        for attempt in range(1, 3):  # retries=1 → 2 attempts total
            self._log.info(
                "%s[STEP] %s tx family=0x3E expect_ack=0x013E attempt=%d/2",
                LogTag.ACTIVITY,
                map_step,
                attempt,
            )
            send_ts = time.monotonic()
            self._send_family_frame(0x3E, map_payload)
            map_ack = self.wait_for_ack_any(
                [(0x013E, None), (0x0103, None)],
                timeout=7.5,
                not_before=send_ts,
            )
            if map_ack is not None:
                self._log.info("%s[STEP] %s acked via 0x%04X", LogTag.ACTIVITY, map_step, map_ack[0])
                break
            if attempt < 2:
                self._log.warning("%s[STEP] %s retrying after ack timeout", LogTag.ACTIVITY, map_step)
                time.sleep(0.15)
        if map_ack is None:
            self._log.warning("%s[STEP] %s failed waiting ack=0x013E", LogTag.ACTIVITY, map_step)
            return None

        # The 0x013E ACK payload's first byte is the hub-assigned fav_id.
        map_ack_opcode, map_ack_payload = map_ack
        new_fav_id: int | None = None
        if map_ack_opcode == 0x013E and map_ack_payload:
            new_fav_id = map_ack_payload[0] or None

        # Build the stage payload (Step 2) differently per hub version.
        #
        # X1: the stage payload must list ALL current entries (macros AND regular
        #     favorites) in their current slot order, followed by the new fav_id
        #     at the next slot.  The official app builds this by reading the
        #     current order before the map step and appending the new entry.
        #     Verified against captured traffic (log 04_x1_add_6_favorites).
        #
        # X1S/X2: sequential (i, i) pairs for i in 1..new_fav_id.  On these hubs
        #     macros are in a separate namespace and are not included here.
        #     Verified against captured traffic (log 02_x1s_add_6_favorites).
        if self.hub_version == HUB_VERSION_X1:
            ordered_ids = x1_existing_fav_ids + ([new_fav_id] if new_fav_id is not None else [])
            if not ordered_ids:
                ordered_ids = [1]  # last-resort fallback
            stage_payload = self._build_favorites_reorder_payload(act_lo, ordered_ids)
            stage_n = len(ordered_ids)
        else:
            fav_count: int = 4  # safe fallback matching previous hardcoded behaviour
            if new_fav_id is not None:
                fav_count = new_fav_id
            stage_payload = self._build_favorite_stage_payload(act_lo, fav_count)
            stage_n = fav_count

        _step = self._send_step(
            step_name=f"favorite-stage-61[act=0x{act_lo:02X} n={stage_n}]",
            family=0x61,
            payload=stage_payload,
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        _step = self._send_step(
            step_name=f"favorite-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        self.clear_entity_cache(act_lo, clear_buttons=False, clear_favorites=True, clear_macros=False)
        self._activity_map_complete.discard(act_lo)
        if refresh_after_write:
            self.request_activity_mapping(act_lo)

        return {
            "activity_id": act_lo,
            "device_id": dev_lo,
            "command_id": cmd_lo,
            "slot_id": slot_lo,
            "fav_id": new_fav_id,
            "status": "success",
        }

    def command_to_button(
        self,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
        *,
        long_press_device_id: int | None = None,
        long_press_command_id: int | None = None,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Map a device command to a physical activity button using 0x193E.

        When *long_press_device_id* and *long_press_command_id* are both
        provided the hub will also fire that command on a long-press of the
        same physical button.
        """

        if not self.can_issue_commands():
            self._log.info("[KEYMAP_WRITE] command_to_button ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF
        btn_lo = button_id & 0xFF
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF

        # Route through the canonical family-0x3E builder. The 0x193E
        # mapping a command-to-physical-button is the same wire shape
        # as the device-create button-binding step: the per-press
        # ``button_code`` is the X1 synthetic ``0x4E20 + cmd_lo``
        # carried on a 6-byte BE slot, and the per-press
        # ``button_id`` equals the bound ``cmd_lo``. The canonical
        # builder's "device_id" is the keymap entity id, which on
        # this path is the activity id.
        if long_press_device_id is not None and long_press_command_id is not None:
            long_press_kwargs = dict(
                long_press_device_id=long_press_device_id & 0xFF,
                long_press_button_code=synthesize_command_code(
                    long_press_command_id & 0xFF
                ),
                long_press_button_id=long_press_command_id & 0xFF,
            )
        else:
            long_press_kwargs = {}
        binding_step = build_button_binding_step(
            device_id=act_lo,
            button_id=btn_lo,
            short_press_device_id=dev_lo,
            short_press_button_code=synthesize_command_code(cmd_lo),
            short_press_button_id=cmd_lo,
            **long_press_kwargs,
        )
        payload = binding_step.payload
        if long_press_device_id is not None and long_press_command_id is not None:
            self._log.info(
                "[KEYMAP_WRITE] map act=0x%02X button=0x%02X dev=0x%02X cmd=0x%02X"
                " long_dev=0x%02X long_cmd=0x%02X",
                act_lo,
                btn_lo,
                dev_lo,
                cmd_lo,
                long_press_device_id & 0xFF,
                long_press_command_id & 0xFF,
            )
        else:
            self._log.info(
                "[KEYMAP_WRITE] map act=0x%02X button=0x%02X dev=0x%02X cmd=0x%02X",
                act_lo,
                btn_lo,
                dev_lo,
                cmd_lo,
            )
        if self.diag_dump:
            self._log.info("[KEYMAP_WRITE] 193E payload (%dB)", len(payload))

        self.reset_ack_queues()

        _step = self._send_step(
            step_name=f"keymap-write[act=0x{act_lo:02X} btn=0x{btn_lo:02X}]",
            family=0x3E,
            payload=payload,
            ack_opcode=0x013E,
            ack_first_byte=btn_lo,
            ack_fallback_opcodes=(0x0103,),
            timeout=7.5,
            retries=1,
            retry_delay=0.15,
        )
        if not _step.ok:
            return None

        _step = self._send_step(
            step_name=f"keymap-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        )
        if not _step.ok:
            return None

        self.clear_entity_cache(act_lo, clear_buttons=True, clear_favorites=False, clear_macros=False)
        self._activity_map_complete.discard(act_lo)
        if refresh_after_write:
            self.request_activity_mapping(act_lo)
            self.get_buttons_for_entity(act_lo, fetch_if_missing=True)

        result: dict[str, Any] = {
            "activity_id": act_lo,
            "button_id": btn_lo,
            "device_id": dev_lo,
            "command_id": cmd_lo,
            "status": "success",
        }
        if long_press_device_id is not None and long_press_command_id is not None:
            result["long_press_device_id"] = long_press_device_id & 0xFF
            result["long_press_command_id"] = long_press_command_id & 0xFF
        return result


__all__ = ["ActivityOpsMixin"]
