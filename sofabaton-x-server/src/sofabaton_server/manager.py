"""HubManager: the configured hubs, their proxies, and their lifecycle.

One instance per server process. It owns the records (persisted through
``HubStore``), one ``AsyncXProxy`` per enabled hub, and a single
subscription to each proxy's event stream which it fans out to
listeners tagged with the hub id. Everything it does against a hub goes
through the library's root names.

Enable/disable (plan section 6): disable keeps the record, stops the
proxy and releases the hub from the shared listener so the official app
can reach it directly; enable starts a fresh proxy from the record.
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Optional

from sofabaton import AsyncXProxy, HubConfig, HubEvent, HubStatus, StateDocumentError

from .config import Settings
from .models import HubRecord, HubView, mac_key, now_iso
from .store import HubStore, StateStore, UiDocumentStore

if TYPE_CHECKING:  # pragma: no cover
    from .jobs import JobRunner

log = logging.getLogger(__name__)

# (hub_id, event) for relayed hub events; (hub_id, server_event_kind) for
# the server's own lifecycle events, delivered as HubEvent-shaped dicts by
# the WebSocket layer (S3).
HubEventListener = Callable[[str, HubEvent], Any]
ServerEventListener = Callable[[str, str], Any]
ProxyFactory = Callable[[HubConfig], AsyncXProxy]


class HubNotFound(KeyError):
    """No record with that hub id."""


class HubConflict(ValueError):
    """The record cannot be added: duplicate, or one of our own proxies."""

    def __init__(self, message: str, *, existing_hub_id: Optional[str] = None) -> None:
        super().__init__(message)
        self.existing_hub_id = existing_hub_id


class HubDisabled(RuntimeError):
    """The hub is configured but disabled; no proxy is running for it."""


class HubStartFailed(RuntimeError):
    """The proxy for a hub could not start (a port in use, for instance).

    The record is kept exactly as it was (enabled stays as the caller set
    it) and nothing is registered, so a later ``enable()`` retries.
    """

    def __init__(self, hub_id: str, cause: BaseException) -> None:
        super().__init__(f"hub {hub_id} could not start: {cause}")
        self.hub_id = hub_id
        self.cause = cause


class HubManager:
    def __init__(
        self,
        settings: Settings,
        *,
        proxy_factory: ProxyFactory = AsyncXProxy.from_config,
        store: Optional[HubStore] = None,
        state_store: Optional[StateStore] = None,
        ui_store: Optional[UiDocumentStore] = None,
    ) -> None:
        self._settings = settings
        self._factory = proxy_factory
        self._store = store or HubStore(settings.data_dir)
        # Phase 3 S7: the library's cache document per hub, imported before
        # start() and written after every snapshot change and at stop.
        self._state = state_store or StateStore(settings.data_dir)
        # The web remote's per-hub card configuration (web-remote plan,
        # section 7); follows the hub through re-key and removal.
        self.ui_documents = ui_store or UiDocumentStore(settings.data_dir)
        # The job runner, attached by create_app once it exists: a hub
        # view then carries the hub's active and last job. Left None,
        # views simply omit them (the manager's own tests).
        self.jobs: Optional[JobRunner] = None
        self._records: dict[str, HubRecord] = {}
        self._proxies: dict[str, AsyncXProxy] = {}
        self._watchers: dict[str, asyncio.Task] = {}
        self._hub_listeners: list[HubEventListener] = []
        self._server_listeners: list[ServerEventListener] = []
        self._rekey_listeners: list[Callable[[str, str], Any]] = []
        self._lock = asyncio.Lock()
        # Every lifecycle transition (add, remove, enable, disable, the
        # re-key from host to MAC) runs under this lock from start to
        # finish. A disable that yields while cancelling its watcher and
        # an enable arriving in that gap would otherwise leave the record
        # enabled with no proxy running.
        self._transition = asyncio.Lock()
        self._started = False
        # Shared Zeroconf instance (set by the discovery service before hubs
        # start); each proxy adopts it instead of creating its own.
        self.zeroconf: Any = None

    # -- lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        """Load the records (or seed them) and start every enabled hub."""

        rows = self._store.load()
        for row in rows:
            record = HubRecord.from_dict(row)
            self._records[record.hub_id] = record
        if not rows and not self._store.exists() and self._settings.initial_hubs:
            for host in self._settings.initial_hubs:
                try:
                    cfg = HubConfig(host=host, source="manual")
                except ValueError as err:
                    log.warning("ignoring initial hub %r: %s", host, err)
                    continue
                self._records[cfg.host] = HubRecord(hub_id=cfg.host, config=cfg)
            self._persist()
        self._started = True
        for record in list(self._records.values()):
            if record.enabled:
                try:
                    await self._start_hub(record)
                except HubStartFailed:
                    # Logged by _start_hub. The server still comes up: the
                    # record stays enabled and a later enable() retries.
                    continue

    async def stop(self) -> None:
        """Shutdown: stop every running proxy (no release; the hubs come back)."""

        for hub_id in list(self._proxies):
            await self._stop_hub(hub_id, release=False)
        self._started = False

    # -- listeners -----------------------------------------------------------

    def on_hub_event(self, listener: HubEventListener) -> None:
        self._hub_listeners.append(listener)

    def on_server_event(self, listener: ServerEventListener) -> None:
        self._server_listeners.append(listener)

    def on_rekey(self, listener: Callable[[str, str], Any]) -> None:
        """``listener(old_hub_id, new_hub_id)``, before ``hub_rekeyed`` is emitted."""

        self._rekey_listeners.append(listener)

    # -- queries -------------------------------------------------------------

    def count(self) -> int:
        return len(self._records)

    def ids(self) -> list[str]:
        return list(self._records)

    def record(self, hub_id: str) -> HubRecord:
        try:
            return self._records[hub_id]
        except KeyError:
            raise HubNotFound(hub_id) from None

    def proxy(self, hub_id: str) -> AsyncXProxy:
        """The running proxy for an enabled hub; raises when disabled or unknown."""

        record = self.record(hub_id)
        proxy = self._proxies.get(hub_id)
        if proxy is None or not record.enabled:
            raise HubDisabled(hub_id)
        return proxy

    async def view(self, hub_id: str) -> HubView:
        record = self.record(hub_id)
        status: Optional[HubStatus] = None
        proxy = self._proxies.get(hub_id)
        if proxy is not None:
            status = await proxy.status()
        jobs = self.jobs
        hub_name = record.hub_name
        if hub_name is None and proxy is not None:
            # Not yet remembered (a record from before this field): the cached banner, no traffic.
            info = await proxy.hub_info()
            hub_name = info.name if info.known else None
        return HubView(
            hub_id=record.hub_id,
            enabled=record.enabled,
            config=record.config,
            added_at=record.added_at,
            last_seen=record.last_seen,
            status=status,
            active_job=jobs.active(hub_id) if jobs is not None else None,
            last_job=jobs.last_finished(hub_id) if jobs is not None else None,
            hub_name=hub_name,
        )

    async def views(self) -> list[HubView]:
        return [await self.view(hub_id) for hub_id in list(self._records)]

    # -- mutations -----------------------------------------------------------

    async def add(self, config: HubConfig, *, enabled: bool = True) -> HubRecord:
        async with self._transition:
            return await self._add_locked(config, enabled=enabled)

    async def _add_locked(self, config: HubConfig, *, enabled: bool) -> HubRecord:
        async with self._lock:
            if config.is_proxy:
                owner = self._find_by_identity(config)
                raise HubConflict(
                    "that advertisement is one of this server's own proxies",
                    existing_hub_id=owner.hub_id if owner else None,
                )
            existing = self._find_by_identity(config)
            if existing is not None:
                raise HubConflict(
                    f"hub already registered as {existing.hub_id}",
                    existing_hub_id=existing.hub_id,
                )
            hub_id = mac_key(config.mac) if config.mac else config.host
            record = HubRecord(hub_id=hub_id, config=config, enabled=enabled)
            self._records[hub_id] = record
            self._persist()
        self._emit_server("hub_added", hub_id)
        if enabled and self._started:
            await self._start_hub(record)
        return record

    async def remove(self, hub_id: str) -> None:
        async with self._transition:
            record = self.record(hub_id)
            if hub_id in self._proxies:
                await self._stop_hub(hub_id, release=True)
            async with self._lock:
                self._records.pop(record.hub_id, None)
                self._persist()
            self._state.delete(record.hub_id)
            self.ui_documents.delete(record.hub_id)
        self._emit_server("hub_removed", hub_id)

    async def enable(self, hub_id: str) -> HubRecord:
        async with self._transition:
            record = self.record(hub_id)
            if not record.enabled:
                record.enabled = True
                self._persist()
                self._emit_server("hub_enabled", hub_id)
            if hub_id not in self._proxies and self._started:
                await self._start_hub(record)
            return record

    async def disable(self, hub_id: str) -> HubRecord:
        async with self._transition:
            record = self.record(hub_id)
            if record.enabled:
                record.enabled = False
                self._persist()
            if hub_id in self._proxies:
                await self._stop_hub(hub_id, release=True)
        self._emit_server("hub_disabled", hub_id)
        return record

    # -- internals -----------------------------------------------------------

    def _find_by_identity(self, config: HubConfig) -> Optional[HubRecord]:
        wanted_mac = mac_key(config.mac) if config.mac else None
        for record in self._records.values():
            if record.config.host == config.host:
                return record
            if wanted_mac and record.config.mac and mac_key(record.config.mac) == wanted_mac:
                return record
            if wanted_mac and record.hub_id == wanted_mac:
                return record
        return None

    def persist(self) -> None:
        """Write ``hubs.json`` now (a record's callback device changed)."""

        self._persist()

    def _persist(self) -> None:
        self._store.save([r.to_dict() for r in self._records.values()])

    async def _start_hub(self, record: HubRecord) -> None:
        if record.hub_id in self._proxies:
            return
        # The host-side ports are server settings: the library's hub
        # listener and app demuxer are process-wide, so one pair serves all.
        proxy = self._factory(dataclasses.replace(
            record.config,
            hub_listen_port=self._settings.hub_listen_port,
            app_discovery_port=self._settings.app_discovery_port,
        ))
        if self.zeroconf is not None:
            proxy.set_zeroconf(self.zeroconf)
        await self._import_state(record.hub_id, proxy)
        try:
            await proxy.start()
        except asyncio.CancelledError:
            await self._discard_failed(proxy)
            raise
        except Exception as err:  # noqa: BLE001
            await self._discard_failed(proxy)
            log.warning("hub %s could not start (%s): %s", record.hub_id, record.config.host, err)
            raise HubStartFailed(record.hub_id, err) from err
        # Registered only once the engine is actually running, so a failed
        # start leaves nothing behind for enable() to mistake for a proxy.
        self._proxies[record.hub_id] = proxy
        self._watchers[record.hub_id] = asyncio.create_task(
            self._watch(record.hub_id, proxy), name=f"hub-watch:{record.hub_id}"
        )
        log.info("hub %s started (%s)", record.hub_id, record.config.host)

    @staticmethod
    async def _discard_failed(proxy: AsyncXProxy) -> None:
        try:
            await proxy.stop()
        except Exception:  # noqa: BLE001
            log.debug("cleanup of a proxy that failed to start raised", exc_info=True)

    async def _stop_hub(self, hub_id: str, *, release: bool) -> None:
        watcher = self._watchers.pop(hub_id, None)
        if watcher is not None:
            watcher.cancel()
            try:
                await watcher
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        proxy = self._proxies.pop(hub_id, None)
        if proxy is not None:
            await self._export_state(hub_id, proxy)
            await proxy.stop(release_hub=release)
            log.info("hub %s stopped (release=%s)", hub_id, release)

    # -- state document (phase 3 S7) -------------------------------------------

    async def _import_state(self, hub_id: str, proxy: AsyncXProxy) -> None:
        document = self._state.load(hub_id)
        if document is None:
            return
        try:
            snap = await proxy.import_state(document)
        except StateDocumentError as err:
            log.warning("hub %s: state file ignored (%s); starting cold", hub_id, err)
            return
        except Exception:  # noqa: BLE001
            log.exception("hub %s: state file could not be imported; starting cold", hub_id)
            return
        log.info("hub %s: state restored (snapshot %s, %d devices, %d activities)",
                 hub_id, snap.snapshot_id[:12], len(snap.devices), len(snap.activities))

    async def _export_state(self, hub_id: str, proxy: AsyncXProxy) -> None:
        try:
            document = await proxy.export_state()
            self._state.save(hub_id, document)
        except Exception:  # noqa: BLE001
            log.exception("hub %s: state could not be saved", hub_id)

    async def _watch(self, hub_id: str, proxy: AsyncXProxy) -> None:
        """Relay one hub's events; learn its MAC on the first ready sync."""

        current_id = hub_id
        async for event in proxy.events():
            if event.kind == "catalog_ready" and getattr(event.payload, "ready", False):
                async with self._transition:
                    current_id = await self._note_ready(current_id, proxy)
            self._emit_hub(current_id, event)
            if event.kind == "snapshot_changed":
                # Every refresh, write rebase, import and app-session flag
                # lands here; the file is always the latest cache.
                await self._export_state(current_id, proxy)

    async def _note_ready(self, hub_id: str, proxy: AsyncXProxy) -> str:
        record = self._records.get(hub_id)
        if record is None:
            return hub_id
        record.last_seen = now_iso()
        info = await proxy.hub_info()
        if info.known and info.name:
            record.hub_name = info.name
        if info.known and info.mac:
            new_id = mac_key(info.mac)
            if new_id != record.hub_id and new_id not in self._records:
                # Re-key once: the host was only ever a placeholder id.
                self._records.pop(record.hub_id)
                record.hub_id = new_id
                record.config = record.config.__class__.from_dict(
                    {**record.config.to_dict(), "mac": info.mac, "hub_version": info.model or record.config.hub_version}
                )
                self._records[new_id] = record
                self._proxies[new_id] = self._proxies.pop(hub_id)
                if hub_id in self._watchers:
                    self._watchers[new_id] = self._watchers.pop(hub_id)
                self._state.rename(hub_id, new_id)
                self.ui_documents.rename(hub_id, new_id)
                for listener in list(self._rekey_listeners):
                    try:
                        listener(hub_id, new_id)
                    except Exception:  # noqa: BLE001
                        log.exception("rekey listener failed")
                self._emit_server("hub_rekeyed", new_id)
                hub_id = new_id
        self._persist()
        return hub_id

    def _emit_hub(self, hub_id: str, event: HubEvent) -> None:
        for listener in list(self._hub_listeners):
            try:
                listener(hub_id, event)
            except Exception:  # noqa: BLE001
                log.exception("hub event listener failed")

    def emit_server_event(self, kind: str, hub_id: str) -> None:
        """Publish a server-level event (used by the discovery service too)."""

        self._emit_server(kind, hub_id)

    def _emit_server(self, kind: str, hub_id: str) -> None:
        for listener in list(self._server_listeners):
            try:
                listener(hub_id, kind)
            except Exception:  # noqa: BLE001
                log.exception("server event listener failed")
