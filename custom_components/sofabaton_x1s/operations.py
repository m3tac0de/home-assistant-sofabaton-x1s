"""The backup/restore operation registry and the bundle download view (R6, CR-H2-13).

Long-running backup, restore and sync operations register here so the card
can follow their progress; finished bundles download through the view.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import uuid4

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later

from .const import DOMAIN

# Same logger name as the package: log lines keep their source name.
_LOGGER = logging.getLogger(__package__)


_BACKUP_OPERATIONS_KEY = "_backup_operations"


_TRANSIENT_FAILURE_TTL_S = 30.0


class _BackupOperationRegistry:
    """Track background backup/restore jobs and fan out progress events."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._ops: dict[str, dict[str, Any]] = {}

    @callback
    def create(self, *, kind: str, entry_id: str, initial_state: dict[str, Any]) -> str:
        self._drop_completed_for_entry(entry_id, kind=kind)
        operation_id = uuid4().hex
        self._ops[operation_id] = {
            "operation_id": operation_id,
            "kind": kind,
            "entry_id": entry_id,
            "subscribers": {},
            "state": {
                "operation_id": operation_id,
                "kind": kind,
                "entry_id": entry_id,
                **initial_state,
            },
            "cleanup_unsub": None,
        }
        return operation_id

    @callback
    def get(self, operation_id: str) -> dict[str, Any] | None:
        return self._ops.get(operation_id)

    @callback
    def has_running_for_entry(self, entry_id: str) -> bool:
        for operation in self._ops.values():
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if str(state.get("status") or "") in {"pending", "running"}:
                return True
        return False

    @callback
    def latest_for_entry(self, entry_id: str, *, kind: str | None = None) -> dict[str, Any] | None:
        for operation in reversed(list(self._ops.values())):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if state.get("transient"):
                # A pre-write failure is for its own subscriber only; a
                # card refresh must not snap it back as a failed view.
                continue
            if kind is not None and state.get("kind") != kind:
                continue
            return dict(state)
        return None

    @callback
    def running_for_entry(self, entry_id: str) -> dict[str, Any] | None:
        for operation in reversed(list(self._ops.values())):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if str(state.get("status") or "") in {"pending", "running"}:
                return dict(state)
        return None

    @callback
    def update(self, operation_id: str, **payload: Any) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        state = dict(operation.get("state") or {})
        current_status = str(state.get("status") or "")
        next_status = str(payload.get("status") or current_status or "")
        # Progress callbacks may be queued from another thread. If a terminal
        # update already landed, never let a late pending/running callback
        # demote the operation back into an active state.
        if current_status in {"success", "failed"} and next_status in {"pending", "running"}:
            return
        state.update(payload)
        operation["state"] = state
        self._notify(operation_id)
        if str(state.get("status") or "") in {"success", "failed"}:
            # Every terminal operation gets the same 300s retention. The
            # bundle (if any) ages out on its own — we don't shorten the
            # timer post-download because that races in-flight clients.
            self._schedule_cleanup(operation_id)

    def update_from_thread(self, operation_id: str, **payload: Any) -> None:
        self.hass.loop.call_soon_threadsafe(lambda: self.update(operation_id, **payload))

    @callback
    def subscribe(
        self,
        operation_id: str,
        token: object,
        callback_fn,
    ) -> dict[str, Any] | None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return None
        subscribers = operation.setdefault("subscribers", {})
        subscribers[token] = callback_fn
        return dict(operation.get("state") or {})

    @callback
    def unsubscribe(self, operation_id: str, token: object) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        subscribers = operation.setdefault("subscribers", {})
        subscribers.pop(token, None)

    @callback
    def retire_transient(self, operation_id: str) -> None:
        """Keep a transient (pre-write) failure briefly, then drop it.

        The card subscribes only after it has the operation id, so a
        failure published a millisecond after the start must still be
        there for the subscription's initial state (CR-H2-3).
        """

        self._schedule_cleanup(operation_id, delay_seconds=_TRANSIENT_FAILURE_TTL_S)

    @callback
    def fail_running_for_entry(self, entry_id: str, message: str) -> int:
        """Mark every running operation of ``entry_id`` failed."""

        failed = 0
        for operation_id, operation in list(self._ops.items()):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id:
                continue
            if str(state.get("status") or "") not in {"pending", "running"}:
                continue
            self.update(operation_id, status="failed", phase="failed", message=message, error=message)
            failed += 1
        return failed

    @callback
    def dismiss_operation(self, operation_id: str) -> bool:
        # Full drop of a terminal operation: cancels any pending cleanup
        # timer and removes the op from the registry entirely. After this
        # returns True, ``latest_for_entry`` will no longer surface the
        # op, so a card refresh cannot snap a "Complete" view back to a
        # stale success/failure record. Refuses to drop pending/running
        # ops — those have to terminate naturally first.
        operation = self._ops.get(operation_id)
        if operation is None:
            return False
        state = operation.get("state") or {}
        if str(state.get("status") or "") in {"pending", "running"}:
            return False
        cleanup_unsub = operation.get("cleanup_unsub")
        if callable(cleanup_unsub):
            try:
                cleanup_unsub()
            except Exception:
                pass
        self._ops.pop(operation_id, None)
        return True

    @callback
    def flag_backup_downloaded(self, operation_id: str) -> bool:
        """Mark a backup as downloaded so the UI can show a confirmation.

        Does NOT touch the cleanup timer — the bundle ages out on the
        original 300s schedule so the user can re-download within that
        window if their first save-as didn't land.
        """
        operation = self._ops.get(operation_id)
        if operation is None:
            return False
        state = dict(operation.get("state") or {})
        if state.get("backup_downloaded"):
            return True
        state["backup_downloaded"] = True
        operation["state"] = state
        self._notify(operation_id)
        return True

    @callback
    def _notify(self, operation_id: str) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        payload = dict(operation.get("state") or {})
        for callback_fn in list((operation.get("subscribers") or {}).values()):
            try:
                callback_fn(payload)
            except Exception:
                _LOGGER.exception("[backup] Failed to notify subscriber")

    @callback
    def _schedule_cleanup(self, operation_id: str, delay_seconds: float = 300.0) -> None:
        operation = self._ops.get(operation_id)
        if operation is None:
            return
        existing_unsub = operation.get("cleanup_unsub")
        if callable(existing_unsub):
            try:
                existing_unsub()
            except Exception:
                pass

        @callback
        def _cleanup(_now) -> None:
            op = self._ops.get(operation_id)
            if op is not None:
                state = dict(op.get("state") or {})
                # If the bundle is still present, let subscribers know it's
                # being thrown away. The UI uses this to swap the
                # "Download backup" button for an "expired" note instead
                # of failing silently with a stale enabled button.
                if state.get("backup"):
                    state.pop("backup", None)
                    state["backup_expired"] = True
                    op["state"] = state
                    self._notify(operation_id)
            self._ops.pop(operation_id, None)

        operation["cleanup_unsub"] = async_call_later(self.hass, delay_seconds, _cleanup)

    @callback
    def _drop_completed_for_entry(self, entry_id: str, *, kind: str) -> None:
        for operation_id, operation in list(self._ops.items()):
            state = operation.get("state") or {}
            if state.get("entry_id") != entry_id or state.get("kind") != kind:
                continue
            if str(state.get("status") or "") in {"pending", "running"}:
                continue
            cleanup_unsub = operation.get("cleanup_unsub")
            if callable(cleanup_unsub):
                try:
                    cleanup_unsub()
                except Exception:
                    pass
            self._ops.pop(operation_id, None)


def _backup_operation_registry(hass: HomeAssistant) -> _BackupOperationRegistry:
    domain_data = hass.data.setdefault(DOMAIN, {})
    registry = domain_data.get(_BACKUP_OPERATIONS_KEY)
    if isinstance(registry, _BackupOperationRegistry):
        return registry
    registry = _BackupOperationRegistry(hass)
    domain_data[_BACKUP_OPERATIONS_KEY] = registry
    return registry


class SofabatonBackupDownloadView(HomeAssistantView):
    """Serve completed backup bundles from the in-memory registry.

    Mirrors HA core's pattern (backup / diagnostics / camera snapshot):
    server endpoint returning Content-Disposition: attachment, fetched
    via auth/sign_path + fileDownload helper on the frontend. The HA
    mobile apps' WebView delegates (setDownloadListener on Android,
    WKDownloadDelegate on iOS) intercept the response and surface it as
    a native download. Blob URLs do not trigger those delegates.
    """

    url = "/api/sofabaton_x1s/backup/download/{operation_id}"
    name = "api:sofabaton_x1s:backup_download"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, operation_id: str) -> web.Response:
        _LOGGER.info(
            "[%s] backup download view hit: operation_id=%s authenticated=%s",
            DOMAIN,
            operation_id,
            request.get("ha_authenticated", "unknown"),
        )
        registry = _backup_operation_registry(self.hass)
        operation = registry.get(operation_id)
        if operation is None:
            _LOGGER.warning("[%s] backup download: unknown operation_id=%s", DOMAIN, operation_id)
            return web.Response(status=404, text="unknown operation")
        state = operation.get("state") or {}
        kind = str(state.get("kind") or "")
        if kind not in {"backup_export", "backup_edited"}:
            return web.Response(status=404, text="not a backup")
        if str(state.get("status") or "") != "success":
            return web.Response(status=404, text="backup not ready")
        bundle = state.get("backup")
        if not bundle:
            _LOGGER.warning("[%s] backup download: bundle already cleared for %s", DOMAIN, operation_id)
            return web.Response(status=410, text="backup no longer available")
        filename = str(state.get("filename") or "sofabaton_backup.json")
        body = json.dumps(bundle, indent=2).encode("utf-8")
        _LOGGER.info("[%s] backup download: serving %s (%d bytes)", DOMAIN, filename, len(body))
        # Flag the bundle as downloaded for the UI's "✓ Downloaded"
        # indicator. Does NOT shorten the retention timer — the user can
        # re-download for the full original 300s window if their first
        # save-as didn't land. Only meaningful for backup_export ops; the
        # Edit screen doesn't subscribe to a stashed-edited op's progress.
        registry.flag_backup_downloaded(operation_id)
        return web.Response(
            body=body,
            content_type="application/json",
            charset="utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
