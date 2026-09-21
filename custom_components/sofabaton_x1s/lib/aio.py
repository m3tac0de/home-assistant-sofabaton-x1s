# aio.py — asyncio facade over the threaded proxy core.
#
# The engine stays thread-based (sockets, ack waiters, mDNS); this module
# owns NO protocol logic. It does exactly two things:
#
#   * runs blocking proxy calls in the event loop's default executor, and
#   * marshals listener callbacks from engine threads onto the loop
#     (plain callables via ``call_soon_threadsafe``, coroutine functions
#     via ``run_coroutine_threadsafe``),
#
# mirroring the executor-job pattern the Home Assistant integration uses
# around ``X1Proxy`` today.
from __future__ import annotations

import asyncio
import contextlib
import contextvars
import functools
from dataclasses import dataclass, field
import inspect
import logging
from typing import Any, AsyncIterator, Callable, Iterable, Optional, Sequence

from .config import HubConfig
from .discovery import (
    DEFAULT_DISCOVERY_TIMEOUT,
    DiscoveredHub,
    HubBrowser,
    discover_hubs,
)
from .backup_export import normalize_dump_to_blobs, now_iso as _now_iso
from .errors import (
    FetchTimeoutError,
    HubBusyError,
    HubNotConnectedError,
    HubRejectedError,
    IrLearnError,
    SnapshotIncompleteError,
    SnapshotOutdatedError,
    StateDocumentError,
    WifiUpdateDeclined,
    WifiUpdateFailed,
)
from .hub_listener import release_hub_from_listener
from .hub_versions import HUB_VERSION_X1, HVER_BY_HUB_VERSION
from .commands import hub_command_label
from .wifi_inplace_plan import baseline_snapshot_from_bundle, build_wifi_inplace_plan
from .wifi_device import (
    X1_CALLBACK_PORT,
    WifiDeployment,
    WifiDeviceSpec,
    WifiTarget,
    command_defs_from_spec,
    labels_from_spec,
    snapshot_from_spec,
)
from .devices import parse_device_record
from .device_class_profiles import supported_create_classes
from .models import (
    Activity,
    BatchOutcome,
    WriteBatch,
    ActivityChanged,
    Button,
    CatalogReady,
    Command,
    ConnectionState,
    Device,
    DeviceRemoved,
    Favorite,
    HubEvent,
    HubInfo,
    HubSnapshot,
    HubStatus,
    Macro,
    RestoreResult,
    RunningActivity,
    SnapshotChanged,
    SnapshotEntity,
    StatusChanged,
    SyncResult,
    WriteProgress,
    SYNC_PRE_WRITE_FAILURES,
    snapshot_content_id,
)
from .payloads import CommandPayload, IrPayload, payload_from_body
from .hub_apply import ApplyState, HubSyncResult, run_sync_hub
from .version import __version__
from .protocol_const import BUTTONNAME_BY_CODE, ButtonName
from .x1_proxy import X1Proxy

__all__ = [
    "AsyncXProxy",
    "AsyncHubBrowser",
    "async_discover_hubs",
]

_LOG = logging.getLogger("x1proxy.facade")

# Default deadline for an awaited read that has to fetch from the hub.
DEFAULT_FETCH_TIMEOUT = 10.0
# Pause before the connect-time initial sync is retried after a failure
# with the hub still connected (a burst that never landed, for instance).
INITIAL_SYNC_RETRY_S = 5.0
# Schema of the opaque state document (export_state / import_state).
STATE_DOCUMENT_KIND = "sofabaton_state"
STATE_DOCUMENT_SCHEMA = 1
# Learn timeout, matching the hub's own silent exit from learn mode.
DEFAULT_LEARN_TIMEOUT = 60.0


def _marshal_callback(loop: asyncio.AbstractEventLoop, callback: Callable) -> Callable:
    """Wrap ``callback`` so engine-thread invocations land on ``loop``.

    Sync callables are queued with ``call_soon_threadsafe``; coroutine
    functions are scheduled as tasks via ``run_coroutine_threadsafe``.
    """

    if inspect.iscoroutinefunction(callback):

        def relay(*args: Any, **kwargs: Any) -> None:
            asyncio.run_coroutine_threadsafe(callback(*args, **kwargs), loop)

    else:

        def relay(*args: Any, **kwargs: Any) -> None:
            loop.call_soon_threadsafe(functools.partial(callback, *args, **kwargs))

    functools.update_wrapper(relay, callback)
    return relay


def _activity_from_row(act_id: int, row: dict) -> Activity:
    return Activity(
        activity_id=int(act_id),
        name=str(row.get("name") or ""),
        active=bool(row.get("active", False)),
        needs_confirm=bool(row.get("needs_confirm", False)),
    )


def _device_from_row(dev_id: int, row: dict, hub_version: Optional[str]) -> Device:
    power_state: Optional[int] = None
    raw_body = row.get("raw_body")
    if hub_version and isinstance(raw_body, (bytes, bytearray)) and raw_body:
        try:
            power_state = int(parse_device_record(bytes(raw_body), hub_version=hub_version).power_state) & 0xFF
        except ValueError:
            power_state = None
    idle = row.get("idle_behavior")
    code = row.get("device_class_code")
    return Device(
        device_id=int(dev_id),
        name=str(row.get("name") or ""),
        brand=row.get("brand") or None,
        device_class=row.get("device_class"),
        device_class_code=int(code) if isinstance(code, int) else None,
        power_state=power_state,
        idle_behavior=int(idle) if isinstance(idle, int) else None,
    )


def _bundle_entity(bundle: Any, kind: str, entity_id: int) -> Optional[dict]:
    """The ``device_backup`` / ``activity_backup`` payload for one entity id."""

    if not isinstance(bundle, dict):
        return None
    rows = bundle.get("devices" if kind == "device" else "activities") or []
    want = int(entity_id) & 0xFF
    for payload in rows:
        if not isinstance(payload, dict):
            continue
        block = payload.get("device") or {}
        try:
            if int(block.get("device_id", -1)) & 0xFF == want:
                return payload
        except (TypeError, ValueError):
            continue
    return None


def _display_order_key(payload: Any) -> tuple:
    block = payload.get("device") if isinstance(payload, dict) else None
    block = block if isinstance(block, dict) else {}
    sort = block.get("sort")
    try:
        sort_key = (0, int(sort)) if sort is not None else (1, 0)
    except (TypeError, ValueError):
        sort_key = (1, 0)
    try:
        entity_id = int(block.get("device_id", 0))
    except (TypeError, ValueError):
        entity_id = 0
    return (*sort_key, entity_id)


def _snapshot_entity(kind: str, payload: dict) -> SnapshotEntity:
    block = payload.get("device") or {}
    try:
        entity_id = int(block.get("device_id", 0)) & 0xFF
    except (TypeError, ValueError):
        entity_id = 0
    name = block.get("name")
    return SnapshotEntity(
        kind=kind,  # type: ignore[arg-type]
        entity_id=entity_id,
        name=str(name) if name is not None else None,
        complete=bool(payload.get("complete")),
        editable=bool(payload.get("editable", payload.get("complete"))),
        fetched_at=payload.get("fetched_at"),
    )


@dataclass
class _FacadeBatch:
    """Facade-side bookkeeping of one open batch_writes() block."""

    start_snapshot_id: Optional[str]
    device_ids: set[int] = field(default_factory=set)
    activity_ids: set[int] = field(default_factory=set)
    rebases: int = 0
    force: bool = False


class _ProgressReporter:
    """Deliver :class:`WriteProgress` to a consumer callback from the loop."""

    def __init__(self, loop: asyncio.AbstractEventLoop, callback: Optional[Callable]) -> None:
        self._loop = loop
        self._callback = callback

    def __call__(self, **payload: Any) -> None:
        if self._callback is None:
            return
        progress = WriteProgress.from_engine(**payload)
        if inspect.iscoroutinefunction(self._callback):
            self._loop.create_task(self._callback(progress))
        else:
            self._callback(progress)


# True inside the task that holds a hub for an exclusive operation (see
# ``AsyncXProxy._holding_hub``): its own nested reads pass, everyone else's
# on-demand fetches wait.
_HUB_HOLDER: contextvars.ContextVar[bool] = contextvars.ContextVar("sofabaton_hub_holder", default=False)


class AsyncXProxy:
    """Asyncio proxy for a Sofabaton X1/X1S/X2 hub — the library's entry point.

    Construct it with the hub's IP — ``AsyncXProxy(hub_ip=...)`` is enough:
    ports default to the right values and the hub model is confirmed from
    the connect banner. Pass ``mdns_instance=`` / ``mdns_txt=`` only to make
    the proxy advertise itself exactly like the hub it fronts (so the
    official app keeps working pointed at the proxy); ``hub_version=`` is at
    most a pre-connect hint. Construction must happen inside a running event
    loop (or pass ``loop=``). Blocking work runs in the loop's executor and
    listener callbacks are marshaled back onto the loop.

    The common surface is a small set of explicit, human-readable
    coroutines:

    * **read** — :meth:`activities`, :meth:`devices`, :meth:`commands`,
      :meth:`buttons`, :meth:`macros`, :meth:`favorites`. These return
      the data directly (no ``(data, ready)`` tuple): cached results
      come back immediately, otherwise the call fetches from the hub and
      awaits completion, raising :class:`HubBusyError` when the hub is
      held by a connected app client and nothing is cached,
      :class:`HubNotConnectedError` when there is no hub session, or
      :class:`FetchTimeoutError` when the fetch never lands (all stdlib
      subclasses: ``RuntimeError`` / ``TimeoutError``).
    * **status** — :meth:`status` (live connection state and mode, no
      hub traffic) and :meth:`hub_info` (identity from the connect
      banner), both typed dataclasses with ``to_dict()``.
    * **ready** — :meth:`wait_until_ready`: the connect-time initial
      sync (banner, devices, activities) has cached the catalog minimum
      for this hub session; ``HubStatus.catalog_ready`` mirrors it.
    * **events** — :meth:`events`: one async iterator of typed
      :class:`HubEvent` items folding every engine listener (activity
      change, catalog update, hub and app link state, OTA) plus a
      derived ``status_changed`` when the mode flips.
    * **control** — :meth:`press`, :meth:`start_activity`,
      :meth:`stop_activity`, :meth:`find_remote`.
    * **snapshot** — :meth:`snapshot`: the hub's structural configuration
      (everything but IR payloads) projected from the cache with no hub
      traffic, as a :class:`HubSnapshot` with a content-hash id and
      per-entity provenance; :meth:`refresh` is the only structural hub
      read (whole hub, minutes on a real hub, or one entity), always
      user-initiated; :meth:`export_state` / :meth:`import_state` carry
      the engine's cache across a consumer restart so the snapshot is
      complete straight away.
    * **live edit** — :meth:`sync_activity`, :meth:`sync_device`: diff a
      snapshot bundle against an edited copy and write the difference in
      place (see the "live edit surface" section below), returning a
      :class:`SyncResult`. Every write ends with a rebase: the entity is
      re-read and a ``snapshot_changed`` event carries the new id.
    * **intents** — whole-entity writes a bundle diff cannot express:
      :meth:`add_device`, :meth:`add_activity`, :meth:`remove_device`,
      :meth:`remove_activity`, :meth:`reorder_devices`, :meth:`reorder_activities`,
      :meth:`set_hub_name`, :meth:`erase`, :meth:`backup`, :meth:`restore`.
      They raise :class:`HubBusyError` / :class:`HubNotConnectedError`
      when the hub cannot be written and :class:`HubRejectedError` when
      the hub refused, and rebase like a sync.
    * **payloads** — :class:`IrPayload` built from Pronto, raw timings, a
      descriptor or hub hex, :class:`NetworkCommand` for the network
      classes, :class:`CommandRecord` for any other stored body;
      :meth:`read_payload` returns the one the device's class calls for.
      :meth:`play`, :meth:`learn_ir` / :meth:`cancel_learn` are IR only.
      Saving a payload as a new command is a row edit: ``to_command_row``
      then :meth:`sync_device`.

    Anything else in :data:`PROXY_METHODS` (provisioning, cache export,
    explicit requests) is awaitable too and delegates to the engine in
    the executor. Listener registration (``on_*``) accepts plain
    callables and coroutine functions and always delivers on the event
    loop. ``.sync`` exposes the underlying engine for the raw surface
    (including the ``get_*`` snapshot getters that return tuples).
    """

    # Engine methods exposed as bare awaitable executor delegates. The
    # human read/control surface (activities/devices/commands/buttons/
    # macros/favorites/press/start_activity/stop_activity) is defined as
    # explicit methods below and intentionally NOT listed here. Tests
    # assert every entry exists on X1Proxy so the list cannot drift.
    PROXY_METHODS: frozenset[str] = frozenset(
        {
            # advanced getters (already return plain data, not tuples)
            "get_cached_macro_records",
            "get_cached_activity_detail_ids",
            "get_known_device_ids",
            "get_known_activity_ids",
            "get_app_activations",
            # live in-memory cache invalidation (NOT persistence: the
            # library never writes to disk, and the cache-snapshot
            # (de)serializers stay off the public surface — reach them
            # via .sync if a warm-start dump is genuinely needed).
            "clear_entity_cache",
            "clear_devices_catalog",
            "clear_activities_catalog",
            # explicit hub requests
            "request_activities",
            "request_devices",
            "request_activity_mapping",
            "fetch_device_input_record",
            "fetch_device_key_sort",
            # actions
            "set_diag_dump",
            "resync_remote",
            "update_discovery_identity",
            "enable_proxy",
            "disable_proxy",
            # per-entity backup / restore (the whole-hub forms are the
            # explicit backup() / restore() coroutines)
            "backup_device",
            "backup_activity",
            "restore_device",
            "restore_activity",
        }
    )

    _LISTENER_METHODS: frozenset[str] = frozenset(
        {
            "on_activity_change",
            "on_activity_list_update",
            "on_client_state_change",
            "on_hub_state_change",
            "on_ota_update",
            "on_app_activation",
        }
    )

    # Engine methods the explicit coroutines above are built on (reads,
    # readiness, control, live edit, lifecycle). They are reachable only
    # through those coroutines, never by name. Listed so the triage guard
    # (see ``engine_method_triage``) can prove every public engine method
    # sits in exactly one tier.
    WRAPPED_ENGINE_METHODS: frozenset[str] = frozenset(
        {
            "get_activities",
            "get_devices",
            "get_commands_for_entity",
            "get_buttons_for_entity",
            "get_macros_for_activity",
            "ensure_commands_for_activity",
            "send_command",
            "can_issue_commands",
            "find_remote",
            "sync_activity",
            "sync_device",
            "start",
            "stop",
            "set_zeroconf",
            "on_burst_end",
            "has_banner_identity",
            "fetch_banner_info",
            "get_banner_info",
            "get_proxy_status",
            # snapshot / state document (phase 3 plan, W0)
            "assemble_hub_bundle_from_state",
            "export_cache_state",
            "import_cache_state",
            "bump_cache_generation",
            # intents and payloads (phase 3 plan, W3)
            "create_device",
            "create_activity",
            "delete_device",
            # write batch (phase 4 plan, H2)
            "begin_write_batch",
            "end_write_batch",
            "reorder_devices",
            "reorder_activities",
            "set_hub_name",
            "erase_configuration",
            "backup_hub_bundle",
            "restore_hub_bundle",
            "preflight_restore_bundle",
            "request_ir_command_dump",
            "play_ir_blob",
            "ir_learn_command",
            "cancel_ir_learn",
        }
    )

    def __init__(
        self,
        *,
        hub_ip: str,
        hub_port: int = 8102,
        hub_listen_port: int = 8200,
        app_discovery_port: int = 8102,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        initial_sync: bool = True,
        **proxy_kwargs: Any,
    ) -> None:
        """Construct a proxy for the hub at ``hub_ip``.

        ``initial_sync`` (default on) makes the facade read the banner,
        devices and activities every time the hub connects, so the
        catalog minimum is always cached; see :meth:`wait_until_ready`.

        The proxy has two network faces. Only the four arguments below
        describe them; everything else (``mdns_instance``, ``mdns_txt``,
        ``hub_version``, ``proxy_enabled``, ``diag_*`` ...) is forwarded
        verbatim to the engine.

        Hub-facing (the physical hub):

        * ``hub_ip`` — the hub's IPv4 address (from discovery or manual).
        * ``hub_port`` — UDP port *on the hub* we send ``CALL_ME`` to.
          Protocol-fixed at ``8102``; you should rarely change it.
        * ``hub_listen_port`` — TCP port *on this host* the hub connects
          back to after ``CALL_ME``. Change it to avoid a local port
          collision; reserve it in your firewall for the hub's connect-back.

        App-facing (the official mobile app):

        * ``app_discovery_port`` — UDP port *on this host* the app uses to
          discover and call the proxy. Keep it at ``8102``: iOS discovery
          is lost on any other port.

        See the project's ``docs/networking.md`` for the full port map.
        """

        self._loop = loop or asyncio.get_running_loop()
        self._proxy = X1Proxy(
            real_hub_ip=hub_ip,
            real_hub_udp_port=hub_port,
            hub_listen_base=hub_listen_port,
            proxy_udp_port=app_discovery_port,
            **proxy_kwargs,
        )
        self._init_burst_state()
        if initial_sync:
            self._arm_initial_sync()

    @classmethod
    def from_config(
        cls,
        config: HubConfig,
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        **overrides: Any,
    ) -> "AsyncXProxy":
        """Construct a proxy from a :class:`HubConfig` record.

        The record is the one shape every configuration path produces
        (library discovery, a foreign mDNS stack, manual entry, a REST
        body or config file); ``overrides`` are applied on top of the
        record's keyword arguments, e.g. ``diag_dump=False``.
        """

        kwargs = config.proxy_kwargs()
        kwargs.update(overrides)
        return cls(loop=loop, **kwargs)

    @classmethod
    def wrap(
        cls,
        proxy: X1Proxy,
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        initial_sync: bool = False,
    ) -> "AsyncXProxy":
        """Wrap an already-constructed engine (e.g. mid-migration code).

        ``initial_sync`` defaults off here: an application that built the
        engine itself usually runs its own connect-time sync already.
        """

        self = object.__new__(cls)
        self._loop = loop or asyncio.get_running_loop()
        self._proxy = proxy
        self._init_burst_state()
        if initial_sync:
            self._arm_initial_sync()
        return self

    def _init_burst_state(self) -> None:
        # Per-entity futures awaiting a burst completion, keyed by the
        # engine's burst key (e.g. "commands:5", "activities"). One
        # persistent dispatcher is registered per burst-kind on first use
        # so awaited reads never leak listeners.
        self._burst_waiters: dict[str, list[asyncio.Future]] = {}
        self._burst_dispatch_kinds: set[str] = set()
        # Set on any hub/client connection-state change (lazily wired) so
        # the readiness waiters can wake.
        self._state_event: Optional[asyncio.Event] = None
        # events(): per-consumer queues fed by one set of engine listeners.
        self._event_queues: set[asyncio.Queue] = set()
        self._event_listeners_armed = False
        self._event_seq = 0
        self._last_mode: Optional[str] = None
        self.events_dropped = 0
        # Burst keys with a fetch in flight: a second read for the same
        # key joins the pending burst instead of issuing another request.
        self._inflight: set[str] = set()
        # Open write batch (batch_writes): rebases accumulate here and the
        # single snapshot_changed goes out when the batch closes.
        self._batch: Optional[_FacadeBatch] = None
        # Connect-time initial sync (banner, devices, activities).
        self._initial_sync_armed = False
        self._initial_sync_task: Optional[asyncio.Task] = None
        self._catalog_ready = False
        self._ready_event: Optional[asyncio.Event] = None
        # Bumped on every hub disconnect so a sync started for an earlier
        # session can never mark a later one ready.
        self._session_gen = 0
        # Structural refreshes and writes hold the hub session one at a
        # time; a second whole-hub refresh joins the one in flight.
        self._refresh_lock = asyncio.Lock()
        # Exclusive engine operations in flight (writes, restore, erase,
        # backup, refresh) and what the outermost one is, for the message
        # an on-demand read gets when it cannot wait any longer.
        self._hub_holds = 0
        self._hub_held_by: Optional[str] = None
        self._hub_free = asyncio.Event()
        self._hub_free.set()
        self._whole_refresh_task: Optional[asyncio.Task] = None
        # Id of the last projection handed out or announced; a rebase
        # emits ``snapshot_changed`` only when the id moved past it.
        self._last_snapshot_id: Optional[str] = None
        # W1: an ended app session flags the cache (engine side); tell
        # the event consumers so they can offer a refresh.

    # -- escape hatches ----------------------------------------------------

    @property
    def sync(self) -> X1Proxy:
        """The underlying threaded engine."""

        return self._proxy

    @property
    def state(self) -> Any:
        """The engine's :class:`ActivityCache` (read on the loop thread)."""

        return self._proxy.state

    async def run(self, func: Callable, /, *args: Any, **kwargs: Any) -> Any:
        """Run an arbitrary callable in the executor (escape hatch)."""

        return await self._loop.run_in_executor(
            None, functools.partial(func, *args, **kwargs)
        )

    # -- lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        await self.run(self._proxy.start)

    async def stop(self, *, release_hub: bool = False) -> None:
        """Stop the engine; with ``release_hub`` also let the hub go.

        A hub that has just been dropped keeps dialling the shared
        connect-back port for as long as that port is open for other
        hubs, and while it dials it does not advertise itself, so the
        official app cannot find it. It only gives up on a refused
        connection. ``release_hub=True`` therefore releases this hub from
        the shared listener after the stop: the *listening* socket closes
        for a short window and reopens, and for a grace period every
        further dial-back from this hub closes it again, so one of the
        hub's attempts is guaranteed to meet a closed port. Accepted
        sessions are untouched, so every other hub stays connected
        straight through, and their own CALL_ME loops re-summon any that
        happened to be reconnecting inside a window. It is a no-op when
        no other hub is registered (the port is simply closed). Use it
        when a hub is disabled but stays configured; a plain ``stop()``
        is for shutdown.
        """

        await self.run(self._proxy.stop)
        if release_hub:
            await self.run(release_hub_from_listener, self._proxy.real_hub_ip)

    async def __aenter__(self) -> "AsyncXProxy":
        await self.start()
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        await self.stop()

    def set_zeroconf(self, zc: Any) -> None:
        """Adopt a shared Zeroconf instance (cheap; no executor needed)."""

        self._proxy.set_zeroconf(zc)

    # -- readiness -----------------------------------------------------------
    #
    # ``start()`` only spawns the transport thread; the hub TCP connect and
    # banner handshake happen asynchronously after it returns. The proxy
    # has two operating modes, and these waiters gate them:
    #
    #   * observe mode  — the official app is connected through the proxy;
    #     you can watch activity/state changes but cannot issue commands
    #     (the app owns the hub). Gate on :meth:`wait_connected`.
    #   * control mode  — no app attached; the proxy owns the hub, so reads
    #     fetch fresh and commands/backup work. Gate on
    #     :meth:`wait_until_controllable`.
    #
    # Orthogonal to the mode, :meth:`wait_until_discoverable` gates the
    # point at which the official app can *find* the proxy over mDNS — use
    # it when you want the app to attach (e.g. to observe a live session).

    def _ensure_state_watcher(self) -> None:
        if self._state_event is not None:
            return
        self._state_event = asyncio.Event()

        def _on_change(*_args: Any) -> None:
            # Fires on the engine thread; wake the loop.
            self._loop.call_soon_threadsafe(self._state_event.set)

        self._proxy.on_hub_state_change(_on_change)
        self._proxy.on_client_state_change(_on_change)

    async def _wait_for_state(
        self, predicate: Callable[[], bool], timeout: float
    ) -> bool:
        if predicate():
            return True
        self._ensure_state_watcher()
        assert self._state_event is not None
        deadline = self._loop.time() + timeout
        while not predicate():
            remaining = deadline - self._loop.time()
            if remaining <= 0:
                return predicate()
            self._state_event.clear()
            if predicate():
                return True
            try:
                await asyncio.wait_for(self._state_event.wait(), remaining)
            except TimeoutError:
                return predicate()
        return True

    async def wait_connected(self, timeout: float = 30.0) -> bool:
        """Wait until the hub is connected (observe mode can begin).

        Returns ``False`` on timeout.
        """

        return await self._wait_for_state(
            lambda: self._proxy.transport.is_hub_connected, timeout
        )

    async def wait_until_controllable(self, timeout: float = 30.0) -> bool:
        """Wait until the proxy owns the hub (connected, no app attached).

        Reads fetch fresh and commands/backup work once this returns
        ``True``; returns ``False`` on timeout.
        """

        return await self._wait_for_state(self._proxy.can_issue_commands, timeout)

    async def wait_until_discoverable(self, timeout: float = 30.0) -> bool:
        """Wait until the official app can find the proxy over mDNS.

        The app discovers the proxy the same way it discovers a real hub:
        by its mDNS advertisement. The proxy can only advertise once it
        knows which hub it is fronting (model and name), which it reads
        from the hub's connect banner. So this waits for the hub to
        connect, reads that banner, and brings the advertisement up
        aligned to it. Call it after entering the proxy to let the app
        attach (see ``watch``/``minimal_proxy`` examples).

        Returns ``True`` once the proxy is advertising, ``False`` on
        timeout (e.g. the hub never connected). If an app already holds
        the hub it drives the banner itself, so this resolves as soon as
        that identity is known.
        """

        deadline = self._loop.time() + timeout
        # Advertising needs the hub connected so we can read its banner.
        if not await self.wait_connected(timeout=max(0.0, deadline - self._loop.time())):
            return False

        while True:
            # In control mode nothing else asks the hub who it is, so do it
            # ourselves; while an app holds the hub it drives the banner and
            # we just wait for that identity to land.
            if self._proxy.can_issue_commands() and not self._proxy.has_banner_identity():
                await self.run(self._proxy.fetch_banner_info)

            if self._proxy.has_banner_identity():
                # Publish (or realign) the advertisement to the banner
                # identity — update_discovery_identity is what actually
                # starts mDNS once the hub is connected and identified.
                await self.update_discovery_identity(**self._discovery_identity_from_banner())
                return True

            if self._loop.time() >= deadline:
                return False
            await asyncio.sleep(0.1)

    def _discovery_identity_from_banner(self) -> dict[str, Any]:
        """Build the advertised identity from the hub's connect banner.

        The banner is authoritative for the hub's model (-> HVER) and
        name; fold those into the current TXT so the advertisement matches
        the hub the proxy is fronting. Pure in-memory reads, so no executor
        hop is needed.
        """

        info = self._proxy.get_banner_info()
        model = info.get("model") or self._proxy.hub_version
        txt = dict(self._proxy.mdns_txt)
        hver = HVER_BY_HUB_VERSION.get(model)
        if hver:
            txt["HVER"] = hver
        name = str(info.get("name") or "").strip()
        if name:
            txt["NAME"] = name
        return {"mdns_txt": txt, "hub_version": model}

    # -- listeners ------------------------------------------------------------

    def on_burst_end(self, key: str, callback: Callable) -> None:
        """Register a burst-end listener; delivered on the event loop."""

        self._proxy.on_burst_end(key, _marshal_callback(self._loop, callback))

    # -- read surface --------------------------------------------------------

    async def activities(
        self, *, refresh: bool = False, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[Activity]:
        """Return every activity in the hub's catalog, sorted by id.

        ``refresh=True`` re-reads the list from the hub. The engine is
        fetch-then-prune: the cached catalog stays in place until a
        complete reply replaces it, so a refused or failed refresh raises
        the typed error and leaves the last catalog readable.
        """

        # The catalog getters gate fetching on ``force_refresh``, not
        # ``fetch_if_missing`` (which the per-entity getters use).
        rows = await self._catalog_rows(
            self._proxy.get_activities, "activities", refresh=refresh, timeout=timeout
        )
        return [_activity_from_row(act_id, row) for act_id, row in sorted(dict(rows).items())]

    async def devices(
        self, *, refresh: bool = False, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[Device]:
        """Return every device in the hub's catalog, sorted by id.

        ``Device.power_state`` is projected from the row's stored record
        as of the last devices fetch (see :class:`Device`); pass
        ``refresh=True`` to re-read the list, and with it the power
        bytes, from the hub. Fetch-then-prune as for :meth:`activities`:
        a refresh that cannot be issued raises before anything is
        touched, and one that never lands leaves the cached catalog.
        """

        await self._catalog_rows(
            self._proxy.get_devices, "devices", refresh=refresh, timeout=timeout
        )
        # The getter returns the JSON export view, which strips the stored
        # record body on purpose; the power-state byte lives in that body,
        # so project from the engine's own state rows instead.
        rows = await self.run(lambda: dict(self._proxy.state.entities("device")))
        hub_version = self._proxy.hub_version
        return [
            _device_from_row(dev_id, row, hub_version)
            for dev_id, row in sorted(rows.items())
        ]

    async def commands(
        self, device_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[Command]:
        """Return a device's commands, sorted by id.

        Send one with ``send(device_id, command_id)``.
        """

        cmds = await self._read(
            self._proxy.get_commands_for_entity,
            f"commands:{device_id & 0xFF}",
            device_id,
            timeout=timeout,
        )
        return [
            Command(command_id=int(cid), label=str(label))
            for cid, label in sorted(dict(cmds).items())
        ]

    async def buttons(
        self, entity_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[Button]:
        """Return the buttons bound to an activity or device.

        Each :class:`Button` carries the code you can send to
        ``entity_id`` plus the underlying target device command it maps
        to (``device_id``/``command_id`` are ``None`` for unbound slots)
        and, when the hub has one, the long-press pair the remote fires
        on a hold (``long_press_device_id``/``long_press_command_id``,
        both ``None`` otherwise: a pair needs a device and a command).
        """

        codes = await self._read(
            self._proxy.get_buttons_for_entity,
            f"buttons:{entity_id & 0xFF}",
            entity_id,
            timeout=timeout,
        )
        details = await self.run(
            lambda: dict(self._proxy.state.button_details.get(entity_id & 0xFF, {}))
        )
        out: list[Button] = []
        for code in codes:
            bound = details.get(code, {})
            lp_device = bound.get("long_press_device_id")
            lp_command = bound.get("long_press_command_id")
            has_long_press = bool(lp_device) and lp_command is not None
            out.append(
                Button(
                    button_code=int(code),
                    name=BUTTONNAME_BY_CODE.get(code),
                    device_id=bound.get("device_id"),
                    command_id=bound.get("command_id"),
                    long_press_device_id=int(lp_device) if has_long_press else None,
                    long_press_command_id=int(lp_command) if has_long_press else None,
                )
            )
        return out

    async def macros(
        self, activity_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[Macro]:
        """Return an activity's macros.

        Send one with ``send(activity_id, command_id)``.
        """

        macros = await self._read(
            self._proxy.get_macros_for_activity,
            f"macros:{activity_id & 0xFF}",
            activity_id,
            timeout=timeout,
        )
        return [
            Macro(command_id=int(m.get("command_id")), label=m.get("label"))
            for m in macros
            if m.get("command_id") is not None
        ]

    async def favorites(
        self, activity_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[Favorite]:
        """Return an activity's favorites.

        Each favorite is a device command; send one with
        ``send(device_id, command_id)``. Returns an empty list when the
        activity has no favorites.
        """

        # The favorite slots come from the activity keymap; fetching the
        # buttons populates them (best-effort: don't fail favorites if the
        # keymap can't be fetched).
        try:
            await self.buttons(activity_id, timeout=timeout)
        except (RuntimeError, TimeoutError):
            pass

        # ensure_commands_for_activity resolves each favorite's command
        # label, but the per-command fetches it kicks complete
        # asynchronously: poll until it reports ready (or timeout).
        deadline = self._loop.time() + timeout
        while True:
            _, ready = await self.run(
                self._proxy.ensure_commands_for_activity,
                activity_id,
                fetch_if_missing=True,
            )
            if ready or self._loop.time() >= deadline:
                break
            await asyncio.sleep(0.2)

        rich = await self.run(
            self._proxy.state.get_activity_favorite_labels, activity_id & 0xFF
        )
        return [
            Favorite(
                device_id=int(fav.get("device_id")),
                command_id=int(fav.get("command_id")),
                label=fav.get("name"),
            )
            for fav in rich
            if fav.get("device_id") is not None and fav.get("command_id") is not None
        ]

    async def current_activity(self) -> dict | None:
        """Return the activity currently running on the hub, or ``None`` when idle.

        ``{"activity_id": int, "name": str | None}`` — ``activity_id``
        matches the keys of :meth:`activities`. Tracked live from the hub's
        activity-state frames, so it needs no fetch and is available in both
        observe and control mode; transitions also fire
        :meth:`on_activity_change`.
        """

        def _read() -> dict | None:
            act = self._proxy.state.current_activity
            if act is None:
                return None
            act &= 0xFF
            return {
                "activity_id": act,
                "name": self._proxy.state.get_activity_name(act),
            }

        return await self.run(_read)

    # -- status surface ------------------------------------------------------

    async def status(self) -> HubStatus:
        """Return the live connection state of the proxied hub.

        Pure state read, no hub traffic, available in every mode. ``mode``
        is ``"disconnected"`` (no hub session), ``"observe"`` (an app
        client holds the hub through the proxy: reads serve cache, sends
        are refused) or ``"control"`` (the proxy owns the hub).
        """

        def _read() -> HubStatus:
            transport = self._proxy.transport
            hub_connected = bool(transport.is_hub_connected)
            app_connected = bool(transport.is_client_connected)
            controllable = bool(self._proxy.can_issue_commands())
            if controllable:
                mode = "control"
            elif hub_connected:
                mode = "observe"
            else:
                mode = "disconnected"
            # Counts come from the engine's state, never from the catalog
            # getters: those are fetch-if-missing and would enqueue a hub
            # request on a cold engine, which a status poll must not do.
            acts = self._proxy.state.entities("activity")
            devs = self._proxy.state.entities("device")
            act = self._proxy.state.current_activity
            running = None
            if act is not None:
                act &= 0xFF
                running = RunningActivity(
                    activity_id=act, name=self._proxy.state.get_activity_name(act)
                )
            return HubStatus(
                hub_connected=hub_connected,
                app_connected=app_connected,
                controllable=controllable,
                mode=mode,
                hub_version=self._proxy.hub_version,
                proxy_enabled=bool(self._proxy.get_proxy_status()),
                running_activity=running,
                activities_cached=len(acts or {}),
                devices_cached=len(devs or {}),
                catalog_ready=self._catalog_ready,
            )

        return await self.run(_read)

    async def hub_info(self, *, refresh: bool = False) -> HubInfo:
        """Return the hub's identity as read from its connect banner.

        Cached-else-fetch like the reads: the banner known from the
        session is returned directly; ``refresh=True`` (or an unknown
        banner) re-reads it from the hub, which needs control mode and
        raises :class:`HubBusyError` / :class:`HubNotConnectedError`
        otherwise. When nothing is known yet and no fetch is possible the
        result has ``known=False`` rather than raising, so a status page
        can render before the first banner lands.
        """

        def _from_banner(info: dict) -> HubInfo:
            if not info:
                return HubInfo(
                    known=False,
                    model=None,
                    name=None,
                    mac=None,
                    firmware_version=None,
                    production_batch=None,
                )
            return HubInfo(
                known=True,
                model=info.get("model"),
                name=info.get("name") or None,
                mac=info.get("mac"),
                firmware_version=info.get("firmware_version"),
                production_batch=info.get("production_batch"),
            )

        cached = await self.run(self._proxy.get_banner_info)
        if cached and not refresh:
            return _from_banner(cached)
        if not self._proxy.can_issue_commands():
            # An explicit refresh is refused with the typed reason; a plain
            # read degrades to whatever is known (possibly nothing).
            if refresh:
                self._raise_if_cannot_fetch("banner")
            return _from_banner(cached or {})
        await self.run(
            functools.partial(self._proxy.fetch_banner_info, force_refresh=True)
        )
        # Re-read the engine's cache rather than trusting the fetch's return
        # value: the banner lands through the frame handler and the getter
        # is the one place it is guaranteed to be.
        return _from_banner(await self.run(self._proxy.get_banner_info))

    # -- connect-time initial sync ------------------------------------------

    def _arm_initial_sync(self) -> None:
        """Run the catalog minimum fetch on every hub connect (once armed)."""

        if self._initial_sync_armed:
            return
        self._initial_sync_armed = True

        # The transition itself is carried to the loop, not re-derived
        # there: a drop and reconnect that both land before the loop runs
        # would otherwise look like "still connected" and let the previous
        # session's readiness survive into the new one.
        def _on_hub_link(connected: bool) -> None:
            self._loop.call_soon_threadsafe(self._on_hub_link_for_sync, bool(connected))

        def _on_app_link(_connected: bool) -> None:
            self._loop.call_soon_threadsafe(self._maybe_start_initial_sync)

        self._proxy.on_hub_state_change(_on_hub_link)
        self._proxy.on_client_state_change(_on_app_link)

    def _on_hub_link_for_sync(self, connected: bool) -> None:
        if not connected:
            # Session gone: what was cached is no longer known-good, a sync
            # parked on a fetch that can no longer land is abandoned, and
            # the generation moves on so its late completion is ignored.
            self._session_gen += 1
            self._set_catalog_ready(False)
            task = self._initial_sync_task
            if task is not None and not task.done():
                task.cancel()
            return
        self._maybe_start_initial_sync()

    def _maybe_start_initial_sync(self) -> None:
        if not self._proxy.transport.is_hub_connected:
            return
        if self._catalog_ready or not self._proxy.can_issue_commands():
            return
        if self._initial_sync_task is not None and not self._initial_sync_task.done():
            return
        task = self._loop.create_task(self._run_initial_sync(self._session_gen))
        task.add_done_callback(self._on_initial_sync_done)
        self._initial_sync_task = task

    def _on_initial_sync_done(self, task: "asyncio.Task[None]") -> None:
        """A sync task ended: decide again.

        Cancelled (a disconnect landed mid-sync): re-evaluate right away,
        so a reconnect that was processed while the old task was still
        winding down gets its sync after all. Ended without readiness (a
        fetch timed out while the hub stayed connected): try again after
        a pause rather than hammering the hub. Succeeded: ``catalog_ready``
        is set and the re-evaluation is a no-op.
        """

        if task.cancelled():
            self._loop.call_soon(self._maybe_start_initial_sync)
        elif not self._catalog_ready:
            self._loop.call_later(INITIAL_SYNC_RETRY_S, self._maybe_start_initial_sync)

    async def _run_initial_sync(self, session_gen: int) -> None:
        """Banner, devices, activities: the minimum every session caches.

        Runs in order, sharing the burst bridge with concurrent reads, and
        only counts a step as done when the reply actually landed (banner
        ready flag; catalog getter ready flag plus the burst commit flag,
        via ``_await_fetch``). Never raises: a failure (hub dropped
        mid-fetch, app attached, reply never landed) leaves
        ``catalog_ready`` False and the next link-state change tries
        again. A completion for an earlier session generation is ignored.
        """

        try:
            _info, banner_ready = await self.run(
                functools.partial(self._proxy.fetch_banner_info, force_refresh=True)
            )
            if not banner_ready:
                return
            await self._await_fetch(
                self._proxy.get_devices, "devices",
                timeout=DEFAULT_FETCH_TIMEOUT, fetch_kw="force_refresh",
            )
            await self._await_fetch(
                self._proxy.get_activities, "activities",
                timeout=DEFAULT_FETCH_TIMEOUT, fetch_kw="force_refresh",
            )
        except (RuntimeError, TimeoutError):
            return
        if session_gen == self._session_gen and self._proxy.transport.is_hub_connected:
            self._set_catalog_ready(True)

    def _set_catalog_ready(self, ready: bool) -> None:
        if ready == self._catalog_ready:
            return
        self._catalog_ready = ready
        if self._ready_event is None:
            self._ready_event = asyncio.Event()
        if ready:
            self._ready_event.set()
        else:
            self._ready_event.clear()
        self._dispatch_event("catalog_ready", CatalogReady(ready=ready))

    async def wait_until_ready(self, timeout: float = 30.0) -> bool:
        """Wait until the connect-time initial sync has cached the catalog.

        True once banner, devices and activities are known for the
        current hub session (``HubStatus.catalog_ready``); False on
        timeout, or immediately when the facade was constructed with
        ``initial_sync=False``.
        """

        if self._catalog_ready:
            return True
        if not self._initial_sync_armed:
            return False
        if self._ready_event is None:
            self._ready_event = asyncio.Event()
        try:
            await asyncio.wait_for(self._ready_event.wait(), timeout)
        except TimeoutError:
            return self._catalog_ready
        return self._catalog_ready

    # -- event stream --------------------------------------------------------

    def _current_mode(self) -> str:
        if self._proxy.can_issue_commands():
            return "control"
        if self._proxy.transport.is_hub_connected:
            return "observe"
        return "disconnected"

    def _ensure_event_listeners(self) -> None:
        """Register the engine listeners that feed :meth:`events` (once)."""

        if self._event_listeners_armed:
            return
        self._event_listeners_armed = True
        self._last_mode = self._current_mode()
        emit = self._emit_event_threadsafe

        def on_activity(new_id, old_id, name) -> None:
            emit(
                "activity_changed",
                ActivityChanged(
                    activity_id=None if new_id is None else int(new_id) & 0xFF,
                    previous_activity_id=None if old_id is None else int(old_id) & 0xFF,
                    name=name,
                ),
            )

        # These run on the engine thread, possibly INSIDE the transport's
        # own locks (its stop() notifies hub state while holding the socket
        # lock). Nothing here may call back into the transport, so the
        # mode is derived on the loop after the callback has returned.
        def on_hub_state(connected: bool) -> None:
            emit("hub_state", ConnectionState(connected=bool(connected)))
            self._loop.call_soon_threadsafe(self._emit_mode_change)

        def on_app_state(connected: bool) -> None:
            emit("app_state", ConnectionState(connected=bool(connected)))
            self._loop.call_soon_threadsafe(self._emit_mode_change)

        self._proxy.on_activity_change(on_activity)
        self._proxy.on_activity_list_update(lambda: emit("activity_list_updated", None))
        self._proxy.on_hub_state_change(on_hub_state)
        self._proxy.on_client_state_change(on_app_state)
        self._proxy.on_ota_update(lambda: emit("ota", None))

    def _emit_mode_change(self) -> None:
        # Loop thread only: reads the transport flags, which take the
        # transport's locks.
        mode = self._current_mode()
        previous = self._last_mode
        if mode == previous:
            return
        self._last_mode = mode
        self._dispatch_event(
            "status_changed", StatusChanged(mode=mode, previous_mode=previous or "disconnected")
        )

    def _emit_event_threadsafe(self, kind: str, payload: Any) -> None:
        # Engine thread -> loop. Sequence numbers are assigned on the loop
        # so they are strictly ordered as consumers observe them.
        self._loop.call_soon_threadsafe(self._dispatch_event, kind, payload)

    def _dispatch_event(self, kind: str, payload: Any) -> None:
        self._event_seq += 1
        event = HubEvent(seq=self._event_seq, kind=kind, payload=payload)
        for queue in list(self._event_queues):
            if queue.full():
                # Bounded, drop-oldest: a slow consumer loses history, never
                # stalls the engine. The gap shows up as a jump in ``seq``.
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                self.events_dropped += 1
            queue.put_nowait(event)

    async def events(self, *, maxsize: int = 256) -> AsyncIterator[HubEvent]:
        """Iterate over hub events as they happen, as typed :class:`HubEvent`.

        Kinds: ``activity_changed`` (:class:`ActivityChanged`),
        ``snapshot_changed`` (:class:`SnapshotChanged`: a refresh landed,
        a write was rebased or an app session flagged the cache),
        ``activity_list_updated`` (no payload), ``hub_state`` and
        ``app_state`` (:class:`ConnectionState`), ``status_changed``
        (:class:`StatusChanged`, derived: fires once whenever the mode
        flips between disconnected / observe / control) and ``ota`` (no
        payload). Each consumer gets its own bounded queue; when it falls
        ``maxsize`` events behind the oldest are dropped, counted in
        ``events_dropped``, and visible as a gap in ``seq``. The
        ``on_*`` listener registrations keep working alongside.

        Usage::

            async for event in proxy.events():
                print(event.kind, event.to_dict()["payload"])
        """

        self._ensure_event_listeners()
        queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._event_queues.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._event_queues.discard(queue)

    # -- control surface -----------------------------------------------------

    async def send(self, entity_id: int, command_id: int) -> bool:
        """Send a command to a device or activity.

        ``command_id`` is the id from :meth:`commands`/:meth:`macros`/
        :meth:`favorites` (or a button code from :meth:`buttons`). Returns
        ``False`` if refused (a real app client holds the hub).
        """

        return await self.run(self._proxy.send_command, entity_id, command_id)

    # ``press`` is the remote-button-oriented alias of :meth:`send`.
    press = send

    async def start_activity(self, activity_id: int) -> bool:
        """Switch to an activity (sends its power-on)."""

        return await self.run(self._proxy.send_command, activity_id, ButtonName.POWER_ON)

    async def stop_activity(self, activity_id: int) -> bool:
        """Power off an activity."""

        return await self.run(self._proxy.send_command, activity_id, ButtonName.POWER_OFF)

    async def find_remote(self) -> bool:
        """Trigger the hub's find-my-remote signal.

        Returns ``False`` if refused (a real app client holds the hub).
        """

        return await self.run(self._proxy.find_remote)

    # -- live edit surface -----------------------------------------------------
    #
    # In-place editing of one activity or one device: capture a
    # ``hub_bundle`` (``backup_hub_bundle``, typically with
    # ``include_blobs=False``) as the baseline, produce an edited copy,
    # then sync. The engine diffs the two
    # bundles into targeted writes (plan → stale pre-flight → serial
    # ack-gated steps); nothing is deleted-and-restored. For a dry-run
    # preview of what a sync would write, feed the same bundle pair to the
    # pure planners ``build_activity_sync_plan``/``build_device_sync_plan``
    # (exported from the package root).
    #
    # These are explicit methods (not PROXY_METHODS delegates) so the
    # ``progress_callback`` is marshaled onto the event loop instead of
    # firing on the engine thread.

    async def sync_activity(
        self,
        *,
        baseline: dict,
        edited: dict,
        activity_id: int,
        progress: Optional[Callable] = None,
        snapshot_id: Optional[str] = None,
        strict: bool = False,
    ) -> SyncResult:
        """Write the ``baseline`` → ``edited`` diff for one activity to the hub.

        ``baseline`` is a snapshot bundle (:attr:`HubSnapshot.bundle`) and
        ``edited`` a modified copy. Pass ``snapshot_id`` to have the edit
        refused up front (:class:`SnapshotOutdatedError`, no hub traffic)
        when it was made on a snapshot that is no longer current; the
        engine's stale preflight then compares bindings, macros and favorites
        with normalization exceptions. It does not compare every name,
        payload or device-head field. A baseline activity that is not editable
        (never fetched, or fetched incomplete) raises
        :class:`SnapshotIncompleteError` before anything is written.

        Returns a :class:`SyncResult`; a hub-side failure is reported there
        (``failed_at``), never raised. Only the preconditions raise:
        :class:`HubBusyError` / :class:`HubNotConnectedError` when the hub
        cannot be written, and the two snapshot guards below. ``progress`` (sync or async) receives
        a :class:`WriteProgress` per step on the event loop. After a write
        the entity is re-read by the engine and a ``snapshot_changed``
        event carries the new snapshot id.

        ``strict`` makes the engine's stale preflight refuse to write when
        the entity cannot be re-read or comes back incomplete (``failed_at
        == "stale_check"``, ``preflight`` naming which); by default such a
        re-read is logged and the write proceeds, as the live editor
        always did. A batch (:meth:`batch_writes`) uses strict.
        """

        self._raise_if_cannot_fetch(f"sync_activity({int(activity_id) & 0xFF})")
        await self._check_sync_baseline(baseline, "activity", activity_id, snapshot_id)
        async with self._holding_hub("a sync"):
            result = await self.run(
                self._proxy.sync_activity,
                baseline=baseline,
                edited=edited,
                activity_id=activity_id,
                progress_callback=self._engine_progress(progress),
                **({"strict_preflight": True} if strict else {}),
            )
        new_id = await self._rebase_after_write(result, activity_ids=(int(activity_id) & 0xFF,))
        return SyncResult.from_engine(result, snapshot_id=new_id)

    async def sync_device(
        self,
        *,
        baseline: dict,
        edited: dict,
        device_id: int,
        progress: Optional[Callable] = None,
        snapshot_id: Optional[str] = None,
        strict: bool = False,
        allow_command_removal: bool = False,
    ) -> SyncResult:
        """Device-scoped counterpart of :meth:`sync_activity`.

        Same bundle-pair contract, guards, result and rebase, with the
        device id as the entity being edited (command adds and renames,
        payload edits, idle behaviour, input records). Its live comparison
        covers bindings and macros; it does not compare every device field.

        ``allow_command_removal`` also accepts command rows present in the
        baseline but absent from the edit: each is deleted on the hub (the
        hub cascades the references) and the device's display-sort table
        is rewritten once. Without it any removed id is out of scope.
        """

        self._raise_if_cannot_fetch(f"sync_device({int(device_id) & 0xFF})")
        await self._check_sync_baseline(baseline, "device", device_id, snapshot_id)
        async with self._holding_hub("a sync"):
            result = await self.run(
                self._proxy.sync_device,
                baseline=baseline,
                edited=edited,
                device_id=device_id,
                progress_callback=self._engine_progress(progress),
                **({"allow_command_removal": True} if allow_command_removal else {}),
                **({"strict_preflight": True} if strict else {}),
            )
        new_id = await self._rebase_after_write(result, device_ids=(int(device_id) & 0xFF,))
        return SyncResult.from_engine(result, snapshot_id=new_id)

    def _engine_progress(self, progress: Optional[Callable]) -> Optional[Callable]:
        """An engine-side progress callback that delivers :class:`WriteProgress`
        on the loop, or None when the consumer passed none."""

        if progress is None:
            return None
        reporter = _ProgressReporter(self._loop, progress)

        def relay(**payload: Any) -> None:
            self._loop.call_soon_threadsafe(functools.partial(reporter, **payload))

        return relay

    async def _check_sync_baseline(
        self, baseline: Any, kind: str, entity_id: int, snapshot_id: Optional[str]
    ) -> None:
        if snapshot_id is not None:
            current = await self.snapshot()
            if current.snapshot_id != snapshot_id:
                raise SnapshotOutdatedError(
                    f"the edit was made on snapshot {snapshot_id[:12]}..., the current "
                    f"snapshot is {current.snapshot_id[:12]}...; take a new snapshot "
                    "and re-apply the edit"
                )
        payload = _bundle_entity(baseline, kind, entity_id)
        if payload is None:
            return  # unknown entity: the engine's planner reports it
        editable = payload.get("editable", payload.get("complete"))
        if editable is False:
            raise SnapshotIncompleteError(
                f"{kind} {int(entity_id) & 0xFF} is not editable in this snapshot "
                "(never fetched, or fetched incomplete); refresh it first"
            )

    async def _rebase_after_write(
        self,
        result: Any,
        *,
        device_ids: tuple[int, ...] = (),
        activity_ids: tuple[int, ...] = (),
        force: bool = False,
    ) -> Optional[str]:
        """Re-project after a write, announce the move (decision 6) and
        return the snapshot id the consumer should hold now."""

        if isinstance(result, dict) and result.get("status") == "failed":
            if result.get("failed_at") in SYNC_PRE_WRITE_FAILURES:
                return self._last_snapshot_id  # nothing was written
        await self.run(self._proxy.bump_cache_generation)
        snap = await self.snapshot(_announce=False)
        batch = self._batch
        if batch is not None:
            # Inside batch_writes: fold the move into the batch's single
            # event; the projection itself is current for the next read.
            batch.device_ids.update(int(d) & 0xFF for d in device_ids)
            batch.activity_ids.update(int(a) & 0xFF for a in activity_ids)
            batch.rebases += 1
            batch.force = batch.force or force
            return snap.snapshot_id
        if force or snap.snapshot_id != self._last_snapshot_id:
            self._announce_snapshot(snap, device_ids, activity_ids)
        return snap.snapshot_id

    # -- whole-document write (phase 4 plan, H3) ------------------------------

    async def sync_hub(
        self,
        *,
        baseline: Optional[dict] = None,
        desired: Optional[dict] = None,
        state: Optional[ApplyState] = None,
        snapshot_id: Optional[str] = None,
        progress: Optional[Callable] = None,
        on_state: Optional[Callable] = None,
        hub_version: Optional[str] = None,
    ) -> HubSyncResult:
        """Write a whole edited snapshot document to the hub as one run.

        ``baseline`` is the snapshot bundle the client edited and
        ``desired`` its edited copy; new entities carry negative
        placeholder ids (see :mod:`.hub_sync`). Stage A validation runs
        first and raises a :class:`DocumentError` subclass before any hub
        traffic; ``snapshot_id``, when given, is checked against the
        current projection (:class:`SnapshotOutdatedError`). Stage B then
        re-reads the affected entities strictly, comparing device bindings/
        macros and activity bindings/macros/favorites, not the whole entity.
        The items run in the plan's order inside one :meth:`batch_writes`
        block. Preview does not validate every payload's wire encoding.

        Returns a :class:`HubSyncResult`; a hub-side outcome is reported
        there per item, never raised. ``on_state`` (sync or async)
        receives the :class:`ApplyState` after every item and at the end,
        for the consumer to persist; ``sync_hub(state=...)`` resumes a
        stopped or cancelled run: it re-reads what the run touched or was
        about to touch and re-plans remaining items. Current limitations:
        uncertain creates can repeat even with a saved placeholder mapping,
        and a checkpoint may not record an in-flight write before dispatch.
        Do not automatically resume those cases or an abrupt interruption;
        preserve the record and reconcile against the hub first.
        ``progress`` receives :class:`WriteProgress` reports carrying
        ``item_index`` / ``item_count``. Cancelling the awaiting task
        finishes the item in flight and closes the batch before cancellation
        propagates. Requested triggers and notifications are coalesced;
        no-op work need not produce either. Inspect item outcomes before resume.
        """

        self._raise_if_cannot_fetch("sync_hub")
        # One hold for the whole apply: its items' own syncs and re-reads nest inside it.
        async with self._holding_hub("an apply"):
            return await run_sync_hub(
                self, baseline=baseline, desired=desired, state=state, snapshot_id=snapshot_id,
                progress=progress, on_state=on_state, hub_version=hub_version,
            )

    # -- write batch (phase 4 plan, H2 / decision 8) --------------------------

    @contextlib.asynccontextmanager
    async def batch_writes(self, *, send_remote_sync: bool = True) -> AsyncIterator[WriteBatch]:
        """Coalesce requested remote-sync triggers and snapshot notifications.

        Inside the block every write (``sync_*``, ``add_*``, ``remove_*``,
        ``reorder_*``, ``set_hub_name``, ``restore``) behaves as usual and
        rebases the snapshot, but the physical remote-sync trigger each
        one would send is deferred and ``snapshot_changed`` is held back.
        Leaving the block, whether normally, on an exception or on a
        cancellation, **finalises**: the engine sends one trigger if any
        write asked for one (none when nothing did, so an empty batch is
        silent). When a snapshot notification was requested, one
        ``snapshot_changed`` carries every touched id, and
        the yielded :class:`WriteBatch` gets its :class:`BatchOutcome`.
        Finalisation is shielded from cancellation: a task cancelled
        mid-batch still closes the batch before the cancel propagates.

        One batch per proxy at a time; nesting raises ``RuntimeError``.
        ``send_remote_sync=False`` closes without any trigger.
        """

        if self._batch is not None:
            raise RuntimeError("a write batch is already open on this proxy")
        await self.run(self._proxy.begin_write_batch)
        batch = _FacadeBatch(start_snapshot_id=self._last_snapshot_id)
        self._batch = batch
        handle = WriteBatch()
        try:
            yield handle
        finally:
            self._batch = None
            closing = self._loop.create_task(self._close_batch(batch, send_remote_sync))
            try:
                handle.outcome = await asyncio.shield(closing)
            except asyncio.CancelledError:
                # The batch must close: drain the finalisation, then let the
                # cancellation continue.
                handle.outcome = await closing
                raise

    async def _close_batch(self, batch: "_FacadeBatch", send_remote_sync: bool) -> BatchOutcome:
        summary = await self.run(self._proxy.end_write_batch, send_remote_sync=send_remote_sync)
        snap = await self.snapshot(_announce=False)
        device_ids = tuple(sorted(batch.device_ids))
        activity_ids = tuple(sorted(batch.activity_ids))
        if batch.rebases and (batch.force or snap.snapshot_id != batch.start_snapshot_id):
            self._announce_snapshot(snap, device_ids, activity_ids)
        return BatchOutcome(
            remote_sync=summary.get("remote_sync", "not_needed"),
            remote_sync_requests=int(summary.get("remote_sync_requests", 0) or 0),
            device_ids=device_ids,
            activity_ids=activity_ids,
            rebases=batch.rebases,
            snapshot_id=snap.snapshot_id,
        )

    # -- intents (phase 3 plan, W3) -----------------------------------------

    @contextlib.asynccontextmanager
    async def _holding_hub(self, what: str) -> AsyncIterator[None]:
        """Hold the hub for one exclusive engine operation.

        The engine runs a write as a sequence of exchanges, and the hubs
        (the X1 first) refuse a record page when another request lands in
        the middle of it. Reads are cache reads and never get in the way,
        EXCEPT a read whose cache is not complete: that one fetches from
        the hub on demand. After an erase every cache is empty, so a
        client that merely lists the devices would talk to the hub right
        between the rebuild's page writes (found live 2026-09-20: a
        replacing restore failed on its first device with status 0x04
        while a panel polled ``devices()``). While a hold is active such
        a fetch waits for it to end instead (``_wait_for_free_hub``).

        Re-entrant per task: the holder's own nested operations and reads
        (``restore`` calling ``erase``, a refresh reading the catalogs)
        pass straight through.
        """

        if _HUB_HOLDER.get():
            yield
            return
        self._hub_holds += 1
        if self._hub_holds == 1:
            self._hub_held_by = what
            self._hub_free.clear()
        token = _HUB_HOLDER.set(True)
        try:
            yield
        finally:
            _HUB_HOLDER.reset(token)
            self._hub_holds -= 1
            if self._hub_holds == 0:
                self._hub_held_by = None
                self._hub_free.set()

    def _hub_held_by_another(self) -> bool:
        return self._hub_holds > 0 and not _HUB_HOLDER.get()

    async def _wait_for_free_hub(self, key: str, timeout: float) -> None:
        """Wait out an exclusive operation before an on-demand fetch."""

        if not self._hub_held_by_another():
            return
        what = self._hub_held_by or "a write"
        try:
            await asyncio.wait_for(self._hub_free.wait(), timeout)
        except TimeoutError:
            raise FetchTimeoutError(
                f"cannot fetch {key!r} now: {what} holds the hub and nothing complete "
                "is cached; read again when it has finished"
            ) from None

    async def _write(self, what: str, func: Callable, *args: Any, **kwargs: Any) -> Any:
        """Run an engine write: typed refusal before, typed rejection after."""

        self._raise_if_cannot_fetch(what)
        async with self._holding_hub(what):
            result = await self.run(func, *args, **kwargs)
        if result is None or result is False:
            raise HubRejectedError(f"the hub did not accept {what}")
        return result

    async def add_device(self, name: str, device_class: str) -> int:
        """Create an empty device of ``device_class`` and return its hub id.

        ``device_class`` is one of the library's create classes for this
        hub model (``ir`` on every hub; ``wifi_roku``, ``wifi_hue``,
        ``wifi_sonos``, and on the X1S/X2 the further network classes;
        see ``supported_create_classes``); anything else raises
        ``ValueError`` before the hub is touched. Commands and bindings
        come afterwards through :meth:`sync_device`.
        """

        clean = str(name or "").strip()
        if not clean:
            raise ValueError("a device needs a name")
        hub_version = getattr(self._proxy, "hub_version", None)
        allowed = supported_create_classes(hub_version)
        if allowed and device_class not in allowed:
            raise ValueError(
                f"device class {device_class!r} cannot be created on a {hub_version}; "
                f"one of: {', '.join(allowed)}"
            )
        result = await self._write(
            f"add_device({clean!r})", self._proxy.create_device, clean, device_class=device_class
        )
        device_id = int(result.get("device_id") or 0) & 0xFF
        await self._rebase_after_write(result, device_ids=(device_id,), force=True)
        return device_id

    async def add_activity(self, name: str) -> int:
        """Create an empty activity and return its hub id."""

        clean = str(name or "").strip()
        if not clean:
            raise ValueError("an activity needs a name")
        result = await self._write(f"add_activity({clean!r})", self._proxy.create_activity, clean)
        activity_id = int(result.get("activity_id") or 0) & 0xFF
        await self._rebase_after_write(result, activity_ids=(activity_id,), force=True)
        return activity_id

    async def remove_device(self, device_id: int) -> DeviceRemoved:
        """Delete a device; the hub cascades the removal into its activities."""

        dev_lo = int(device_id) & 0xFF
        result = await self._write(f"remove_device({dev_lo})", self._proxy.delete_device, dev_lo)
        removed = DeviceRemoved(
            device_id=dev_lo,
            confirmed_activity_ids=tuple(int(a) & 0xFF for a in result.get("confirmed_activities") or ()),
            impacted_activity_ids=tuple(int(a) & 0xFF for a in result.get("impacted_activities") or ()),
        )
        await self._rebase_after_write(
            result, device_ids=(dev_lo,), activity_ids=removed.impacted_activity_ids, force=True
        )
        return removed

    async def remove_activity(self, activity_id: int) -> None:
        """Delete an activity. The hub's delete keys purely by id (devices
        and activities share one table), so this is the device delete
        with an activity id; nothing cascades."""

        act_lo = int(activity_id) & 0xFF
        if act_lo < 101:
            raise ValueError(f"{act_lo} is not an activity id (activities start at 101)")
        result = await self._write(f"remove_activity({act_lo})", self._proxy.delete_device, act_lo)
        await self._rebase_after_write(result, activity_ids=(act_lo,), force=True)

    # -- managed wifi devices (callbacks plan, C0b / C0c) ---------------------

    def local_address(self) -> str:
        """The local IPv4 address OS routing picks toward the hub.

        What the proxy advertises to the hub and the default callback
        target for :meth:`deploy_wifi_device`. Inside a container on a
        bridge network this is the container's own address, which the
        hub cannot reach; a consumer there passes its host's address
        instead. A pure routing-table lookup, no hub traffic.
        """

        return str(self._proxy.get_routed_local_ip())

    async def deploy_wifi_device(
        self, spec: WifiDeviceSpec, *, host: str, port: int
    ) -> WifiDeployment:
        """Create a managed Wifi Device whose commands call ``host:port``.

        Every slot of ``spec`` (defaults included) becomes a short and a
        long press record whose callback path is
        ``launch/<action_id>/<device_id>/<slot index>/<short|long>``; the
        hub's action id (its MAC) comes back in the deployment's target.
        On the X1 the Roku replay always calls port 8060 (anything else is
        a ``ValueError`` before the hub is touched) and the power and
        input hooks are ignored, since that firmware fires one power and
        one input callback per transition regardless. Returns the
        :class:`WifiDeployment` the consumer must keep for
        :meth:`update_wifi_device`.
        """

        normalized = spec.normalized()
        target = WifiTarget(host=host, port=port)
        hub_version = str(getattr(self._proxy, "hub_version", "") or "")
        if hub_version == HUB_VERSION_X1 and target.port != X1_CALLBACK_PORT:
            raise ValueError(
                f"an X1 hub always calls back on port {X1_CALLBACK_PORT}; got {target.port}"
            )
        if hub_version == HUB_VERSION_X1 and (
            normalized.power_on_slot is not None
            or normalized.power_off_slot is not None
            or normalized.input_slots
        ):
            _LOG.info(
                "deploy_wifi_device: power/input hooks are ignored on an X1 "
                "(one power and one input callback per transition regardless)"
            )
        # The create writes the device and its records; where the commands go
        # (favorites, buttons, input activities) is the in-place planner's
        # work, so a spec that names any is applied as the first update.
        bare = normalized.without_references() if normalized.has_references else normalized
        shape = snapshot_from_spec(bare, device_id=0, hub_version=hub_version, target_host=target.host)
        result = await self._write(
            f"deploy_wifi_device({normalized.name!r})",
            self._proxy.create_wifi_device,
            device_name=normalized.name,
            commands=command_defs_from_spec(normalized),
            request_port=target.port,
            brand_name=normalized.brand,
            power_on_command_id=shape.power_on_command_id,
            power_off_command_id=shape.power_off_command_id,
            input_command_ids=list(shape.input_command_ids) or None,
            send_remote_sync=True,
            ip_address=target.host,
        )
        device_id = int(result.get("device_id") or 0) & 0xFF
        action_id = str(await self.run(self._proxy._stable_hub_action_id) or "")
        await self._rebase_after_write(result, device_ids=(device_id,), force=True)
        deployment = WifiDeployment(
            device_id=device_id,
            spec=bare,
            target=WifiTarget(host=target.host, port=target.port, action_id=action_id),
            labels=labels_from_spec(bare),
            hub_version=hub_version,
        )
        if bare is normalized:
            return deployment
        return await self.update_wifi_device(deployment, normalized)

    async def update_wifi_device(
        self,
        deployment: WifiDeployment,
        spec: WifiDeviceSpec,
        *,
        progress: Optional[Callable] = None,
    ) -> WifiDeployment:
        """Edit a deployed managed Wifi Device in place to match ``spec``.

        Reads the device and every activity back, then plans the diff
        with the in-place planner scoped by ``deployment`` (only what the
        deployment created is ever cleaned up; favorites, bindings and
        memberships the consumer made with the generic intents survive).
        The callback target never changes here: it is what
        ``deployment.target`` says, and a rename on an X1 rewrites the
        head with exactly that address.

        Before any write the live records must still be the deployment's:
        a record whose label equals the deployed one is fine, one that
        already equals the desired one is a resumed interrupted update,
        one that equals neither raises :class:`WifiUpdateDeclined`
        (``reason="drift"``), as does a missing record (``"missing"``),
        an unreadable or different device (``"device"``), a slot naming an
        activity the hub does not have (``"activity"``) or a diff the
        planner refuses (``"planner"``). A write the hub rejects raises
        :class:`WifiUpdateFailed`; the records already rewritten keep
        their new labels and the next update resumes. Returns the new
        :class:`WifiDeployment`.
        """

        normalized = spec.normalized()
        dev_lo = int(deployment.device_id) & 0xFF
        if not dev_lo:
            raise ValueError("the deployment has no device id")
        what = f"update_wifi_device({dev_lo})"
        self._raise_if_cannot_fetch(what)
        hub_version = str(getattr(self._proxy, "hub_version", "") or deployment.hub_version or "")

        def project(label: str) -> str:
            try:
                return hub_command_label(label, hub_version)
            except ValueError:
                return str(label or "").strip()

        # Baseline: the device's structural backup plus every activity
        # (membership is only discoverable by reading them), as the HA
        # in-place path does. The device read also warms the command
        # metadata the rename executor clones codes from.
        activity_ids = sorted(int(a.activity_id) & 0xFF for a in await self.activities())

        def _read_baseline() -> tuple[Any, list[dict]]:
            device_entry = self._proxy.backup_device(dev_lo, include_blobs=False)
            entries: list[dict] = []
            for act_id in activity_ids:
                payload = self._proxy.backup_activity(act_id)
                if isinstance(payload, dict):
                    entries.append(payload)
            return device_entry, entries

        device_entry, activity_entries = await self.run(_read_baseline)
        if not isinstance(device_entry, dict) or len(activity_entries) < len(activity_ids):
            raise WifiUpdateDeclined(
                "device", detail=f"device {dev_lo} or its activities could not be read from the hub"
            )
        baseline = baseline_snapshot_from_bundle(device_entry, activity_entries)
        if baseline.device_id != dev_lo:
            raise WifiUpdateDeclined("device", detail=f"device {dev_lo} is not on the hub")

        desired = snapshot_from_spec(
            normalized, device_id=dev_lo, hub_version=hub_version, target_host=deployment.target.host
        )
        deployed = snapshot_from_spec(
            deployment.spec, device_id=dev_lo, hub_version=hub_version, target_host=deployment.target.host
        )
        unknown = sorted(set(desired.activities) - set(activity_ids))
        if unknown:
            raise WifiUpdateDeclined("activity", detail=f"activities {unknown} are not on the hub")
        expected: dict[int, str] = {int(cid): str(label) for cid, label in deployment.labels.items()} or {
            cid: slot.label for cid, slot in deployed.slots.items()
        }

        missing = sorted(cid for cid in expected if cid not in baseline.slots)
        if missing:
            raise WifiUpdateDeclined("missing", command_ids=missing)
        drift: list[int] = []
        resumed: list[int] = []
        for cid, live_slot in baseline.slots.items():
            live = project(live_slot.label)
            expected_label = expected.get(cid)
            if expected_label is not None and project(expected_label) == live:
                continue
            desired_slot = desired.slots.get(cid)
            if desired_slot is not None and project(desired_slot.label) == live:
                resumed.append(cid)
                continue
            drift.append(cid)
        if drift:
            raise WifiUpdateDeclined("drift", command_ids=sorted(drift))
        if resumed:
            _LOG.info("%s: resuming an interrupted update (command ids %s)", what, sorted(resumed))

        plan = build_wifi_inplace_plan(baseline, desired, deployed=deployed, label_key=project)
        if plan.is_fallback:
            raise WifiUpdateDeclined("planner", detail=plan.fallback_reason)

        updated = WifiDeployment(
            device_id=dev_lo,
            spec=normalized,
            target=deployment.target,
            labels=labels_from_spec(normalized),
            hub_version=hub_version,
        )
        if not plan.steps:
            return updated

        async with self._holding_hub("a callback device write"):
            result = await self.run(
                self._proxy.run_wifi_inplace_plan, plan, progress_callback=self._engine_progress(progress)
            )
        touched = tuple(sorted({
            int(step.payload.get("activity_id")) & 0xFF
            for step in plan.steps
            if step.payload.get("activity_id") is not None
        }))
        await self._rebase_after_write(result, device_ids=(dev_lo,), activity_ids=touched, force=True)
        if not isinstance(result, dict) or result.get("status") != "success":
            data = result if isinstance(result, dict) else {}
            raise WifiUpdateFailed(
                str(data.get("failed_at") or "unknown"),
                completed_steps=int(data.get("completed_steps") or 0),
                message=str(data.get("message") or "") or None,
            )
        return updated

    async def _check_order(self, kind: str, ordered_ids: Sequence[int]) -> tuple[int, ...]:
        ids = tuple(int(i) & 0xFF for i in ordered_ids)
        if len(set(ids)) != len(ids):
            raise ValueError(f"{kind} order repeats an id")
        ready_attr, getter_name = {
            "device": ("_devices_catalog_ready", "get_known_device_ids"),
            "activity": ("_activities_catalog_ready", "get_known_activity_ids"),
        }[kind]
        if getattr(self._proxy, ready_attr, False):
            getter = getattr(self._proxy, getter_name)
            known = {int(i) & 0xFF for i in await self.run(getter)}
            if set(ids) != known:
                missing = sorted(known - set(ids))
                unknown = sorted(set(ids) - known)
                raise ValueError(
                    f"{kind} order must list every {kind} exactly once "
                    f"(missing {missing}, unknown {unknown})"
                )
        return ids

    async def reorder_devices(self, ordered_ids: Sequence[int]) -> None:
        """Store ``ordered_ids`` as the hub's device display order (all devices, once each)."""

        ids = await self._check_order("device", ordered_ids)
        result = await self._write("reorder_devices", self._proxy.reorder_devices, list(ids))
        await self._rebase_after_write(result, device_ids=ids, force=True)

    async def reorder_activities(self, ordered_ids: Sequence[int]) -> None:
        """Store ``ordered_ids`` as the hub's activity display order (all activities, once each)."""

        ids = await self._check_order("activity", ordered_ids)
        result = await self._write("reorder_activities", self._proxy.reorder_activities, list(ids))
        await self._rebase_after_write(result, activity_ids=ids, force=True)

    async def set_hub_name(self, name: str, *, timeout: float = 5.0) -> None:
        """Rename the hub (the name the app and discovery show)."""

        clean = str(name or "").strip()
        if not clean:
            raise ValueError("the hub needs a name")
        await self._write(f"set_hub_name({clean!r})", self._proxy.set_hub_name, clean, timeout=timeout)
        await self._rebase_after_write(None, force=True)

    async def erase(self, *, timeout: float = 120.0) -> None:
        """Wipe every device and activity on the hub. Destructive and final."""

        await self._write("erase", self._proxy.erase_configuration, timeout=timeout)
        await self._rebase_after_write(None, force=True)

    async def backup(
        self,
        *,
        include_blobs: bool = True,
        device_ids: Optional[Sequence[int]] = None,
        progress: Optional[Callable] = None,
        timeout: float = DEFAULT_FETCH_TIMEOUT,
    ) -> dict[str, Any]:
        """Read a ``hub_bundle`` from the hub.

        With ``include_blobs`` (default) every IR payload is dumped too and
        the bundle is restorable (``payload_profile: "full_backup"``); it
        takes minutes and is meant as a user action with ``progress``.
        ``include_blobs=False`` is the structural read :meth:`refresh`
        performs. ``device_ids`` narrows the bundle to those devices (no
        activities). Either way the cache is warmed and
        ``snapshot_changed`` follows.
        """

        self._raise_if_cannot_fetch("backup")
        async with self._holding_hub("a backup"), self._refresh_lock:
            bundle = await self.run(
                self._proxy.backup_hub_bundle,
                include_blobs=include_blobs,
                device_ids=[int(i) & 0xFF for i in device_ids] if device_ids else None,
                wait_timeout=timeout,
                progress=self._engine_progress(progress),
            )
        await self._rebase_after_write(None, force=True)
        return bundle

    async def restore(
        self,
        bundle: dict[str, Any],
        *,
        replace: bool = False,
        progress: Optional[Callable] = None,
    ) -> RestoreResult:
        """Write a full ``hub_bundle`` (from :meth:`backup`) onto the hub.

        Additive: devices and activities are created next to what the hub
        holds, with fresh ids. ``replace=True`` erases the hub first (see
        :meth:`erase`). No rollback on a mid-bundle failure; the result
        says where it stopped and the rebased snapshot shows the hub.
        Cannot be cancelled.
        """

        if not isinstance(bundle, dict) or bundle.get("kind") != "hub_bundle":
            raise ValueError("restore() takes a hub_bundle document")
        self._raise_if_cannot_fetch("restore")
        # Every check the restore would fail on runs BEFORE the erase, so a
        # bad bundle can never cost the hub its configuration (review of
        # 635ecfe, finding 1). Raises ValueError; nothing is written.
        await self.run(self._proxy.preflight_restore_bundle, bundle)
        # One hold over the erase, the gap after it and the rebuild: the
        # erase empties every cache, which is exactly when a stray read
        # would reach the hub (see _holding_hub).
        async with self._holding_hub("a restore"):
            if replace:
                await self.erase()
            async with self._refresh_lock:
                result = await self.run(
                    self._proxy.restore_hub_bundle,
                    bundle,
                    progress_callback=self._engine_progress(progress),
                )
        new_id = await self._rebase_after_write(None, force=True)
        return RestoreResult.from_engine(result, snapshot_id=new_id, erased=bool(replace))

    # -- payloads (phase 3 plan, W3) ----------------------------------------

    async def read_payload(
        self, device_id: int, command_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> Optional[CommandPayload]:
        """Read one command's stored payload from the hub, None when it has none.

        The payload is typed by the device's class: an :class:`IrPayload`
        on an IR (or RF) device, a :class:`NetworkCommand` on a network
        class whose record decodes (its trailer kept, so ``blob`` is the
        stored body), and a :class:`CommandRecord` for everything else (a
        Bluetooth key, a ``wifi_mqtt`` record, an undecodable body). Each
        saves back through ``to_command_row`` / ``edits.set_command_payload``.
        """

        dev_lo, cmd_lo = int(device_id) & 0xFF, int(command_id) & 0xFF
        self._raise_if_cannot_fetch(f"payload:{dev_lo}:{cmd_lo}")
        dump = await self.run(self._proxy.request_ir_command_dump, dev_lo, cmd_lo, timeout=timeout)
        if dump is None:
            raise FetchTimeoutError(f"the hub did not return the payload of {dev_lo}/{cmd_lo}")
        normalized = normalize_dump_to_blobs(
            dump, resolve_device_class=self._proxy._resolve_device_class, fallback_device_id=dev_lo
        )
        for command in (normalized or {}).get("commands") or []:
            if int(command.get("command_id") or 0) & 0xFF != cmd_lo:
                continue
            body = bytes.fromhex(str(command.get("command_blob") or "").strip())
            return payload_from_body(command.get("device_class"), body) if body else None
        return None

    async def play(self, payload: "IrPayload | bytes") -> None:
        """Fire a payload from the hub's IR blaster once; nothing is saved."""

        blob = payload.blob if isinstance(payload, IrPayload) else IrPayload.from_bytes(payload).blob
        await self._write("play", self._proxy.play_ir_blob, blob)

    async def learn_ir(self, *, timeout: float = DEFAULT_LEARN_TIMEOUT) -> IrPayload:
        """Arm the hub's IR receiver and wait for one captured command.

        Point the original remote at the hub and press the key. Returns
        the captured :class:`IrPayload` (save it with
        :meth:`IrPayload.to_command_row` and :meth:`sync_device`). Raises
        :class:`IrLearnError` with the reason when nothing usable arrived;
        :meth:`cancel_learn` ends the wait early from another task. The hub
        itself leaves learn mode after about a minute or on any other
        traffic, so keep the window short and the hub idle.
        """

        result = await self._write("learn_ir", self._proxy.ir_learn_command, timeout=timeout)
        state = str(result.get("state") or "unknown")
        if state != "learned":
            raise IrLearnError(state)
        payload_hex = result.get("payload_hex")
        if not payload_hex:
            raise IrLearnError("undecodable", "a capture arrived but no payload could be extracted")
        return IrPayload.from_hex(str(payload_hex))

    async def cancel_learn(self) -> bool:
        """End an in-flight :meth:`learn_ir`; False when none is waiting."""

        return bool(await self.run(self._proxy.cancel_ir_learn))

    # -- snapshot / refresh / state document (phase 3 plan, W0) ------------

    async def snapshot(self, *, _announce: bool = True) -> HubSnapshot:
        """The hub's structural configuration as the cache holds it, no hub traffic.

        Every device and activity in the catalog is projected, whether or
        not its detail was ever fetched: :attr:`SnapshotEntity.complete`
        and :attr:`SnapshotEntity.editable` say which ones a sync may use
        as a baseline. Works in every mode, including observe mode and
        before the hub has connected (an empty catalog then). Use
        :meth:`refresh` to read from the hub.
        """

        snap = await self.run(self._project_snapshot)
        if _announce:
            self._last_snapshot_id = snap.snapshot_id
        return snap

    def _project_snapshot(self) -> HubSnapshot:
        # Executor thread: pure state reads through the engine.
        proxy = self._proxy
        bundle = proxy.assemble_hub_bundle_from_state(include_unfetched=True) or {}
        bundle.setdefault("devices", [])
        bundle.setdefault("activities", [])
        # The document's array order is the display order (phase 4 plan,
        # decision 6): list entities by the hub's sort byte, ids as the
        # tie-break, so a reordered document holds once the reorder is
        # written and the catalog re-read. The engine's own projection
        # (id order) is what the HA integration keeps reading.
        for key in ("devices", "activities"):
            bundle[key] = sorted(bundle[key], key=_display_order_key)
        state = getattr(proxy, "state", None)
        generation = int(getattr(state, "generation", 0) or 0)
        devices = [_snapshot_entity("device", p) for p in bundle["devices"]]
        activities = [_snapshot_entity("activity", p) for p in bundle["activities"]]
        catalog_known = bool(getattr(proxy, "_devices_catalog_ready", True)) and bool(
            getattr(proxy, "_activities_catalog_ready", True)
        )
        complete = catalog_known and all(e.complete for e in devices + activities)
        bundle["complete"] = complete
        return HubSnapshot(
            snapshot_id=snapshot_content_id(bundle),
            captured_at=str(bundle.get("captured_at") or _now_iso()),
            engine_generation=generation,
            complete=complete,
            hub=dict(bundle.get("hub") or {}),
            devices=devices,
            activities=activities,
            bundle=bundle,
        )

    def _announce_snapshot(
        self,
        snap: HubSnapshot,
        device_ids: tuple[int, ...] = (),
        activity_ids: tuple[int, ...] = (),
    ) -> None:
        self._last_snapshot_id = snap.snapshot_id
        self._ensure_event_listeners()
        self._dispatch_event(
            "snapshot_changed",
            SnapshotChanged(
                snapshot_id=snap.snapshot_id,
                engine_generation=snap.engine_generation,
                device_ids=tuple(device_ids),
                activity_ids=tuple(activity_ids),
            ),
        )

    async def refresh(
        self,
        *,
        activity_id: Optional[int] = None,
        device_id: Optional[int] = None,
        progress: Optional[Callable] = None,
        timeout: float = DEFAULT_FETCH_TIMEOUT,
    ) -> HubSnapshot:
        """Read structural detail from the hub and return the new snapshot.

        The only structural hub read in the library, always at a
        consumer's request. With ``device_id`` or ``activity_id`` one
        entity is re-read (a few bursts). With neither, the whole hub is
        re-read: both catalogs once, then every device and every activity
        in turn, which takes minutes on a real hub; ``progress`` receives a
        :class:`WriteProgress` per entity on the event loop, and
        cancelling the awaiting task stops the read between entities (the
        entity in flight completes). A second whole-hub call while one is
        running joins it and returns the same snapshot. ``timeout`` bounds
        each burst, not the whole operation.

        Raises :class:`HubBusyError` in observe mode and
        :class:`HubNotConnectedError` without a hub session. Ends with a
        ``snapshot_changed`` event naming the entities read.
        """

        if activity_id is not None and device_id is not None:
            raise ValueError("refresh() takes activity_id or device_id, not both")
        if activity_id is None and device_id is None:
            task = self._whole_refresh_task
            if task is not None and not task.done():
                return await asyncio.shield(task)
            task = self._loop.create_task(self._refresh_whole(progress, timeout))
            self._whole_refresh_task = task
            try:
                return await task
            finally:
                if self._whole_refresh_task is task:
                    self._whole_refresh_task = None
        return await self._refresh_one(
            "device" if device_id is not None else "activity",
            int(device_id if device_id is not None else activity_id) & 0xFF,
            progress,
            timeout,
        )

    async def _refresh_one(
        self, kind: str, ent_lo: int, progress: Optional[Callable], timeout: float
    ) -> HubSnapshot:
        report = _ProgressReporter(self._loop, progress)
        async with self._holding_hub("a refresh"), self._refresh_lock:
            self._raise_if_cannot_fetch(f"{kind}:{ent_lo}")
            report(phase=kind, message=f"Refreshing {kind} {ent_lo}…",
                   completed_steps=0, total_steps=1, **{f"current_{kind}_id": ent_lo})
            payload = await self._read_entity_detail_draining(kind, ent_lo, timeout)
            report(phase="finalizing", message=f"Refreshed {kind} {ent_lo}.",
                   completed_steps=1, total_steps=1, **{f"current_{kind}_id": ent_lo})
        if payload is None:
            self._log_unknown_entity(kind, ent_lo)
        snap = await self.snapshot(_announce=False)
        device_ids = (ent_lo,) if kind == "device" else ()
        activity_ids = (ent_lo,) if kind == "activity" else ()
        batch = self._batch
        if batch is not None:
            # Inside batch_writes (a stage B or post-create read of
            # sync_hub): fold into the batch's single event.
            batch.device_ids.update(device_ids)
            batch.activity_ids.update(activity_ids)
            batch.rebases += 1
            batch.force = True
        else:
            self._announce_snapshot(snap, device_ids=device_ids, activity_ids=activity_ids)
        return snap

    async def _refresh_whole(self, progress: Optional[Callable], timeout: float) -> HubSnapshot:
        report = _ProgressReporter(self._loop, progress)
        async with self._holding_hub("a refresh"), self._refresh_lock:
            self._raise_if_cannot_fetch("refresh")
            report(phase="preparing", message="Refreshing devices and activities from the hub…",
                   completed_steps=0, total_steps=0)
            catalog_timeout = max(timeout, 5.0)
            await self.devices(refresh=True, timeout=catalog_timeout)
            await self.activities(refresh=True, timeout=catalog_timeout)
            device_ids = sorted(
                int(i) & 0xFF for i in await self.run(self._proxy.get_known_device_ids)
            )
            activity_ids = sorted(
                int(i) & 0xFF for i in await self.run(self._proxy.get_known_activity_ids)
            )
            total = len(device_ids) + len(activity_ids)
            done = 0
            for kind, ids in (("device", device_ids), ("activity", activity_ids)):
                for ent_lo in ids:
                    report(phase=kind, message=f"Refreshing {kind} {ent_lo}…",
                           completed_steps=done, total_steps=total,
                           **{f"current_{kind}_id": ent_lo})
                    try:
                        payload = await self._read_entity_detail_draining(
                            kind, ent_lo, timeout, refresh_catalog=False
                        )
                    except asyncio.CancelledError:
                        # The entity in flight has landed; publish what the
                        # hub gave us before stopping between entities.
                        snap = await asyncio.shield(self.snapshot(_announce=False))
                        self._announce_snapshot(
                            snap, tuple(device_ids[: done + 1]) if kind == "device" else tuple(device_ids),
                            () if kind == "device" else tuple(activity_ids[: done - len(device_ids) + 1]),
                        )
                        raise
                    if payload is None:
                        self._log_unknown_entity(kind, ent_lo)
                    done += 1
            report(phase="finalizing", message="Finalizing snapshot…",
                   completed_steps=done, total_steps=total)
        snap = await self.snapshot(_announce=False)
        self._announce_snapshot(snap, tuple(device_ids), tuple(activity_ids))
        return snap

    async def _read_entity_detail_draining(
        self, kind: str, ent_lo: int, timeout: float, *, refresh_catalog: bool = True
    ) -> Any:
        """One entity read that a cancellation cannot abandon mid-flight.

        The read runs in the executor; cancelling the awaiting task does
        not stop that thread. Without this, a cancelled refresh released
        ``_refresh_lock`` (and the server freed the hub) while the engine
        was still issuing requests and changing the cache (review of
        635ecfe, finding 4). The read is shielded; on cancellation the
        caller waits for it to land, then re-raises, so the lock is held
        until the hub is quiet and the loop stops before the next entity.

        The drain itself is shielded too: a second cancellation while it
        waits (an impatient client sending DELETE twice) used to reach the
        read task, abandon the executor thread mid-read and release the
        lock anyway (review of ce9f205, P2). Repeated cancellations are
        absorbed until the read has landed, then one is re-raised.
        """

        read = asyncio.ensure_future(
            self._read_entity_detail(kind, ent_lo, timeout, refresh_catalog=refresh_catalog)
        )
        try:
            return await asyncio.shield(read)
        except asyncio.CancelledError:
            while not read.done():
                try:
                    await asyncio.shield(read)
                except asyncio.CancelledError:
                    continue
                except BaseException:  # noqa: BLE001  (the read's own failure is not ours to report)
                    break
            raise

    async def _read_entity_detail(
        self, kind: str, ent_lo: int, timeout: float, *, refresh_catalog: bool = True
    ) -> Any:
        if kind == "device":
            return await self.run(
                self._proxy.backup_device,
                ent_lo,
                wait_timeout=timeout,
                include_blobs=False,
                refresh_catalog=refresh_catalog,
            )
        return await self.run(
            self._proxy.backup_activity,
            ent_lo,
            wait_timeout=timeout,
            refresh_catalog=refresh_catalog,
        )

    def _log_unknown_entity(self, kind: str, ent_lo: int) -> None:
        log = getattr(self._proxy, "_log", None)
        if log is not None:
            log.info("[SNAPSHOT] %s %d disappeared from the catalog during refresh", kind, ent_lo)

    async def export_state(self) -> dict[str, Any]:
        """The engine's cache as an opaque, versioned JSON document.

        Persist it (the library never touches disk) and hand it back to
        :meth:`import_state` before :meth:`start` on the next run to retain
        previously fetched detail. Partial state remains partial; import
        does not make it complete or current. The content is the
        library's own and may change between versions; ``schema`` says
        whether a given library can read it.
        """

        state = await self.run(self._proxy.export_cache_state)
        return {
            "kind": STATE_DOCUMENT_KIND,
            "schema": STATE_DOCUMENT_SCHEMA,
            "library": __version__,
            "exported_at": _now_iso(),
            "state": state,
        }

    async def import_state(self, document: dict[str, Any]) -> HubSnapshot:
        """Load a document from :meth:`export_state` and return the snapshot.

        Meant to run before :meth:`start`; the connect-time initial sync
        then re-reads the catalogs on top of it. Raises
        :class:`StateDocumentError` for a document this library cannot
        read (the consumer keeps running with a cold cache).
        """

        if not isinstance(document, dict) or document.get("kind") != STATE_DOCUMENT_KIND:
            raise StateDocumentError("not a sofabaton state document")
        schema = document.get("schema")
        if schema != STATE_DOCUMENT_SCHEMA:
            raise StateDocumentError(
                f"state document schema {schema!r} is not supported "
                f"(this library reads schema {STATE_DOCUMENT_SCHEMA})"
            )
        state = document.get("state")
        if not isinstance(state, dict):
            raise StateDocumentError("state document carries no state")
        await self.run(self._proxy.import_cache_state, state)
        snap = await self.snapshot(_announce=False)
        self._announce_snapshot(snap)
        return snap

    def _marshal_optional(self, callback: Optional[Callable]) -> Optional[Callable]:
        if callback is None:
            return None
        return _marshal_callback(self._loop, callback)

    # -- lazy-read plumbing --------------------------------------------------

    async def _catalog_rows(
        self, getter: Callable, key: str, *, refresh: bool, timeout: float
    ) -> Any:
        if not refresh:
            return await self._read(getter, key, timeout=timeout, fetch_kw="force_refresh")
        return await self._await_fetch(getter, key, timeout=timeout, fetch_kw="force_refresh")

    async def _read(
        self,
        getter: Callable,
        key: str,
        *args: Any,
        timeout: float,
        fetch_kw: str = "fetch_if_missing",
    ) -> Any:
        """Resolve a lazy ``(data, ready)`` getter to complete data.

        Returns cached data when already complete; otherwise kicks a hub
        fetch and awaits the matching burst. ``fetch_kw`` names the
        getter's "trigger a fetch" keyword — ``fetch_if_missing`` for the
        per-entity getters, ``force_refresh`` for the catalog getters.
        Raises ``RuntimeError`` when the hub can't be queried and nothing
        is cached, ``TimeoutError`` when the burst never lands.
        """

        data, ready = await self.run(getter, *args, **{fetch_kw: False})
        if ready:
            return data
        if self._hub_held_by_another():
            # Not while a write holds the hub; what it leaves behind may
            # well be the complete data this read was after.
            await self._wait_for_free_hub(key, timeout)
            data, ready = await self.run(getter, *args, **{fetch_kw: False})
            if ready:
                return data
        return await self._await_fetch(getter, key, *args, timeout=timeout, fetch_kw=fetch_kw)

    async def _await_fetch(
        self,
        getter: Callable,
        key: str,
        *args: Any,
        timeout: float,
        fetch_kw: str = "fetch_if_missing",
    ) -> Any:
        """Issue (or join) the hub fetch behind ``key`` and await its burst.

        When a fetch for ``key`` is already in flight the call only
        registers for its completion, so concurrent reads and the
        connect-time initial sync share one request.
        """

        self._raise_if_cannot_fetch(key)
        await self._wait_for_free_hub(key, timeout)

        future = self._loop.create_future()
        self._burst_waiters.setdefault(key, []).append(future)
        self._ensure_burst_dispatch(key.split(":", 1)[0])

        # Ownership is released and the waiter dropped on EVERY exit path,
        # including a cancellation that lands while the request is still
        # being issued in the executor; otherwise the key would stay marked
        # in flight and every later read for it would join a fetch nobody
        # owns.
        owner = key not in self._inflight
        if owner:
            self._inflight.add(key)
        try:
            if owner:
                await self.run(getter, *args, **{fetch_kw: True})
            try:
                await asyncio.wait_for(future, timeout)
            except TimeoutError:
                raise FetchTimeoutError(f"timed out after {timeout}s fetching {key!r}")
        except BaseException:
            self._drop_burst_waiter(key, future)
            raise
        finally:
            if owner:
                self._inflight.discard(key)

        # A burst also ends on the engine's idle timeout without any reply
        # having landed; the getter's ready flag (and, for the catalogs,
        # the commit flag of the burst that just ended) is what proves the
        # data is real.
        # The engine may notify the burst end a few instructions before it
        # records completeness (an empty-keymap ACK finishes the burst,
        # then marks the entity), so give the flag a short grace window
        # before calling the fetch a failure.
        for attempt in range(5):
            data, ready = await self.run(getter, *args, **{fetch_kw: False})
            if ready and self._burst_committed(key):
                return data
            await asyncio.sleep(0.02 * (attempt + 1))
        raise FetchTimeoutError(
            f"fetch of {key!r} ended without a complete reply from the hub"
        )

    def _burst_committed(self, key: str) -> bool:
        """Whether the catalog burst behind ``key`` committed a full row set.

        Only the two catalogs carry this signal (``last_*_burst_committed``
        on the engine); every other key is judged by its getter's ready
        flag alone. Engines without the property are trusted.
        """

        attr = {
            "devices": "last_devices_burst_committed",
            "activities": "last_activities_burst_committed",
        }.get(key)
        if attr is None:
            return True
        return bool(getattr(self._proxy, attr, True))

    def _drop_burst_waiter(self, key: str, future: asyncio.Future) -> None:
        pending = self._burst_waiters.get(key)
        if pending and future in pending:
            pending.remove(future)

    def _raise_if_cannot_fetch(self, what: str) -> None:
        """Raise the typed reason a hub fetch is impossible right now."""

        if self._proxy.can_issue_commands():
            return
        if not self._proxy.transport.is_hub_connected:
            raise HubNotConnectedError(
                f"cannot fetch {what!r}: the hub is not connected yet "
                "(await wait_until_controllable() first)"
            )
        raise HubBusyError(
            f"cannot fetch {what!r}: an app client is connected and holds the hub"
        )

    def _ensure_burst_dispatch(self, kind: str) -> None:
        if kind in self._burst_dispatch_kinds:
            return
        self._burst_dispatch_kinds.add(kind)

        def dispatcher(full_key: str) -> None:
            # Fires on the engine thread; hop to the loop to resolve.
            self._loop.call_soon_threadsafe(self._resolve_burst, full_key)

        self._proxy.on_burst_end(kind, dispatcher)

    def _resolve_burst(self, full_key: str) -> None:
        for future in self._burst_waiters.pop(full_key, []):
            if not future.done():
                future.set_result(None)

    def __getattr__(self, name: str) -> Any:
        # Note: only consulted for names not found on the class/instance,
        # so explicit methods above always win.
        if name in self.PROXY_METHODS:
            target = getattr(self._proxy, name)

            async def delegate(*args: Any, **kwargs: Any) -> Any:
                return await self._loop.run_in_executor(
                    None, functools.partial(target, *args, **kwargs)
                )

            functools.update_wrapper(delegate, target)
            return delegate
        if name in self._LISTENER_METHODS:
            register = getattr(self._proxy, name)

            def add_listener(callback: Callable) -> None:
                register(_marshal_callback(self._loop, callback))

            functools.update_wrapper(add_listener, register)
            return add_listener
        raise AttributeError(
            f"{type(self).__name__!s} has no attribute {name!r}; "
            "use .sync to reach the underlying X1Proxy"
        )


class AsyncHubBrowser:
    """Asyncio wrapper around :class:`HubBrowser`.

    Accepts the same callbacks (sync or async); they are delivered on
    the event loop instead of the zeroconf engine thread. Start/stop run
    in the executor because zeroconf engine setup/teardown blocks.
    """

    def __init__(
        self,
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        zc: Any = None,
        include_proxies: bool = False,
        service_types: Optional[Iterable[str]] = None,
        on_added: Optional[Callable] = None,
        on_updated: Optional[Callable] = None,
        on_removed: Optional[Callable] = None,
    ) -> None:
        self._loop = loop or asyncio.get_running_loop()
        kwargs: dict[str, Any] = {
            "zc": zc,
            "include_proxies": include_proxies,
            "on_added": self._wrap(on_added),
            "on_updated": self._wrap(on_updated),
            "on_removed": self._wrap(on_removed),
        }
        if service_types is not None:
            kwargs["service_types"] = service_types
        self._browser = HubBrowser(**kwargs)

    def _wrap(self, callback: Optional[Callable]) -> Optional[Callable]:
        if callback is None:
            return None
        return _marshal_callback(self._loop, callback)

    @property
    def sync(self) -> HubBrowser:
        return self._browser

    @property
    def hubs(self) -> list[DiscoveredHub]:
        return self._browser.hubs

    async def start(self) -> "AsyncHubBrowser":
        await self._loop.run_in_executor(None, self._browser.start)
        return self

    async def stop(self) -> None:
        await self._loop.run_in_executor(None, self._browser.stop)

    async def __aenter__(self) -> "AsyncHubBrowser":
        return await self.start()

    async def __aexit__(self, *exc_info: Any) -> None:
        await self.stop()


# ---------------------------------------------------------------------------
# Engine-method triage
# ---------------------------------------------------------------------------
#
# The facade is curated by hand on purpose: it is a service layer built one
# feature at a time, not a pass-through of X1Proxy. That only stays honest
# if every public engine method was *placed* somewhere deliberately. The
# tiers are:
#
#   * wrapped   -- behind an explicit coroutine (WRAPPED_ENGINE_METHODS)
#   * delegated -- awaitable by name, raw engine signature (PROXY_METHODS)
#   * listener  -- loop-marshaled registration (_LISTENER_METHODS)
#   * engine-only -- not on the facade, with the reason recorded below
#
# tests/lib/test_aio.py asserts the four sets partition the engine's public
# methods exactly, so a new engine method fails CI until it is placed. The
# guard forces a decision, never exposure. Roadmap for the parked entries:
# docs/internal/sofabaton-x-phase1-facade-plan.md.

_R_TRANSPORT = (
    "transport plumbing: invoked by the bridge, deframer and opcode "
    "handlers, never by a consumer"
)
_R_ACK = "ack/exchange primitive composed by higher-level engine operations"
_R_SYNC = (
    "single-shot write primitive composed by sync_activity/sync_device "
    "(phase 1 plan, decision 2)"
)
_R_PHASE3 = "parked past phase 3 W3 (idle behaviour reads, favorites order, MQTT state)"
_R_INTEGRATION = (
    "Home Assistant orchestration hosted in the library, not promoted "
    "(phase 1 plan, decision 3)"
)
_R_F2 = "superseded by phase 1 F2 status()/hub_info()"
_R_F6 = "erase epilogue behind erase_configuration; erase() intent is phase 3 W3"
_R_P3_INTERNAL = "phase 3 engine bookkeeping behind snapshot()/refresh() (W0/W1)"
_R_INTERNAL_READ = (
    "per-entity request/assembly internal behind the facade reads and backup_*"
)
_R_CARD = "Home Assistant card concern"


def _reasons(reason: str, names: Iterable[str]) -> dict[str, str]:
    return {name: reason for name in names}


ENGINE_ONLY: dict[str, str] = {
    **_reasons(
        _R_TRANSPORT,
        (
            "handle_active_state",
            "notify_ack",
            "notify_activity_inputs_frame",
            "notify_hub_ready",
            "notify_ota_in_progress",
            "note_ack_ready_refresh",
            "note_buttons_frame",
            "note_catalog_status_ack",
            "ingest_activity_row",
            "ingest_device_row",
            "record_app_activation",
            "record_banner_payload",
            "record_hub_name",
            "record_idle_behavior_value",
            "record_idle_behavior_absent",
            "try_finish_activities_burst",
            "try_finish_activity_map_burst",
            "try_finish_buttons_burst",
            "try_finish_devices_burst",
            "try_finish_ir_dump_burst",
            "flag_pending_redundant_off_check",
            "parse_device_commands",
            "cache_macro_record",
            "drop_cached_macro_records",
            "set_assigned_device_id",
            "update_x2_remote_sync_id",
            "get_routed_local_ip",
            "enqueue_cmd",
        ),
    ),
    **_reasons(
        _R_ACK,
        (
            "wait_for_ack",
            "wait_for_ack_any",
            "wait_for_ack_family_low",
            "wait_for_any_response",
            "wait_for_assigned_device_id",
            "wait_for_macro_record",
            "wait_for_activity_inputs_burst",
            "wait_for_read_burst_quiesce",
            "wait_for_x2_remote_sync_id",
            "wait_for_virtual_device",
            "clear_ack_queue",
            "reset_ack_queues",
            "exchange",
            "execute_exchange",
            "query_device_input_index",
            "fetch_device_input_entries",
            "start_virtual_device",
            "update_virtual_device",
        ),
    ),
    **_reasons(
        _R_SYNC,
        (
            "set_idle_behavior",
            "overwrite_command_payload",
            "persist_command_record",
            # demoted from PROXY_METHODS in 0.2.0 (phase 1 plan, decision 12)
            "command_to_button",
            "command_to_favorite",
            "delete_favorite",
            "reorder_favorites",
            "add_device_to_activity",
            "persist_ir_blob",
        ),
    ),
    **_reasons(
        _R_PHASE3,
        (
            "get_idle_behavior",
            "fetch_idle_behavior",
            "request_idle_behavior",
            "request_favorites_order",
            "apply_external_activity_state",
        ),
    ),
    **_reasons(
        "learn-mode toggle composed by ir_learn_command (behind learn_ir)",
        ("set_ir_learn_mode",),
    ),
    **_reasons(
        _R_INTEGRATION,
        ("create_wifi_device", "create_wifi_mqtt_device", "run_wifi_inplace_plan"),
    ),
    **_reasons(_R_F2, ("request_banner_info",)),
    **_reasons(_R_F6, ("wipe_all_cached_state",)),
    **_reasons(
        _R_INTERNAL_READ,
        (
            "assemble_activity_backup_from_state",
            "assemble_device_backup_from_state",
            "clear_cached_entity_detail",
            "activities_referencing_device",
            "get_single_command_for_entity",
            "request_buttons_for_entity",
            "request_commands_for_entity",
            "request_macros_for_activity",
            "request_ip_commands_for_device",
        ),
    ),
    **_reasons(_R_CARD, ("on_redundant_off_press",)),
}


def public_engine_methods(engine_cls: type = X1Proxy) -> frozenset[str]:
    """Names of the public *methods* on ``engine_cls`` (properties excluded)."""

    return frozenset(
        name
        for name, member in inspect.getmembers(engine_cls)
        if not name.startswith("_") and inspect.isfunction(member)
    )


def engine_method_triage(engine_cls: type = X1Proxy) -> dict[str, set[str]]:
    """Check that the facade tiers partition the engine's public methods.

    Returns three sets, all empty when the triage is complete:

    * ``untriaged`` -- public engine methods placed in no tier;
    * ``overlap`` -- names placed in more than one tier;
    * ``stale`` -- names placed in a tier that the engine no longer has.
    """

    tiers = {
        "wrapped": set(AsyncXProxy.WRAPPED_ENGINE_METHODS),
        "delegated": set(AsyncXProxy.PROXY_METHODS),
        "listener": set(AsyncXProxy._LISTENER_METHODS),
        "engine_only": set(ENGINE_ONLY),
    }
    placed: dict[str, int] = {}
    for names in tiers.values():
        for name in names:
            placed[name] = placed.get(name, 0) + 1
    public = public_engine_methods(engine_cls)
    return {
        "untriaged": set(public) - set(placed),
        "overlap": {name for name, count in placed.items() if count > 1},
        "stale": set(placed) - set(public),
    }


async def async_discover_hubs(
    timeout: float = DEFAULT_DISCOVERY_TIMEOUT,
    *,
    zc: Any = None,
    include_proxies: bool = False,
) -> list[DiscoveredHub]:
    """Async one-shot hub scan; the blocking browse runs in the executor."""

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        functools.partial(
            discover_hubs, timeout=timeout, zc=zc, include_proxies=include_proxies
        ),
    )
