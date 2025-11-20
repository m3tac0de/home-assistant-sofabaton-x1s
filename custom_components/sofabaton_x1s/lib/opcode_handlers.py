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
    OP_DEVBTN_TAIL,
    OP_KEYMAP_CONT,
    OP_KEYMAP_TBL_A,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_C,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_F,
    OP_KEYMAP_TBL_E,
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

    return payload[3] if len(payload) >= 4 else 0


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
            name = proxy.state.activities[ent_id].get("name", "")
            if code == ButtonName.POWER_ON:
                proxy.state.set_hint(ent_id)
        elif ent_id in proxy.state.devices:
            kind = "dev"
            name = proxy.state.devices[ent_id].get("name", "")
        else:
            kind = "id"
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
                proxy.enqueue_cmd(
                    OP_REQ_BUTTONS,
                    bytes([ent_lo, 0xFF]),
                    expects_burst=True,
                    burst_kind=f"buttons:{ent_lo}",
                )
                proxy.enqueue_cmd(
                    OP_REQ_COMMANDS,
                    bytes([ent_lo, 0xFF]),
                    expects_burst=True,
                    burst_kind=f"commands:{ent_lo}",
                )
        else:
            log.info("[HINT] proxy client connected; skipping auto-requests")
            if proxy.state.current_activity_hint is not proxy.state.current_activity:
                log.info("[HINT] current activity differs from hint; notifying listeners")
                proxy._notify_activity_change(
                    proxy.state.current_activity_hint & 0xFF,
                    proxy.state.current_activity & 0xFF if proxy.state.current_activity is not None else None,
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
        active_flag = payload[10] if len(payload) >= 11 else 0
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


@register_handler(
    opcodes=(
        OP_KEYMAP_TBL_A,
        OP_KEYMAP_TBL_B,
        OP_KEYMAP_TBL_C,
        OP_KEYMAP_TBL_D,
        OP_KEYMAP_TBL_F,
        OP_KEYMAP_TBL_E,
        OP_KEYMAP_CONT,
        OP_DEVBTN_EXTRA,
    ),
    directions=("H→A",),
)
class KeymapHandler(BaseFrameHandler):
    """Accumulate keymap table pages for activities."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        raw = frame.raw
        payload = frame.payload
        activity_offsets = {
            OP_KEYMAP_CONT: 16,
            OP_KEYMAP_TBL_D: 16,
            OP_KEYMAP_TBL_F: 16,
            OP_DEVBTN_EXTRA: 16,
        }
        activity_idx = activity_offsets.get(frame.opcode, 11)
        activity_id_decimal = raw[activity_idx] if len(raw) > activity_idx else None

        if activity_id_decimal is not None:
            proxy._burst.start(f"buttons:{activity_id_decimal}", now=time.monotonic())

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


@register_handler(opcodes=(OP_REQ_COMMANDS,), directions=("A→H",))
class RequestCommandsHandler(BaseFrameHandler):
    """Log command list requests from the app."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        dev_id = payload[0] if payload else 0
        log.info("[DEVCTL] A→H requesting commands dev=0x%02X (%d)", dev_id, dev_id)


@register_handler(opcodes=(OP_DEVBTN_HEADER,), directions=("H→A",))
class DeviceButtonHeaderHandler(BaseFrameHandler):
    """Start device-command burst parsing."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        payload = frame.payload
        raw = frame.raw

        if len(payload) < 4:
            return

        dev_id = _infer_command_entity(proxy, payload)

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
    opcodes=(OP_DEVBTN_PAGE, OP_DEVBTN_MORE, OP_DEVBTN_TAIL),
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
