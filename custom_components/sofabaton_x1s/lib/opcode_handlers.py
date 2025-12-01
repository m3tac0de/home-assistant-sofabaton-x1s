from __future__ import annotations

"""Opcode-specific frame handlers used by :class:`~.x1_proxy.X1Proxy`."""

import time
from typing import TYPE_CHECKING

from .frame_handlers import BaseFrameHandler, FrameContext, register_handler
from .protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    OP_ACK_READY,
    OP_CATALOG_ROW_ACTIVITY,
    OP_CATALOG_ROW_DEVICE,
    OP_DEVBTN_EXTRA,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_PAGE_ALT1,
    OP_DEVBTN_PAGE_ALT2,
    OP_DEVBTN_PAGE_ALT3,
    OP_DEVBTN_PAGE_ALT4,
    OP_DEVBTN_PAGE_ALT5,
    OP_DEVBTN_TAIL,
    OP_KEYMAP_CONT,
    OP_KEYMAP_TBL_A,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_C,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_F,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_TBL_G,
    OP_CREATE_DEVICE_HEAD,
    OP_DEFINE_IP_CMD,
    OP_PREPARE_SAVE,
    OP_FINALIZE_DEVICE,
    OP_DEVICE_SAVE_HEAD,
    OP_SAVE_COMMIT,
    ACK_SUCCESS,
    OP_REQ_ACTIVATE,
    OP_REQ_BUTTONS,
    OP_REQ_COMMANDS,
    OP_REQ_ACTIVITIES,
    OP_X1_ACTIVITY,
    OP_X1_DEVICE,
)
from .x1_proxy import log

if TYPE_CHECKING:
    from .x1_proxy import X1Proxy


def _consume_length_prefixed_string(buf: bytes, offset: int) -> tuple[str, int]:
    """Decode a length-prefixed UTF-8 string from ``buf`` starting at ``offset``."""

    if offset >= len(buf):
        return "", offset

    length = buf[offset]
    start = offset + 1
    end = min(len(buf), start + length)
    try:
        return buf[start:end].decode("utf-8", errors="ignore").strip("\x00"), end
    except Exception:
        return "", end


def _extract_text_fields(payload: bytes, start: int, count: int = 2) -> list[str]:
    """Return up to ``count`` decoded fields from a length-prefixed payload segment."""

    cursor = start
    fields: list[str] = []
    for _ in range(count):
        text, cursor = _consume_length_prefixed_string(payload, cursor)
        fields.append(text)

    remaining = payload[cursor:]
    if remaining:
        parts = [p.decode("utf-8", errors="ignore").strip("\x00") for p in remaining.split(b"\x00") if p]
        for idx, part in enumerate(parts):
            if idx >= len(fields):
                break
            if not fields[idx]:
                fields[idx] = part

    return fields


def _decode_utf16le_segment(payload: bytes, *, start: int = 0, length: int | None = None) -> str:
    """Decode a UTF-16LE string from ``payload`` with optional bounds."""

    end = None if length is None else start + length
    segment = payload[start:end]
    if not segment:
        return ""
    try:
        return segment.decode("utf-16le", errors="ignore").strip("\x00")
    except Exception:
        return ""


def _decode_ascii_blocks(payload: bytes) -> list[str]:
    """Split an ASCII-ish payload into human-readable blocks."""

    decoded = payload.decode("utf-8", errors="ignore")
    parts = [p.strip("\x00") for p in decoded.replace("\r", "\n").split("\n") if p.strip("\x00")]
    return parts


def _parse_header_lines(lines: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in lines:
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        headers[key.strip()] = val.strip()
    return headers


def _parse_ip_command_fields(payload: bytes) -> tuple[str, str, dict[str, str]]:
    """Extract HTTP method, URL, and headers from an IP command payload."""

    method = ""
    url = ""
    headers: dict[str, str] = {}

    if payload:
        try:
            cursor = 0
            if cursor < len(payload):
                m_len = payload[cursor]
                cursor += 1
                method = payload[cursor : cursor + m_len].decode("utf-8", errors="ignore")
                cursor += m_len
            if cursor < len(payload):
                u_len = payload[cursor]
                cursor += 1
                url = payload[cursor : cursor + u_len].decode("utf-8", errors="ignore")
                cursor += u_len
            if cursor < len(payload):
                h_len = payload[cursor]
                cursor += 1
                header_blob = payload[cursor : cursor + h_len].decode("utf-8", errors="ignore")
                headers = _parse_header_lines(header_blob.split("\n"))
        except Exception:
            # fall through to heuristics
            pass

    ascii_parts = _decode_ascii_blocks(payload)
    for part in ascii_parts:
        if not method and part.isalpha():
            method = part.upper()
        if not url and part.lower().startswith("http"):
            url = part
        if ":" in part:
            headers |= _parse_header_lines([part])

    return method, url, headers

def _infer_command_entity(proxy: "X1Proxy", payload: bytes) -> int:
    """Best-effort guess of the entity a command burst belongs to."""

    burst_kind = getattr(proxy._burst, "kind", None)
    if burst_kind and ":" in burst_kind:
        prefix, ent_str = burst_kind.split(":", 1)
        if prefix == "commands":
            try:
                return int(ent_str)
            except ValueError:
                pass

    if len(payload) >= 8:
        return payload[7]

    return 0


def _extract_dev_id(raw: bytes, payload: bytes, opcode: int) -> int:
    """Determine device ID for a command burst frame."""

    if opcode in (OP_DEVBTN_HEADER, OP_DEVBTN_PAGE_ALT1) and len(raw) > 11:
        return raw[11]

    if len(payload) >= 4:
        return payload[3]

    return 0


@register_handler(opcodes=(OP_CREATE_DEVICE_HEAD,), directions=("A→H",))
class CreateVirtualDeviceHandler(BaseFrameHandler):
    """Capture app-initiated virtual device creation requests."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        device_name = _decode_utf16le_segment(payload, start=0, length=64) or _decode_utf16le_segment(payload)
        proxy.start_virtual_device(device_name=device_name)
        log.info("[CREATE] device name='%s' (%dB payload)", device_name, len(payload))


@register_handler(opcodes=(OP_DEFINE_IP_CMD,), directions=("A→H",))
class DefineIpCommandHandler(BaseFrameHandler):
    """Decode IP command metadata sent from the app."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        button_name = _decode_utf16le_segment(payload, start=0, length=64) or _decode_utf16le_segment(payload)
        method, url, headers = _parse_ip_command_fields(payload[64:])
        proxy.update_virtual_device(button_name=button_name, method=method, url=url, headers=headers)
        log.info(
            "[CREATE] button='%s' method=%s url='%s' headers=%s",
            button_name,
            method or "?",
            url,
            ", ".join(f"{k}: {v}" for k, v in headers.items()) if headers else "{}",
        )


@register_handler(opcodes=(OP_PREPARE_SAVE,), directions=("A→H", "H→A"))
class PrepareSaveHandler(BaseFrameHandler):
    """Track the start of a save transaction for IP buttons."""

    def handle(self, frame: FrameContext) -> None:
        log.info("[CREATE] prepare/save transaction len=%d", len(frame.payload))


@register_handler(opcodes=(OP_DEVICE_SAVE_HEAD,), directions=("H→A",))
class DeviceSaveHeadHandler(BaseFrameHandler):
    """Record hub-assigned device identifiers for virtual devices."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        device_id = int.from_bytes(payload[:2], "big") if len(payload) >= 2 else None
        button_id = payload[2] if len(payload) > 2 else None
        proxy.update_virtual_device(device_id=device_id, button_id=button_id)
        log.info(
            "[CREATE] hub assigned dev=0x%04X btn=0x%02X", device_id or 0, button_id or 0
        )


@register_handler(opcodes=(OP_FINALIZE_DEVICE,), directions=("H→A",))
class FinalizeDeviceHandler(BaseFrameHandler):
    """Note finalize frames emitted during virtual device creation."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        if len(payload) >= 3:
            device_id = int.from_bytes(payload[:2], "big")
            button_id = payload[2]
            proxy.update_virtual_device(device_id=device_id, button_id=button_id)
            log.info("[CREATE] finalize dev=0x%04X btn=0x%02X", device_id, button_id)
        else:
            log.info("[CREATE] finalize len=%d", len(payload))


@register_handler(opcodes=(OP_SAVE_COMMIT, ACK_SUCCESS), directions=("H→A",))
class SaveCommitHandler(BaseFrameHandler):
    """Acknowledge successful save of a virtual device/button."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        if getattr(proxy, "_pending_virtual", None) is None:
            return
        proxy.update_virtual_device(status="success")
        log.info("[CREATE] save commit/ack success")


@register_handler(opcodes=(OP_REQ_ACTIVATE,), directions=("A→H",))
class ActivateRequestHandler(BaseFrameHandler):
    """Log activation requests and track activity hints."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        if len(payload) != 2:
            return

        proxy: X1Proxy = frame.proxy
        ent_id, code = payload

        if ent_id in proxy.state.activities:
            kind = "act"
            record_kind = "activity"
            name = proxy.state.activities[ent_id].get("name", "")
            if code == ButtonName.POWER_ON:
                proxy.state.set_hint(ent_id)
        elif ent_id in proxy.state.devices:
            kind = "dev"
            record_kind = "device"
            name = proxy.state.devices[ent_id].get("name", "")
        else:
            kind = "id"
            record_kind = "unknown"
            name = ""

        cmd = proxy.state.commands.get(ent_id, {}).get(code)
        btn = BUTTONNAME_BY_CODE.get(code) if cmd is None else None
        extra = f" cmd='{cmd}'" if cmd else (f" btn='{btn}'" if btn else "")

        log.info(
            "[KEY] %s %s=0x%02X (%d) name='%s' key=0x%02X%s",
            frame.direction,
            kind,
            ent_id,
            ent_id,
            name,
            code,
            extra,
        )

        proxy.record_app_activation(
            ent_id=ent_id,
            ent_kind=record_kind,
            ent_name=name,
            command_id=code,
            command_label=cmd,
            button_label=btn,
            direction=frame.direction,
        )


@register_handler(opcodes=(OP_ACK_READY,), directions=("H→A",))
class AckReadyHandler(BaseFrameHandler):
    """Handle ACK_READY frames and optionally trigger data refreshes."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        log.info("[HINT] ACK_READY from hub")
        if proxy.can_issue_commands():
            log.info("[HINT] no proxy client; auto-REQ_ACTIVITIES")
            proxy.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")
            if proxy.state.current_activity_hint is not None:
                ent_lo = proxy.state.current_activity_hint & 0xFF
                proxy.request_buttons_for_entity(ent_lo)
                proxy.enqueue_cmd(
                    OP_REQ_COMMANDS,
                    bytes([ent_lo, 0xFF]),
                    expects_burst=True,
                    burst_kind=f"commands:{ent_lo}",
                )
        else:
            log.info("[HINT] proxy client connected; skipping auto-requests")
            new_id, old_id = proxy.state.update_activity_state()
            if new_id != old_id:
                log.info("[HINT] current activity differs from hint; notifying listeners")
                proxy._notify_activity_change(
                    new_id & 0xFF if new_id is not None else None,
                    old_id & 0xFF if old_id is not None else None,
                )


@register_handler(opcodes=(OP_CATALOG_ROW_DEVICE,), directions=("H→A",))
class CatalogDeviceHandler(BaseFrameHandler):
    """Handle catalog device rows emitted by the hub."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        proxy._burst.start("devices", now=time.monotonic())

        payload = frame.payload
        raw = frame.raw
        row_idx = payload[0] if len(payload) >= 1 else None
        dev_id = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None
        name_bytes_raw = raw[36 : 36 + 60]
        device_label = name_bytes_raw.decode("utf-16be").strip("\x00")
        brand_bytes_raw = raw[96 : 96 + 60]
        brand_label = brand_bytes_raw.decode("utf-16be", errors="ignore").strip("\x00")

        if dev_id is not None:
            proxy.state.devices[dev_id & 0xFF] = {"brand": brand_label, "name": device_label}
            log.info(
                "[DEV] #%s id=0x%04X (%d) brand='%s' name='%s'",
                row_idx,
                dev_id,
                dev_id,
                brand_label,
                device_label,
            )
        elif device_label:
            log.info("[DEV] name='%s'", device_label)


@register_handler(opcodes=(OP_X1_DEVICE,), directions=("H→A",))
class X1CatalogDeviceHandler(BaseFrameHandler):
    """Handle X1 firmware device rows."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        now = time.monotonic()
        proxy._burst.start("devices", now=now)

        payload = frame.payload
        row_idx = payload[0] if payload else None
        dev_id = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None

        name_bytes = payload[32:62]
        device_label = name_bytes.split(b"\x00", 1)[0].decode("utf-8", errors="ignore")

        brand_bytes = payload[62:]
        brand_label = brand_bytes.split(b"\x00", 1)[0].decode("utf-8", errors="ignore")

        if dev_id is not None:
            proxy.state.devices[dev_id & 0xFF] = {"brand": brand_label, "name": device_label}
            log.info(
                "[DEV] #%s id=0x%04X (%d) brand='%s' name='%s'",
                row_idx,
                dev_id,
                dev_id,
                brand_label,
                device_label,
            )
        elif device_label:
            log.info("[DEV] name='%s'", device_label)


@register_handler(opcodes=(OP_CATALOG_ROW_ACTIVITY,), directions=("H→A",))
class CatalogActivityHandler(BaseFrameHandler):
    """Handle activity catalog rows."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        proxy._burst.start("activities", now=time.monotonic())

        payload = frame.payload
        raw = frame.raw
        row_idx = payload[0] if len(payload) >= 1 else None
        # Start of a fresh activities list → reset 'active'
        if row_idx == 1 and proxy.state.current_activity_hint is not None:
            log.info("[ACT] reset active (start of new activities list)")
            proxy.state.set_hint(None)

        act_id = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None
        label_bytes_raw = raw[36:128]
        activity_label = label_bytes_raw.decode("utf-16be", errors="ignore").strip("\x00")
        active_state_byte = raw[35] if len(raw) > 35 else 0
        is_active = active_state_byte == 0x01

        if act_id is not None:
            proxy.state.activities[act_id & 0xFF] = {"name": activity_label, "active": is_active}
            if is_active:
                proxy.state.set_hint(act_id)
        elif activity_label:
            log.info("[ACT] name='%s'", activity_label)

        state = "ACTIVE" if is_active else "idle"
        if row_idx is not None and act_id is not None:
            log.info(
                "[ACT] #%d name='%s' act_id=0x%04X (%d) state=%s",
                row_idx,
                activity_label,
                act_id,
                act_id,
                state,
            )
        elif act_id is not None:
            log.info(
                "[ACT] name='%s' act_id=0x%04X (%d) state=%s",
                activity_label,
                act_id,
                act_id,
                state,
            )
        else:
            log.info("[ACT] name='%s' state=%s", activity_label, state)


@register_handler(opcodes=(OP_X1_ACTIVITY,), directions=("H→A",))
class X1CatalogActivityHandler(BaseFrameHandler):
    """Handle activity catalog rows emitted by X1 firmware."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        now = time.monotonic()
        proxy._burst.start("activities", now=now)

        payload = frame.payload
        row_idx = payload[0] if payload else None
        if row_idx == 1 and proxy.state.current_activity_hint is not None:
            log.info("[ACT] reset active (start of new activities list)")
            proxy.state.set_hint(None)

        act_id = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None
        active_flag = frame.raw[35] if len(frame.raw) > 35 else 0
        activity_label = payload[32:].split(b"\x00", 1)[0].decode("utf-8", errors="ignore")
        is_active = active_flag == 1

        if act_id is not None:
            proxy.state.activities[act_id & 0xFF] = {"name": activity_label, "active": is_active}
            if is_active:
                proxy.state.set_hint(act_id)
        elif activity_label:
            log.info("[ACT] name='%s'", activity_label)

        state = "ACTIVE" if is_active else "idle"
        if row_idx is not None and act_id is not None:
            log.info(
                "[ACT] #%d name='%s' act_id=0x%04X (%d) state=%s",
                row_idx,
                activity_label,
                act_id,
                act_id,
                state,
            )
        elif act_id is not None:
            log.info(
                "[ACT] name='%s' act_id=0x%04X (%d) state=%s",
                activity_label,
                act_id,
                act_id,
                state,
            )
        else:
            log.info("[ACT] name='%s' state=%s", activity_label, state)


@register_handler(directions=("H→A",))
class KeymapHandler(BaseFrameHandler):
    """Accumulate keymap table pages for activities."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        raw = frame.raw
        payload = frame.payload
        now = time.monotonic()

        # Only treat responses as keymap data while a buttons burst is active.
        # Other bursts re-use some of the same frame shapes as keymaps and we
        # must avoid misclassifying those frames while other data is being
        # assembled.
        burst_kind = getattr(proxy._burst, "kind", "")
        if proxy._burst.active and not burst_kind.startswith("buttons:"):
            return

        keymap_opcodes = {
            OP_KEYMAP_CONT,
            OP_KEYMAP_TBL_A,
            OP_KEYMAP_TBL_B,
            OP_KEYMAP_TBL_C,
            OP_KEYMAP_TBL_D,
            OP_KEYMAP_TBL_E,
            OP_KEYMAP_TBL_F,
            OP_KEYMAP_TBL_G,
            OP_DEVBTN_EXTRA,
        }

        burst_act_lo = self._burst_activity(proxy)
        activity_offsets = {
            OP_KEYMAP_CONT: 16,
            OP_KEYMAP_TBL_D: 16,
            OP_KEYMAP_TBL_F: 16,
            OP_DEVBTN_EXTRA: 16,
        }
        activity_idx = activity_offsets.get(frame.opcode, 11)
        activity_id_decimal = burst_act_lo
        if activity_id_decimal is None and len(raw) > activity_idx:
            activity_id_decimal = raw[activity_idx]

        if activity_id_decimal is None:
            activity_id_decimal = self._infer_activity_from_payload(payload)

        if activity_id_decimal is None:
            return

        looks_like_keymap = self._looks_like_keymap_payload(payload, activity_id_decimal)
        if not looks_like_keymap:
            # Only treat the payload as a keymap if a buttons burst is active or
            # the payload matches known record layouts or opcodes.
            if burst_act_lo is None or frame.opcode not in keymap_opcodes:
                return

        burst_key = f"buttons:{activity_id_decimal}"
        if proxy._burst.active and proxy._burst.kind == burst_key:
            proxy._burst.last_ts = now + proxy._burst.response_grace
        else:
            proxy._burst.start(burst_key, now=now)

        proxy._accumulate_keymap(activity_id_decimal, payload)
        keys = [
            f"{BUTTONNAME_BY_CODE.get(c, f'0x{c:02X}')}(0x{c:02X})"
            for c in sorted(proxy.state.buttons.get(activity_id_decimal, set()))
        ]
        log.info(
            "[KEYMAP] act=0x%02X mapped{%d}: %s",
            activity_id_decimal,
            len(keys),
            ", ".join(keys),
        )

    def _burst_activity(self, proxy: "X1Proxy") -> int | None:
        burst_kind = getattr(proxy._burst, "kind", None)
        if proxy._burst.active and burst_kind and burst_kind.startswith("buttons:"):
            try:
                return int(burst_kind.split(":", 1)[1])
            except ValueError:
                return None
        return None

    def _infer_activity_from_payload(self, payload: bytes) -> int | None:
        for i in range(len(payload) - 1):
            if payload[i + 1] in BUTTONNAME_BY_CODE:
                return payload[i]
        return None

    def _looks_like_keymap_payload(self, payload: bytes, act_lo: int) -> bool:
        for i in range(len(payload) - 1):
            if payload[i] == act_lo and payload[i + 1] in BUTTONNAME_BY_CODE:
                return True
        return False


@register_handler(opcodes=(OP_REQ_COMMANDS,), directions=("A→H",))
class RequestCommandsHandler(BaseFrameHandler):
    """Log command list requests from the app."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        dev_id = payload[0] if payload else 0
        log.info("[DEVCTL] A→H requesting commands dev=0x%02X (%d)", dev_id, dev_id)


@register_handler(opcodes=(OP_DEVBTN_HEADER, OP_DEVBTN_PAGE_ALT1), directions=("H→A",))
class DeviceButtonHeaderHandler(BaseFrameHandler):
    """Start device-command burst parsing."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        raw = frame.raw

        if len(payload) < 4:
            return

        dev_id = _extract_dev_id(raw, payload, frame.opcode)

        proxy._burst.start(f"commands:{dev_id}", now=time.monotonic())

        completed = proxy._command_assembler.feed(frame.opcode, raw, dev_id_override=dev_id)
        for complete_dev_id, assembled_payload in completed:
            commands = proxy.parse_device_commands(assembled_payload, complete_dev_id)
            if commands:
                proxy.state.commands[complete_dev_id & 0xFF] = commands
                log.info(
                    " ".join(f"{cmd_id:2d} : {label}" for cmd_id, label in proxy.state.commands[complete_dev_id].items())
                )


@register_handler(
    opcodes=(
        OP_DEVBTN_PAGE,
        OP_DEVBTN_MORE,
        OP_DEVBTN_TAIL,
        OP_DEVBTN_PAGE_ALT1,
        OP_DEVBTN_PAGE_ALT2,
        OP_DEVBTN_PAGE_ALT3,
        OP_DEVBTN_PAGE_ALT4,
        OP_DEVBTN_PAGE_ALT5,
    ),
    directions=("H→A",),
)
class DeviceButtonPayloadHandler(BaseFrameHandler):
    """Accumulate device command pages."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        raw = frame.raw

        if len(payload) < 4:
            return

        if frame.opcode in (OP_DEVBTN_HEADER, OP_DEVBTN_PAGE_ALT1):
            return

        dev_id = _infer_command_entity(proxy, payload)

        now = time.monotonic()
        if not proxy._burst.active:
            proxy._burst.start(f"commands:{dev_id}", now=now)
        else:
            proxy._burst.last_ts = now + proxy._burst.response_grace

        completed = proxy._command_assembler.feed(frame.opcode, raw, dev_id_override=dev_id)
        for complete_dev_id, assembled_payload in completed:
            commands = proxy.parse_device_commands(assembled_payload, complete_dev_id)
            if commands:
                proxy.state.commands[complete_dev_id & 0xFF] = commands
                log.info(
                    " ".join(f"{cmd_id:2d} : {label}" for cmd_id, label in proxy.state.commands[complete_dev_id].items())
                )
