from __future__ import annotations

"""Opcode-specific frame handlers used by :class:`~.x1_proxy.X1Proxy`."""

import re
import time
import unicodedata
from collections import defaultdict
from typing import TYPE_CHECKING

from ..const import HUB_VERSION_X1
from .frame_handlers import BaseFrameHandler, FrameContext, register_handler
from .macros import MacroAssembler, decode_macro_records
from .protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    FAMILY_DEVBTNS,
    FAMILY_MACROS,
    FAMILY_KEYMAP,
    OP_ACK_READY,
    OP_CATALOG_ROW_ACTIVITY,
    OP_CATALOG_ROW_DEVICE,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_PAGE_ALT1,
    OP_DEVBTN_PAGE_ALT2,
    OP_DEVBTN_PAGE_ALT3,
    OP_DEVBTN_PAGE_ALT4,
    OP_DEVBTN_PAGE_ALT5,
    OP_DEVBTN_PAGE_ALT6,
    OP_DEVBTN_SINGLE,
    OP_DEVBTN_TAIL,
    OP_MACROS_A1,
    OP_MACROS_A2,
    OP_MACROS_B1,
    OP_MACROS_B2,
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
    OP_DEFINE_IP_CMD_EXISTING,
    OP_PREPARE_SAVE,
    OP_FINALIZE_DEVICE,
    OP_DEVICE_SAVE_HEAD,
    OP_SAVE_COMMIT,
    OP_REQ_IPCMD_SYNC,
    OP_IPCMD_ROW_A,
    OP_IPCMD_ROW_B,
    OP_IPCMD_ROW_C,
    OP_IPCMD_ROW_D,
    ACK_SUCCESS,
    OP_REQ_ACTIVATE,
    OP_REQ_ACTIVITY_MAP,
    OP_REQ_BUTTONS,
    OP_REQ_COMMANDS,
    OP_REQ_ACTIVITIES,
    OP_ACTIVITY_MAP_PAGE,
    OP_ACTIVITY_MAP_PAGE_X1S,
    OP_X1_ACTIVITY,
    OP_X1_DEVICE,
    OP_KEYMAP_EXTRA,
    opcode_family,
)
from .x1_proxy import log

if TYPE_CHECKING:
    from .x1_proxy import X1Proxy


OP_CREATE_DEVICE_ACK = 0x0107


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
        text = segment.decode("utf-16le", errors="ignore").replace("\x00", "")
        text = re.sub(r"[^\x20-\x7E]", "", text)
        return text.strip()
    except Exception:
        return ""


def _decode_ascii_blocks(payload: bytes) -> list[str]:
    """Split an ASCII-ish payload into human-readable blocks."""

    decoded = payload.decode("utf-8", errors="ignore")
    parts = [p.strip("\x00") for p in decoded.replace("\r", "\n").split("\n") if p.strip("\x00")]
    return parts


def _is_probable_header_frame(payload: bytes) -> bool:
    """Heuristic to identify DEVBTN header pages when only the family matches."""

    if len(payload) < 6:
        return False

    frame_no = payload[2]
    total_frames = int.from_bytes(payload[4:6], "big")

    return frame_no == 1 and total_frames > 1


def _is_probable_single_command(payload: bytes) -> bool:
    """Heuristic to identify single-command DEVBTN responses within the family."""

    if len(payload) < 6:
        return False

    frame_no = payload[2]
    total_frames = int.from_bytes(payload[4:6], "big")

    return frame_no == 1 and total_frames <= 1


@register_handler(opcode_families_low=(FAMILY_MACROS,), directions=("H→A",))
class MacroHandler(BaseFrameHandler):
    """Decode macro pages and populate the activity cache."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy

        now = time.monotonic()
        completed = proxy._macro_assembler.feed(frame.opcode, frame.payload, frame.raw)
        activity_hint = proxy._macro_assembler._last_activity_id
        burst_key = "macros" if activity_hint is None else f"macros:{activity_hint & 0xFF}"

        if len(frame.payload) >= 8 and frame.payload[2] == 0x01 and frame.payload[5] in (0x01, 0x02):
            req_activity_id = frame.payload[6] & 0xFF
            req_button_id = frame.payload[7] & 0xFF
            proxy.cache_macro_payload(req_activity_id, req_button_id, frame.payload)

        if proxy._burst.active and proxy._burst.kind and proxy._burst.kind.startswith("macros"):
            proxy._burst.last_ts = now + proxy._burst.response_grace
            if proxy._burst.kind == "macros":
                proxy._burst.kind = burst_key
        else:
            proxy._burst.start(burst_key, now=now)

        if not completed:
            return

        grouped: dict[int, list[dict[str, int | str]]] = defaultdict(list)

        for activity_id, assembled in completed:
            for act, command_id, label in decode_macro_records(assembled, activity_id):
                grouped[act & 0xFF].append({"command_id": command_id, "label": label})

        for act_lo, macros in grouped.items():
            proxy.state.replace_activity_macros(act_lo, macros)
            proxy._macros_complete.add(act_lo)
            proxy._pending_macro_requests.discard(act_lo)
            log.info(
                "[MACRO] act=0x%02X macros{%d}: %s",
                act_lo,
                len(macros),
                ", ".join(f"{m['command_id']}: {m['label']}" for m in macros),
            )




@register_handler(opcode_families_low=(0x47,), directions=("H→A",))
class ActivityInputsHandler(BaseFrameHandler):
    """Capture activity-inputs list frames used by the macro assignment wizard."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        proxy.notify_activity_inputs_frame()

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
        clean = re.sub(r"[^\x20-\x7E]", "", part)
        upper_clean = clean.upper()

        if not method:
            for verb in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"):
                if verb in upper_clean:
                    method = verb
                    break
            if not method and clean.isalpha():
                method = upper_clean
        if not url:
            lower_clean = clean.lower()
            if lower_clean.startswith("http"):
                url = clean
            elif method and "http" in lower_clean:
                for tok in clean.split():
                    if tok.lower().startswith("http/"):
                        continue
                    if tok.lower().startswith("http"):
                        url = tok
                        break
        if method and not url and "http/" not in clean.lower():
            tokens = clean.split()
            if method in tokens and len(tokens) > tokens.index(method) + 1:
                candidate = tokens[tokens.index(method) + 1]
                if not candidate.lower().startswith("http/" ):
                    url = candidate
        if ":" in clean:
            headers |= _parse_header_lines([clean])

    if method and not method.isalpha():
        match = re.search(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b", method, re.IGNORECASE)
        if match:
            method = match.group(1).upper()

    if url.upper().startswith("HTTP/"):
        url = ""

    if not url or url.startswith("-") or url.lower().startswith("content-"):
        for part in ascii_parts:
            if method:
                tokens = part.split()
                for idx, tok in enumerate(tokens):
                    if method in tok.upper() and idx + 1 < len(tokens):
                        candidate = tokens[idx + 1]
                        if not candidate.lower().startswith("http/"):
                            url = candidate if candidate.startswith("/") else url
                            if candidate.startswith("/"):
                                break
                    if tok.lower().startswith("http/"):
                        continue
                    if tok.startswith("/") or tok.lower().startswith("http"):
                        url = tok
                        break
            if url:
                break


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

    if (
        opcode == OP_DEVBTN_SINGLE
        and len(payload) > 7
        and payload[:6] == b"\x01\x00\x01\x01\x00\x01"
    ):
        return payload[7]

    if opcode in (
        OP_DEVBTN_HEADER,
        OP_DEVBTN_PAGE_ALT1,
        OP_DEVBTN_PAGE_ALT2,
        OP_DEVBTN_PAGE_ALT3,
        OP_DEVBTN_PAGE_ALT4,
        OP_DEVBTN_PAGE_ALT5,
        OP_DEVBTN_PAGE_ALT6,
    ) and len(raw) > 11:
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


@register_handler(opcodes=(OP_DEFINE_IP_CMD_EXISTING,), directions=("A→H",))
class DefineExistingIpCommandHandler(BaseFrameHandler):
    """Capture metadata when the app adds an IP command to an existing device."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        button_name = _decode_utf16le_segment(payload, start=16, length=64) or _decode_utf16le_segment(payload, start=16)
        method, url, headers = _parse_ip_command_fields(payload[64:])
        proxy.update_virtual_device(button_name=button_name, method=method, url=url, headers=headers)
        log.info(
            "[CREATE] existing dev button='%s' method=%s url='%s' headers=%s",
            button_name,
            method or "?",
            url,
            ", ".join(f"{k}: {v}" for k, v in headers.items()) if headers else "{}",
        )


@register_handler(
    opcodes=(OP_IPCMD_ROW_A, OP_IPCMD_ROW_B, OP_IPCMD_ROW_C, OP_IPCMD_ROW_D),
    directions=("H→A",),
)
class IpCommandSyncRowHandler(BaseFrameHandler):
    """Decode IP command rows returned when syncing commands for an existing device."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        proxy._burst.start("commands", now=time.monotonic())
        if len(payload) > 6:
            proxy._burst.start(f"commands:{payload[6]}", now=time.monotonic())

        device_id = payload[6] if len(payload) > 6 else None
        button_id = payload[7] if len(payload) > 7 else None
        button_name = _decode_utf16le_segment(payload, start=16, length=64) or _decode_utf16le_segment(payload, start=16)
        method, url, headers = _parse_ip_command_fields(payload[64:])

        if device_id is None:
            return

        device_meta = proxy.state.devices.get(device_id & 0xFF, {})
        proxy.state.record_virtual_device(
            device_id,
            name=device_meta.get("name") or f"Device {device_id}",
            button_id=button_id,
            method=method,
            url=url,
            headers=headers,
            button_name=button_name,
        )

        log.info(
            "[CREATE] sync dev=0x%04X btn=0x%02X name='%s' method=%s url='%s'",
            device_id,
            button_id or 0,
            button_name,
            method or "?",
            url,
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


@register_handler(opcodes=(OP_CREATE_DEVICE_ACK,), directions=("H→A",))
class RokuCreateDeviceAckHandler(BaseFrameHandler):
    """Capture device id from create-device ack during Roku replay."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        if len(payload) < 1:
            return
        proxy: X1Proxy = frame.proxy
        proxy.update_roku_device_id(payload[0])
        proxy.notify_roku_ack(frame.opcode, payload)
        log.info("[WIFI] create ack device_id=0x%02X", payload[0])


@register_handler(opcodes=(0x0103, 0x013E, 0x0112), directions=("H→A",))
class RokuAckHandler(BaseFrameHandler):
    """Capture Roku replay ACK frames so replay can gate each next step."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        proxy.notify_roku_ack(frame.opcode, frame.payload)
        log.info("[ACK] opcode=0x%04X payload=%s", frame.opcode, frame.payload.hex(" "))


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
                if proxy.hub_version != HUB_VERSION_X1:
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

def _decode_x1s_activity_label(label_bytes_raw: bytes) -> str:
    """Decode first activity label from X1S CATALOG_ROW_ACTIVITY label region.

    - Label is effectively UTF-16BE, but some hubs/frames appear shifted by 1 byte.
    - Region may contain multiple labels separated by UTF-16 NULs; we want the first.
    """

    def decode_shift(shift: int) -> str:
        b = label_bytes_raw[shift:]
        # keep even length for UTF-16
        if len(b) % 2:
            b = b[:-1]

        s = b.decode("utf-16be", errors="ignore")

        # Keep only the first NUL-terminated string (prevents duplicated labels)
        s = s.split("\x00", 1)[0]

        # Remove leading NUL/control chars (handles leading U+0000 / U+0001 etc.)
        s = s.strip("\x00").strip()
        while s and unicodedata.category(s[0]).startswith("C"):
            s = s[1:].lstrip()

        return s

    candidates = (decode_shift(0), decode_shift(1))

    def score(s: str) -> tuple[int, int]:
        # Prefer strings that look like normal human labels (lots of Basic Latin chars/spaces)
        basic_latin = sum(1 for ch in s if 0x20 <= ord(ch) <= 0x7E)
        printable = sum(1 for ch in s if ch.isprintable())
        return (basic_latin * 2 + printable, len(s))

    best = max(candidates, key=score, default="")
    return best

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
        activity_label = _decode_x1s_activity_label(label_bytes_raw)
        # activity_label = label_bytes_raw.decode("utf-16be", errors="ignore").strip("\x00")
        active_state_byte = raw[35] if len(raw) > 35 else 0
        is_active = active_state_byte == 0x01

        if act_id is not None:
            proxy.state.activities[act_id & 0xFF] = {"name": activity_label, "active": is_active}
            if is_active:
                proxy.state.set_hint(act_id)
            proxy._notify_activity_list_update()
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
        needs_confirm_flag = payload[95] if len(payload) > 95 else 0
        activity_label = payload[32:].split(b"\x00", 1)[0].decode("utf-8", errors="ignore")
        is_active = active_flag == 1
        needs_confirm = needs_confirm_flag == 1

        if act_id is not None:
            proxy.state.activities[act_id & 0xFF] = {
                "name": activity_label,
                "active": is_active,
                "needs_confirm": needs_confirm,
            }
            if is_active:
                proxy.state.set_hint(act_id)
            proxy._notify_activity_list_update()
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


@register_handler(opcodes=(OP_REQ_ACTIVITY_MAP,), directions=("A→H",))
class RequestActivityMapHandler(BaseFrameHandler):
    """Log activity mapping requests from the app."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        act_id = payload[0] if payload else 0
        log.info("[ACTMAP] A→H requesting mapping act=0x%02X (%d)", act_id, act_id)
        log.info("[ACTMAP] A→H request %s", frame.raw.hex(" "))


@register_handler(opcodes=(OP_ACTIVITY_MAP_PAGE, OP_ACTIVITY_MAP_PAGE_X1S), directions=("H→A",))
class ActivityMapHandler(BaseFrameHandler):
    """Accumulate activity mapping pages for activity favorites (X1/X1S/X2 variants)."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload

        if len(payload) < 8:
            return
        log.info("[ACTMAP] H→A response %s", frame.raw.hex(" "))

        act_lo = self._burst_activity(proxy)
        if act_lo is None:
            act_lo = self._pending_activity(proxy)
        if act_lo is None:
            return

        dev_id = int.from_bytes(payload[6:8], "big")
        dev_lo = dev_id & 0xFF
        if dev_lo == 0:
            return

        proxy.state.record_activity_member(act_lo, dev_lo)

        now = time.monotonic()
        burst_key = f"activity_map:{act_lo}"
        if proxy._burst.active and proxy._burst.kind == burst_key:
            proxy._burst.last_ts = now + proxy._burst.response_grace
        else:
            proxy._burst.start(burst_key, now=now)

        entries = self._parse_entries(payload, dev_lo)
        if not entries:
            return

        for slot_id, command_id in entries:
            proxy.state.record_activity_mapping(
                act_lo, dev_lo, command_id, button_id=slot_id
            )

        log.info(
            "[ACTMAP] act=0x%02X dev=0x%02X mapped{%d}",
            act_lo,
            dev_lo,
            len(entries),
        )

    def _burst_activity(self, proxy: "X1Proxy") -> int | None:
        burst_kind = getattr(proxy._burst, "kind", None)
        if proxy._burst.active and burst_kind and burst_kind.startswith("activity_map:"):
            try:
                return int(burst_kind.split(":", 1)[1])
            except ValueError:
                return None
        return None

    def _pending_activity(self, proxy: "X1Proxy") -> int | None:
        if proxy._pending_activity_map_requests:
            return next(iter(proxy._pending_activity_map_requests))
        return None

    def _parse_entries(self, payload: bytes, dev_lo: int) -> list[tuple[int, int]]:
        if len(payload) <= 92:
            return []

        extra = payload[92:]
        entries: list[tuple[int, int]] = []
        seen: set[tuple[int, int]] = set()

        for i in range(len(extra) - 3):
            if extra[i] != dev_lo:
                continue
            slot_id = extra[i + 1]
            command_id = extra[i + 2]
            terminator = extra[i + 3]
            if command_id in (0x00, 0xFC):
                continue
            if slot_id > 0x20:
                continue
            if terminator not in (0x00, 0xFC):
                continue
            entry = (slot_id, command_id)
            if entry in seen:
                continue
            seen.add(entry)
            entries.append(entry)

        return entries


@register_handler(
    opcode_families_low=(FAMILY_KEYMAP,),
    directions=("H→A",),
)
class KeymapHandler(BaseFrameHandler):
    """Accumulate keymap table pages for activities."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        raw = frame.raw
        payload = frame.payload
        now = time.monotonic()

        keymap_opcodes = {
            OP_KEYMAP_CONT,
            OP_KEYMAP_TBL_A,
            OP_KEYMAP_TBL_B,
            OP_KEYMAP_TBL_C,
            OP_KEYMAP_TBL_D,
            OP_KEYMAP_TBL_E,
            OP_KEYMAP_TBL_F,
            OP_KEYMAP_TBL_G,
            OP_KEYMAP_EXTRA,
        }

        burst_act_lo = self._burst_activity(proxy)
        activity_offsets = {
            OP_KEYMAP_CONT: 16,
            OP_KEYMAP_TBL_D: 16,
            OP_KEYMAP_TBL_F: 16,
            OP_KEYMAP_EXTRA: 16,
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
        burst_kind = getattr(proxy._burst, "kind", "")
        if proxy._burst.active and not burst_kind.startswith("buttons:"):
            # Other bursts re-use some of the same frame shapes as keymaps; only
            # treat this as a keymap if the payload matches expected layouts.
            if not looks_like_keymap:
                return

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

        # Some payloads (favorites) only contain button IDs that are not part of
        # the known mapping table. These still follow a recognizable layout of
        # 18-byte records with zeroed padding between the device and command
        # identifiers, so look for that structure as a fallback.
        RECORD_SIZE = 18
        for i in range(len(payload) - RECORD_SIZE + 1):
            if payload[i] != act_lo:
                continue

            looks_like_favorite_record = (
                payload[i + 3 : i + 7] == b"\x00" * 4
                and payload[i + 12 : i + 18] == b"\x00" * 6
            )

            if looks_like_favorite_record:
                return True
        return False


@register_handler(opcodes=(OP_REQ_COMMANDS,), directions=("A→H",))
class RequestCommandsHandler(BaseFrameHandler):
    """Log command list requests from the app."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        dev_id = payload[0] if payload else 0
        log.info("[DEVCTL] A→H requesting commands dev=0x%02X (%d)", dev_id, dev_id)


class DeviceButtonSingleHandler(BaseFrameHandler):
    """Handle single-command payloads returned by :opcode:`OP_REQ_COMMANDS`."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        raw = frame.raw

        effective_opcode = (
            OP_DEVBTN_SINGLE
            if opcode_family(frame.opcode) == FAMILY_DEVBTNS
            else frame.opcode
        )

        if len(payload) < 4:
            return

        dev_id = _extract_dev_id(raw, payload, effective_opcode)

        now = time.monotonic()
        if proxy._burst.active and (proxy._burst.kind or "").startswith("commands:"):
            proxy._burst.last_ts = now + proxy._burst.response_grace
        else:
            proxy._burst.start(f"commands:{dev_id}", now=now)

        completed = proxy._command_assembler.feed(
            effective_opcode, raw, dev_id_override=dev_id
        )
        for complete_dev_id, assembled_payload in completed:
            commands = proxy.parse_device_commands(assembled_payload, complete_dev_id)
            if commands:
                dev_key = complete_dev_id & 0xFF
                for cmd_id, label in commands.items():
                    pair = (complete_dev_id, cmd_id)
                    awaiting = proxy._favorite_label_requests.get(pair)
                    if awaiting:
                        for act_id in awaiting:
                            proxy.state.record_favorite_label(act_id, complete_dev_id, cmd_id, label)
                        proxy._favorite_label_requests.pop(pair, None)
                        continue

                    pending_for_device = [
                        candidate
                        for candidate in proxy._favorite_label_requests
                        if candidate[0] == complete_dev_id
                    ]

                    if len(pending_for_device) == 1:
                        pending_pair = pending_for_device[0]
                        pending_cmd_id = pending_pair[1]
                        for act_id in proxy._favorite_label_requests.get(pending_pair, set()):
                            proxy.state.record_favorite_label(
                                act_id, complete_dev_id, pending_cmd_id, label
                            )
                        proxy._favorite_label_requests.pop(pending_pair, None)

                        cmds = proxy.state.commands.setdefault(dev_key, {})
                        cmds[cmd_id] = label
                        cmds[pending_cmd_id] = label
                        continue

                    proxy.state.commands.setdefault(dev_key, {})[cmd_id] = label

                if dev_key in proxy.state.commands:
                    log.info(
                        " ".join(
                            f"{cmd_id:2d} : {label}" for cmd_id, label in proxy.state.commands[dev_key].items()
                        )
                    )


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
                dev_key = complete_dev_id & 0xFF
                existing = proxy.state.commands.setdefault(dev_key, {})
                existing.update(commands)
                log.info(
                    " ".join(f"{cmd_id:2d} : {label}" for cmd_id, label in existing.items())
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
                dev_key = complete_dev_id & 0xFF
                existing = proxy.state.commands.setdefault(dev_key, {})
                existing.update(commands)
                log.info(
                    " ".join(f"{cmd_id:2d} : {label}" for cmd_id, label in existing.items())
                )


@register_handler(opcode_families_low=(FAMILY_DEVBTNS,), directions=("H→A",))
class DeviceButtonFamilyHandler(BaseFrameHandler):
    """Route all device-button family responses using heuristics."""

    def __init__(self) -> None:
        self._single = DeviceButtonSingleHandler()
        self._header = DeviceButtonHeaderHandler()
        self._payload = DeviceButtonPayloadHandler()

    def handle(self, frame: FrameContext) -> None:
        opcode = frame.opcode
        payload = frame.payload

        if opcode == OP_DEVBTN_SINGLE or _is_probable_single_command(payload):
            self._single.handle(frame)
            return

        if opcode in (OP_DEVBTN_HEADER, OP_DEVBTN_PAGE_ALT1) or _is_probable_header_frame(payload):
            self._header.handle(frame)
            return

        self._payload.handle(frame)
