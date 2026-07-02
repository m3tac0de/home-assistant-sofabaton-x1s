"""X2 physical remote battery polling mixin for :class:`X1Proxy`."""

from __future__ import annotations

import time
from typing import Any

from .hub_versions import HUB_VERSION_X2
from .protocol_const import (
    FAMILY_REMOTE_STATUS,
    OP_REQ_REMOTE_STATUS,
    SYNC0,
    SYNC1,
)


def _sum8(b: bytes) -> int:
    return sum(b) & 0xFF


def _byte_at(raw: bytes, offset: int) -> int | None:
    return raw[offset] if 0 <= offset < len(raw) else None


def _hex_or_none(raw: bytes) -> str | None:
    return raw.hex(" ") if raw else None


def _decode_status_text(raw: bytes, offset: int) -> str | None:
    if offset >= len(raw):
        return None
    text = raw[offset:].split(b"\x00", 1)[0].decode("utf-8", errors="ignore").strip()
    return text or None


def _decode_x2_remote_status_reply(
    *,
    request_index: int,
    opcode: int,
    payload: bytes,
) -> dict[str, Any]:
    raw = bytes([SYNC0, SYNC1, (opcode >> 8) & 0xFF, opcode & 0xFF]) + payload
    raw += bytes([_sum8(raw)])
    if (opcode & 0xFF) != FAMILY_REMOTE_STATUS or len(raw) < 26:
        return {
            "ok": False,
            "error": "unexpected_reply",
            "request_index": request_index & 0xFF,
            "request_id": request_index & 0xFF,
            "opcode": opcode,
            "opcode_hex": f"0x{opcode:04X}",
            "payload_length": len(payload),
            "raw_hex": raw.hex(" "),
            "payload_hex": payload.hex(" "),
        }

    accessory_type = _byte_at(raw, 16)
    remote_id = int.from_bytes(raw[6:9], "big") if len(raw) >= 9 else None
    parsed = {
        "schema": "x2_rf_status",
        "id": remote_id,
        "remote_id": remote_id,
        "remote_id_hex": _hex_or_none(raw[6:9]) if len(raw) >= 9 else None,
        "accessory_id": remote_id,
        "battery": _byte_at(raw, 9),
        "hardware_version": _byte_at(raw, 10),
        "production_batch_hex": _hex_or_none(raw[11:15]) if len(raw) >= 15 else None,
        "firmware_version": _byte_at(raw, 15),
        "type": accessory_type,
        "online": _byte_at(raw, 17) == 1,
        "emitter_line_1": _byte_at(raw, 18) == 1,
        "name": _decode_status_text(raw, 25),
    }
    return {
        "ok": True,
        "request_index": request_index & 0xFF,
        "request_id": request_index & 0xFF,
        "opcode": opcode,
        "opcode_hex": f"0x{opcode:04X}",
        "payload_length": len(payload),
        "raw_hex": raw.hex(" "),
        "payload_hex": payload.hex(" "),
        "decoded": parsed,
        "battery": parsed["battery"],
        "remote_name": parsed["name"],
        "accessory_id": parsed["accessory_id"],
    }


class RemoteBatteryMixin:
    def poll_x2_remote_battery(self, *, timeout: float = 2.0) -> dict[str, Any]:
        """Request the current X2 remote status row when the hub is idle."""

        idx = 0
        request_payload = bytes([idx])
        request_frame = self._build_frame(OP_REQ_REMOTE_STATUS, request_payload)
        base_result: dict[str, Any] = {
            "ok": False,
            "skipped": False,
            "request_index": idx,
            "request_id": idx,
            "request_opcode": OP_REQ_REMOTE_STATUS,
            "request_opcode_hex": f"0x{OP_REQ_REMOTE_STATUS:04X}",
            "request_raw_hex": request_frame.hex(" "),
        }

        if self.hub_version != HUB_VERSION_X2:
            return {
                **base_result,
                "skipped": True,
                "error": "unsupported_hub_version",
                "message": "Remote battery polling is supported on X2 hubs only.",
            }

        if not self.can_issue_commands():
            return {
                **base_result,
                "skipped": True,
                "error": "transport_not_ready",
                "message": "Hub is not ready to accept local commands.",
            }

        if self._burst.active or self._burst.queue:
            pending = len(getattr(self._burst, "queue", []) or [])
            return {
                **base_result,
                "skipped": True,
                "error": "hub_busy",
                "message": (
                    f"Another hub operation is active: {self._burst.kind or 'unknown'}"
                    if self._burst.active
                    else f"Another hub operation is queued: {pending} pending"
                ),
            }

        def _request_once() -> dict[str, Any]:
            self.clear_ack_queue()
            send_ts = time.monotonic()
            if not self.enqueue_cmd(OP_REQ_REMOTE_STATUS, request_payload):
                return {
                    **base_result,
                    "skipped": True,
                    "error": "enqueue_failed",
                    "message": "Hub command queue declined the remote battery request.",
                }

            matched = self.wait_for_ack_family_low(
                FAMILY_REMOTE_STATUS,
                timeout=max(float(timeout), 0.1),
                not_before=send_ts,
            )
            if matched is None:
                return {
                    **base_result,
                    "error": "timeout",
                    "message": "Timed out waiting for a remote status reply.",
                }

            opcode, payload = matched
            result = _decode_x2_remote_status_reply(
                request_index=idx,
                opcode=opcode,
                payload=payload,
            )
            result.update(
                {
                    "skipped": False,
                    "request_opcode": OP_REQ_REMOTE_STATUS,
                    "request_opcode_hex": f"0x{OP_REQ_REMOTE_STATUS:04X}",
                    "request_raw_hex": request_frame.hex(" "),
                }
            )
            return result

        decoded = _request_once()
        if decoded.get("ok") and decoded.get("battery") == 0:
            time.sleep(0.35)
            confirm = _request_once()
            if confirm.get("ok") and confirm.get("battery") != 0:
                confirm["confirmed_after_zero"] = True
                confirm["first_zero_raw_hex"] = decoded.get("raw_hex")
                decoded = confirm
            else:
                decoded["unconfirmed_zero"] = True
                if confirm.get("ok"):
                    decoded["confirmed_zero_raw_hex"] = confirm.get("raw_hex")
        return decoded
