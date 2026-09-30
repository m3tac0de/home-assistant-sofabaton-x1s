"""Backup and restore WS commands (R6, CR-H2-13).

Export, restore, the edited-bundle stash, progress and state, with their
operation runners and request validation.
"""

from __future__ import annotations

import re
from typing import Any, Mapping

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError

from .const import (
    DOMAIN,
)
from .hub import SofabatonHub
from . import operations
from . import runtime


def _validate_backup_device_ids(raw_device_ids: Any) -> list[int] | None:
    if raw_device_ids is None:
        return None
    if not isinstance(raw_device_ids, (list, tuple)):
        raise ValueError(
            "device_ids must be a list of device id integers, or omitted "
            "to back up the whole hub"
        )
    if not raw_device_ids:
        return None

    device_ids: list[int] = []
    for raw in raw_device_ids:
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"device_ids entries must be integers (got {raw!r})"
            ) from exc
        if value < 1 or value > 255:
            raise ValueError(
                f"device_ids entries must be in 1..255 (got {value})"
            )
        if value not in device_ids:
            device_ids.append(value)
    return device_ids or None


def _without_bundle(state: dict[str, Any] | None) -> dict[str, Any] | None:
    """An operation state without its backup bundle: ``has_backup`` and
    the entity counts the card shows stand in for it."""

    if not state or not isinstance(state.get("backup"), dict):
        return state
    bundle = state["backup"]
    trimmed = {key: value for key, value in state.items() if key != "backup"}
    trimmed["has_backup"] = True
    trimmed["backup_summary"] = {
        "devices": len(bundle.get("devices") or []),
        "activities": len(bundle.get("activities") or []),
    }
    return trimmed


def _validate_restore_mode(raw_mode: Any) -> str:
    mode = str(raw_mode or "").strip().lower()
    if mode not in {"replace", "merge"}:
        raise ValueError("mode must be 'replace' or 'merge'")
    return mode


def _backup_result_filename(bundle: Mapping[str, Any], hub: SofabatonHub) -> str:
    hub_block = bundle.get("hub") if isinstance(bundle, Mapping) else None
    hub_name = ""
    if isinstance(hub_block, Mapping):
        hub_name = str(hub_block.get("name") or "").strip()
    if not hub_name:
        hub_name = str(getattr(hub, "name", "") or "hub").strip()
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", hub_name).strip("._-") or "hub"

    captured_at = str(bundle.get("captured_at") or "").strip()
    timestamp = captured_at.replace(":", "-")
    timestamp = timestamp.replace("T", "_")
    timestamp = timestamp.replace("+00-00", "Z")
    timestamp = timestamp.replace("+", "_")
    timestamp = timestamp.replace(".", "-")
    timestamp = timestamp.rstrip("Z")
    timestamp = timestamp.split("_", 1)
    if len(timestamp) == 2:
        date_part, time_part = timestamp
        time_part = time_part.split("-", 3)
        if len(time_part) >= 3:
            timestamp_text = f"{date_part}_{time_part[0]}-{time_part[1]}-{time_part[2]}"
        else:
            timestamp_text = f"{date_part}_{'-'.join(time_part)}"
    else:
        timestamp_text = re.sub(r"[^0-9A-Za-z_-]+", "", str(bundle.get("captured_at") or "")) or "backup"
    return f"{timestamp_text}_{safe_name}.json"


@runtime._hub_operation
async def _run_backup_export_operation(
    hass: HomeAssistant,
    operation_id: str,
    *,
    hub: SofabatonHub,
    device_ids: list[int] | None,
) -> None:
    registry = operations._backup_operation_registry(hass)

    def _normalize_progress_payload(
        payload: dict[str, Any] | None = None,
        **payload_update: Any,
    ) -> dict[str, Any]:
        if payload is not None:
            merged = dict(payload)
            merged.update(payload_update)
            return merged
        return dict(payload_update)

    def _progress(payload: dict[str, Any] | None = None, **payload_update: Any) -> None:
        # The library runs the backup in an executor and invokes this from
        # that thread, so marshal onto the loop.
        registry.update_from_thread(
            operation_id,
            **_normalize_progress_payload(payload, **payload_update),
        )

    try:
        result = await hub.async_backup_hub(
            device_ids=device_ids,
            progress_callback=_progress,
        )
        registry.update(
            operation_id,
            status="success",
            phase="completed",
            message="Backup completed.",
            completed_steps=int(result.get("_progress_total_steps") or 0),
            total_steps=int(result.get("_progress_total_steps") or 0),
            filename=_backup_result_filename(result, hub),
            backup=result,
        )
    except Exception as err:
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=str(err) or "Backup failed",
            error=str(err) or "Backup failed",
        )


@runtime._hub_operation
async def _run_backup_restore_operation(
    hass: HomeAssistant,
    operation_id: str,
    *,
    hub: SofabatonHub,
    payload: dict[str, Any],
    mode: str,
) -> None:
    registry = operations._backup_operation_registry(hass)

    def _normalize_progress_payload(
        payload: dict[str, Any] | None = None,
        **payload_update: Any,
    ) -> dict[str, Any]:
        if payload is not None:
            merged = dict(payload)
            merged.update(payload_update)
            return merged
        return dict(payload_update)

    progress_seen = False

    def _progress(payload: dict[str, Any] | None = None, **payload_update: Any) -> None:
        nonlocal progress_seen
        progress_seen = True
        registry.update_from_thread(
            operation_id,
            **_normalize_progress_payload(payload, **payload_update),
        )

    try:
        result = await hub.async_restore_backup(
            payload,
            replace_mode=(mode == "replace"),
            wifi_commands_request_port=runtime._resolve_roku_listen_port(hass, hub.entry_id),
            progress_callback=_progress,
        )
        if isinstance(result, dict) and str(result.get("status") or "") == "failed":
            failed_at = result.get("failed_at")
            registry.update(
                operation_id,
                status="failed",
                phase="failed",
                message=f"Restore failed at {failed_at!r}.",
                error=f"Restore failed at {failed_at!r}.",
                result=result,
            )
            return
        success_payload: dict[str, Any] = {
            "status": "success",
            "phase": "completed",
            "message": "Restore completed.",
            "result": result or {"status": "success"},
        }
        if isinstance(result, dict):
            if result.get("_progress_completed_steps") is not None:
                success_payload["completed_steps"] = int(result["_progress_completed_steps"])
            if result.get("_progress_total_steps") is not None:
                success_payload["total_steps"] = int(result["_progress_total_steps"])
        registry.update(operation_id, **success_payload)
    except Exception as err:
        # Pre-flight failures (kind, schema or profile checks and the
        # library's bundle preflight) raise before the first progress
        # event, so nothing was written. They are published as transient:
        # the subscriber still receives them (they stay for a short TTL),
        # but a card refresh never shows them as a failed restore.
        # In-flight failures (progress already started, hub disconnected
        # midway, etc.) take the normal failed-status path so the user can
        # navigate away and come back to the error report.
        if not progress_seen:
            registry.update(
                operation_id,
                status="failed",
                phase="failed",
                message=str(err) or "Restore failed",
                error=str(err) or "Restore failed",
                transient=True,
            )
            registry.retire_transient(operation_id)
            return
        registry.update(
            operation_id,
            status="failed",
            phase="failed",
            message=str(err) or "Restore failed",
            error=str(err) or "Restore failed",
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/export",
        vol.Required("entry_id"): str,
        vol.Optional("device_ids"): [vol.All(int, vol.Range(min=1, max=255))],
    }
)
@websocket_api.async_response
async def _ws_backup_export(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = operations._backup_operation_registry(hass)
    if runtime._hub_is_busy(hass, hub):
        connection.send_error(msg["id"], "busy", "Another backup or restore operation is already running for this hub")
        return

    try:
        runtime._raise_if_hub_operation_locked(hass, hub, "_ws_backup_export")
        device_ids = _validate_backup_device_ids(msg.get("device_ids"))
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_id", str(err))
        return

    operation_id = registry.create(
        kind="backup_export",
        entry_id=hub.entry_id,
        initial_state={
            "status": "pending",
            "phase": "queued",
            "message": "Starting backup…",
            "completed_steps": 0,
            "total_steps": 0,
        },
    )
    hass.async_create_task(
        _run_backup_export_operation(
            hass,
            operation_id,
            hub=hub,
            device_ids=device_ids,
        )
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/restore",
        vol.Required("entry_id"): str,
        vol.Required("backup"): dict,
        vol.Required("mode"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_restore(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = operations._backup_operation_registry(hass)
    if runtime._hub_is_busy(hass, hub):
        connection.send_error(msg["id"], "busy", "Another backup or restore operation is already running for this hub")
        return

    try:
        runtime._raise_if_hub_operation_locked(hass, hub, "_ws_backup_restore")
        mode = _validate_restore_mode(msg.get("mode"))
        payload = msg.get("backup")
        if not isinstance(payload, dict):
            raise ValueError("backup must be a hub_bundle object")
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "unavailable", str(err))
        return
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_payload", str(err))
        return

    operation_id = registry.create(
        kind="backup_restore",
        entry_id=hub.entry_id,
        initial_state={
            "status": "pending",
            "phase": "queued",
            "message": "Starting restore…",
            "mode": mode,
            "completed_steps": 0,
            "total_steps": 0,
        },
    )
    hass.async_create_task(
        _run_backup_restore_operation(
            hass,
            operation_id,
            hub=hub,
            payload=payload,
            mode=mode,
        )
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/stash_edited",
        vol.Required("entry_id"): str,
        vol.Required("backup"): dict,
        vol.Required("filename"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_stash_edited(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # The Edit screen mutates the bundle entirely in-browser. To hand
    # the JSON to the user through the same authenticated download path
    # the Make screen uses (so HA mobile WebView delegates can intercept
    # Content-Disposition and surface a native save dialog), the
    # frontend stashes the edited bundle here. Parked in the operation
    # registry under a dedicated backup_edited kind — same 300s TTL as
    # backup_export, served by the same view — and the returned
    # operation_id is immediately consumed by
    # /api/sofabaton_x1s/backup/download/{op_id}.
    payload = msg.get("backup")
    if not isinstance(payload, dict):
        connection.send_error(msg["id"], "invalid_payload", "backup must be an object")
        return
    filename = str(msg.get("filename") or "").strip() or "sofabaton_backup_edited.json"
    registry = operations._backup_operation_registry(hass)
    operation_id = registry.create(
        kind="backup_edited",
        entry_id=str(msg["entry_id"]),
        initial_state={},
    )
    registry.update(
        operation_id,
        status="success",
        phase="complete",
        filename=filename,
        backup=payload,
    )
    connection.send_result(msg["id"], {"operation_id": operation_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/progress_subscribe",
        vol.Required("operation_id"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_progress_subscribe(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    registry = operations._backup_operation_registry(hass)
    token = object()

    @callback
    def _forward(payload: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    initial_state = registry.subscribe(msg["operation_id"], token, _forward)
    if initial_state is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve backup operation")
        return

    @callback
    def _unsubscribe() -> None:
        registry.unsubscribe(msg["operation_id"], token)

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])
    _forward(initial_state)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/state",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_state(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Polled on every card hydration: the bundle itself stays with the
    # download view and the terminal progress event (CR-X2-5).
    hub = await runtime._async_resolve_hub_from_data(hass, {"entry_id": msg["entry_id"]})
    if hub is None:
        connection.send_error(msg["id"], "not_found", "Could not resolve Sofabaton hub")
        return

    registry = operations._backup_operation_registry(hass)
    connection.send_result(
        msg["id"],
        {
            "backup_export": _without_bundle(
                registry.latest_for_entry(hub.entry_id, kind="backup_export")
            ),
            "backup_restore": registry.latest_for_entry(hub.entry_id, kind="backup_restore"),
            "activity_sync": registry.latest_for_entry(hub.entry_id, kind="activity_sync"),
            "device_sync": registry.latest_for_entry(hub.entry_id, kind="device_sync"),
            "active_operation": registry.running_for_entry(hub.entry_id),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/backup/clear_result",
        vol.Required("operation_id"): str,
    }
)
@websocket_api.async_response
async def _ws_backup_clear_result(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    # Full-drop the completed op from the registry. The "Complete"
    # button on backup/restore screens calls this — the op must vanish
    # so a card refresh does not snap the success view back from
    # cached server state. Returns ok even if the op is already gone
    # (idempotent — covers double-clicks and races with the auto-300s
    # cleanup timer).
    registry = operations._backup_operation_registry(hass)
    operation = registry.get(msg["operation_id"])
    if operation is None:
        connection.send_result(msg["id"], {"ok": True, "already_dismissed": True})
        return
    state = operation.get("state") or {}
    if str(state.get("status") or "") in {"pending", "running"}:
        connection.send_error(
            msg["id"], "still_running", "Operation is still running"
        )
        return
    registry.dismiss_operation(msg["operation_id"])
    connection.send_result(msg["id"], {"ok": True})
