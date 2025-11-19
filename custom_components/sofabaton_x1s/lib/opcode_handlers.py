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
    OP_REQ_ACTIVATE,
    OP_REQ_BUTTONS,
    OP_REQ_COMMANDS,
    OP_REQ_ACTIVITIES,
)
from .x1_proxy import log

if TYPE_CHECKING:
    from .x1_proxy import X1Proxy


@register_handler(opcodes=(OP_REQ_ACTIVATE,), directions=("A→H",))
class ActivateRequestHandler(BaseFrameHandler):
    """Log activation requests and track activity hints."""

    def handle(self, frame: FrameContext) -> None:
        payload = frame.payload
        if len(payload) != 2:
            return

        proxy: X1Proxy = frame.proxy
        ent_id, code = payload

        if ent_id in proxy._activities:
            kind = "act"
            name = proxy._activities[ent_id].get("name", "")
            if code == ButtonName.POWER_ON:
                proxy._current_activity_hint = ent_id
        elif ent_id in proxy._devices:
            kind = "dev"
            name = proxy._devices[ent_id].get("name", "")
        else:
            kind = "id"
            name = ""

        cmd = proxy._entity_commands.get(ent_id, {}).get(code)
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
            if proxy._current_activity_hint is not None:
                ent_lo = proxy._current_activity_hint & 0xFF
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
            if proxy._current_activity_hint is not proxy._current_activity:
                log.info("[HINT] current activity differs from hint; notifying listeners")
                proxy._notify_activity_change(
                    proxy._current_activity_hint & 0xFF,
                    proxy._current_activity & 0xFF if proxy._current_activity is not None else None,
                )


@register_handler(opcodes=(OP_CATALOG_ROW_DEVICE,), directions=("H→A",))
class CatalogDeviceHandler(BaseFrameHandler):
    """Handle catalog device rows emitted by the hub."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        proxy._burst_active = True
        if proxy._burst_kind is None:
            proxy._burst_kind = "devices"
        proxy._burst_last_ts = time.monotonic()

        payload = frame.payload
        raw = frame.raw
        row_idx = payload[0] if len(payload) >= 1 else None
        dev_id = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None
        name_bytes_raw = raw[36 : 36 + 60]
        device_label = name_bytes_raw.decode("utf-16be").strip("\x00")
        brand_bytes_raw = raw[96 : 96 + 60]
        brand_label = brand_bytes_raw.decode("utf-16be", errors="ignore").strip("\x00")

        if dev_id is not None:
            proxy._devices[dev_id & 0xFF] = {"brand": brand_label, "name": device_label}
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
        proxy._burst_active = True
        if proxy._burst_kind is None:
            proxy._burst_kind = "activities"
        proxy._burst_last_ts = time.monotonic()

        payload = frame.payload
        raw = frame.raw
        row_idx = payload[0] if len(payload) >= 1 else None
        act_id = payload[1] if len(payload) >= 2 else None
        is_active = bool(payload[2] & 0x01) if len(payload) >= 3 else False
        act_name = payload[4:7].decode("latin1", errors="ignore") if len(payload) >= 7 else ""
        label = raw[7:-1]
        activity_label = label.split(b"\x00")[0].decode("latin1", errors="ignore") if label else ""
        proxy._activities[act_id] = {"name": activity_label, "raw": payload, "act": act_name}
        if is_active and proxy._current_activity_hint is None:
            proxy._current_activity_hint = act_id

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
    opcodes=(OP_KEYMAP_TBL_A, OP_KEYMAP_TBL_B, OP_KEYMAP_TBL_C, OP_KEYMAP_CONT),
    directions=("H→A",),
)
class KeymapHandler(BaseFrameHandler):
    """Accumulate keymap table pages for activities."""

    def handle(self, frame: FrameContext) -> None:
        proxy: X1Proxy = frame.proxy
        raw = frame.raw
        payload = frame.payload
        if frame.opcode == OP_KEYMAP_CONT:
            activity_id_decimal = raw[16]
        else:
            activity_id_decimal = raw[11]

        proxy._burst_active = True
        if proxy._burst_kind is None:
            proxy._burst_kind = f"buttons:{activity_id_decimal}"
        proxy._burst_last_ts = time.monotonic()

        proxy._accumulate_keymap(activity_id_decimal, payload)
        keys = [
            f"{BUTTONNAME_BY_CODE.get(c, f'0x{c:02X}')}(0x{c:02X})"
            for c in sorted(proxy._entity_buttons.get(activity_id_decimal, set()))
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

        dev_id = payload[3]

        proxy._burst_active = True
        if proxy._burst_kind is None:
            proxy._burst_kind = f"commands:{dev_id}"
        proxy._burst_last_ts = time.monotonic()

        completed = proxy._command_assembler.feed(frame.opcode, raw)
        for complete_dev_id, assembled_payload in completed:
            commands = proxy.parse_device_commands(assembled_payload, complete_dev_id)
            if commands:
                proxy._entity_commands[complete_dev_id & 0xFF] = commands
                log.info(
                    " ".join(
                        f"{cmd_id:2d} : {label}" for cmd_id, label in proxy._entity_commands[complete_dev_id].items()
                    )
                )


@register_handler(
    opcodes=(OP_DEVBTN_PAGE, OP_DEVBTN_MORE, OP_DEVBTN_TAIL, OP_DEVBTN_EXTRA),
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

        dev_id = payload[3]

        proxy._burst_active = True
        if proxy._burst_kind is None:
            proxy._burst_kind = f"commands:{dev_id}"
        proxy._burst_last_ts = time.monotonic()

        completed = proxy._command_assembler.feed(frame.opcode, raw)
        for complete_dev_id, assembled_payload in completed:
            commands = proxy.parse_device_commands(assembled_payload, complete_dev_id)
            if commands:
                proxy._entity_commands[complete_dev_id & 0xFF] = commands
                log.info(
                    " ".join(
                        f"{cmd_id:2d} : {label}" for cmd_id, label in proxy._entity_commands[complete_dev_id].items()
                    )
                )
