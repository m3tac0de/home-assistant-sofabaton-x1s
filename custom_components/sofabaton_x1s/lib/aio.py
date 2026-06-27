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
import functools
import inspect
from typing import Any, Callable, Iterable, Optional

from .discovery import (
    DEFAULT_DISCOVERY_TIMEOUT,
    DiscoveredHub,
    HubBrowser,
    discover_hubs,
)
from .hub_versions import HVER_BY_HUB_VERSION
from .protocol_const import BUTTONNAME_BY_CODE, ButtonName
from .x1_proxy import X1Proxy

__all__ = [
    "AsyncXProxy",
    "AsyncHubBrowser",
    "async_discover_hubs",
]

# Default deadline for an awaited read that has to fetch from the hub.
DEFAULT_FETCH_TIMEOUT = 10.0


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
      awaits completion, raising :class:`RuntimeError` when the hub is
      held by a connected app client and nothing is cached, or
      :class:`TimeoutError` when the fetch never lands.
    * **control** — :meth:`press`, :meth:`start_activity`,
      :meth:`stop_activity`, :meth:`find_remote`.

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
            "get_banner_info",
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
            "request_ir_command_dump",
            "fetch_device_input_record",
            "fetch_device_key_sort",
            # actions
            "set_hub_name",
            "set_diag_dump",
            "resync_remote",
            "update_discovery_identity",
            "enable_proxy",
            "disable_proxy",
            # provisioning / mutation
            "create_wifi_device",
            "delete_device",
            "delete_favorite",
            "reorder_favorites",
            "command_to_favorite",
            "command_to_button",
            "add_device_to_activity",
            "play_ir_blob",
            "persist_ir_blob",
            "erase_configuration",
            # backup / restore (symmetric, schema-versioned)
            "backup_device",
            "backup_activity",
            "backup_hub_bundle",
            "restore_device",
            "restore_activity",
            "restore_hub_bundle",
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

    def __init__(
        self,
        *,
        hub_ip: str,
        hub_port: int = 8102,
        hub_listen_port: int = 8200,
        app_discovery_port: int = 8102,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        **proxy_kwargs: Any,
    ) -> None:
        """Construct a proxy for the hub at ``hub_ip``.

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

    @classmethod
    def wrap(
        cls, proxy: X1Proxy, *, loop: Optional[asyncio.AbstractEventLoop] = None
    ) -> "AsyncXProxy":
        """Wrap an already-constructed engine (e.g. mid-migration code)."""

        self = object.__new__(cls)
        self._loop = loop or asyncio.get_running_loop()
        self._proxy = proxy
        self._init_burst_state()
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

    async def stop(self) -> None:
        await self.run(self._proxy.stop)

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
        self, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> dict[int, dict]:
        """Return ``{activity_id: {name, active, ...}}`` for all activities."""

        # The catalog getters gate fetching on ``force_refresh``, not
        # ``fetch_if_missing`` (which the per-entity getters use).
        return await self._read(
            self._proxy.get_activities, "activities", timeout=timeout, fetch_kw="force_refresh"
        )

    async def devices(
        self, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> dict[int, dict]:
        """Return ``{device_id: {name, brand, ...}}`` for all devices."""

        return await self._read(
            self._proxy.get_devices, "devices", timeout=timeout, fetch_kw="force_refresh"
        )

    async def commands(
        self, device_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[dict]:
        """Return a device's commands as ``[{command_id, label}, ...]``.

        Send one with ``send(device_id, command_id)``.
        """

        cmds = await self._read(
            self._proxy.get_commands_for_entity,
            f"commands:{device_id & 0xFF}",
            device_id,
            timeout=timeout,
        )
        return [
            {"command_id": cid, "label": label}
            for cid, label in sorted(dict(cmds).items())
        ]

    async def buttons(
        self, entity_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[dict]:
        """Return the buttons bound to an activity or device.

        Each item is ``{button_code, name, device_id, command_id}`` — the
        button code you can send to ``entity_id`` plus the underlying
        target device command it maps to (``device_id``/``command_id`` are
        ``None`` for unbound slots).
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
        out: list[dict] = []
        for code in codes:
            bound = details.get(code, {})
            out.append(
                {
                    "button_code": code,
                    "name": BUTTONNAME_BY_CODE.get(code),
                    "device_id": bound.get("device_id"),
                    "command_id": bound.get("command_id"),
                }
            )
        return out

    async def macros(
        self, activity_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[dict]:
        """Return an activity's macros as ``[{command_id, label}, ...]``.

        Send one with ``send(activity_id, command_id)``.
        """

        macros = await self._read(
            self._proxy.get_macros_for_activity,
            f"macros:{activity_id & 0xFF}",
            activity_id,
            timeout=timeout,
        )
        return [
            {"command_id": m.get("command_id"), "label": m.get("label")}
            for m in macros
        ]

    async def favorites(
        self, activity_id: int, *, timeout: float = DEFAULT_FETCH_TIMEOUT
    ) -> list[dict]:
        """Return an activity's favorites as ``[{device_id, command_id, label}]``.

        Each favorite is a device command; send one with
        ``send(device_id, command_id)``. Returns an empty list when the
        activity has no favorites.
        """

        # The favorite slots come from the activity keymap; fetching the
        # buttons populates them (best-effort — don't fail favorites if the
        # keymap can't be fetched).
        try:
            await self.buttons(activity_id, timeout=timeout)
        except (RuntimeError, TimeoutError):
            pass

        # ensure_commands_for_activity resolves each favorite's command
        # label, but the per-command fetches it kicks complete
        # asynchronously — poll until it reports ready (or timeout).
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
            {
                "device_id": fav.get("device_id"),
                "command_id": fav.get("command_id"),
                "label": fav.get("name"),
            }
            for fav in rich
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

    # -- lazy-read plumbing --------------------------------------------------

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
        if not self._proxy.can_issue_commands():
            if not self._proxy.transport.is_hub_connected:
                raise RuntimeError(
                    f"cannot fetch {key!r}: the hub is not connected yet "
                    "(await wait_until_controllable() first)"
                )
            raise RuntimeError(
                f"cannot fetch {key!r}: an app client is connected and holds the hub"
            )

        future = self._loop.create_future()
        self._burst_waiters.setdefault(key, []).append(future)
        self._ensure_burst_dispatch(key.split(":", 1)[0])

        await self.run(getter, *args, **{fetch_kw: True})
        try:
            await asyncio.wait_for(future, timeout)
        except TimeoutError:
            pending = self._burst_waiters.get(key)
            if pending and future in pending:
                pending.remove(future)
            raise TimeoutError(f"timed out after {timeout}s fetching {key!r}")

        data, _ = await self.run(getter, *args, **{fetch_kw: False})
        return data

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
