"""Tests for the asyncio facade (lib/aio.py).

The facade owns no protocol logic, so these tests verify its jobs:
executor delegation, thread->loop callback marshaling, and the
human-friendly read/control surface — including the burst->Future bridge
that turns the engine's lazy ``(data, ready)`` getters into clean
awaitables.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import sys
import threading
import types
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofabaton_aio_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
aio = importlib.import_module(f"{_pkg.__name__}.aio")
x1_proxy_mod = importlib.import_module(f"{_pkg.__name__}.x1_proxy")
protocol_const = importlib.import_module(f"{_pkg.__name__}.protocol_const")
errors = importlib.import_module(f"{_pkg.__name__}.errors")


class FakeProxy:
    """Duck-typed engine modelling the lazy-fetch + burst pattern.

    A catalog/detail getter returns ``(data, ready)``; while not ready it
    records a fetch and returns empty. ``make_ready`` + ``fire_burst``
    (optionally from a worker thread) emulate the hub reply landing.
    """

    class _Transport:
        is_hub_connected = True
        is_client_connected = False

    class _State:
        def __init__(self, proxy):
            self._p = proxy
            self.button_details: dict[int, dict] = {}
            self.current_activity: int | None = None
            self.activity_names: dict[int, str] = {}
            # Snapshot provenance mirrors (phase 3 W0).
            self.detail_fetched_at: dict[str, dict[int, str]] = {"device": {}, "activity": {}}
            self.generation = 0

        def get_activity_favorite_labels(self, act_lo):
            return list(self._p.favorite_labels.get(act_lo, []))

        def get_activity_name(self, act_id):
            if act_id is None:
                return None
            return self.activity_names.get(act_id & 0xFF)

        def entities(self, kind):
            # The engine's unstripped rows (raw_body kept); the facade
            # projects devices and status counts from these.
            key = "activities" if kind == "activity" else "devices"
            return dict(self._p._ready.get(key) or {})

    def __init__(self) -> None:
        self._listeners: dict[str, list] = {}
        self.hub_state_listeners: list = []
        self.client_state_listeners: list = []
        self.burst_listeners: dict[str, list] = {}
        self.can_issue = True
        self.started = False
        self.stopped = False
        self.sent: list[tuple[int, int]] = []
        self.fetch_calls: list[tuple[str, int | None]] = []
        self.buttons_ready: dict[int, list] = {}
        self.favorite_labels: dict[int, list] = {}
        self.transport = FakeProxy._Transport()
        self.state = FakeProxy._State(self)
        self._ready: dict[str, dict] = {"commands": {}, "macros": {}, "activities": None, "devices": None}
        # Discovery surface the facade orchestrates: reading the banner
        # (fetch_banner_info) yields an identity (has_banner_identity), which
        # the facade then publishes via update_discovery_identity.
        self.banner_fetches = 0
        self.banner_known = False
        self.advertised: list[tuple[dict, str]] = []
        self.mdns_txt: dict[str, str] = {}
        self.hub_version = "X1"
        self.real_hub_ip = "1.2.3.4"
        # Structural detail per entity (what a backup-grade fetch leaves
        # behind): kind -> id -> list of binding rows. ``pending_detail`` is
        # what the next backup_* call "reads from the hub".
        self.detail: dict[str, dict[int, list]] = {"device": {}, "activity": {}}
        self.pending_detail: dict[str, dict[int, list]] = {"device": {}, "activity": {}}
        self.backup_calls: list[tuple[str, int, bool]] = []
        self.write_calls: list = []
        self.reject = False
        self.payloads: dict[tuple[int, int], bytes] = {}
        descriptor = b"P:NEC1 D:4 F:21"
        descriptive = len(descriptor).to_bytes(2, "big") + bytes([0, 0, 0x11, 0, 0x94, 0x70]) + descriptor + bytes(4)
        self.learn_result: dict = {"state": "learned", "payload_hex": descriptive.hex(" ")}

    # -- snapshot / state document surface (phase 3 W0) -------------------
    def bump_cache_generation(self) -> int:
        self.state.generation += 1
        return self.state.generation

    def get_known_device_ids(self) -> set[int]:
        return set((self._ready["devices"] or {}).keys())

    def get_known_activity_ids(self) -> set[int]:
        return set((self._ready["activities"] or {}).keys())

    def _catalog(self, kind: str) -> dict:
        return dict(self._ready["devices" if kind == "device" else "activities"] or {})

    def _entity_payload(self, kind: str, ent: int) -> dict:
        meta = self._catalog(kind).get(ent) or {}
        fetched = self.detail[kind].get(ent)
        block = {"device_id": ent, "name": meta.get("name")}
        if kind == "activity":
            block["entity_type"] = "activity"
        payload = {
            "kind": f"{kind}_backup",
            "captured_at": "2026-01-01T00:00:00Z",
            "complete": fetched is not None,
            "payload_profile": "structural",
            "device": block,
            "button_bindings": list(fetched or []),
        }
        stamp = self.state.detail_fetched_at[kind].get(ent)
        if stamp:
            payload["fetched_at"] = stamp
        payload["editable"] = payload["complete"]
        return payload

    def assemble_hub_bundle_from_state(self, *, hub_info=None, include_unfetched=False):
        if not include_unfetched and not any(self.state.detail_fetched_at.values()):
            return None
        devices = [self._entity_payload("device", i) for i in sorted(self._catalog("device"))]
        activities = [self._entity_payload("activity", i) for i in sorted(self._catalog("activity"))]
        return {
            "kind": "hub_bundle",
            "captured_at": "2026-01-01T00:00:00Z",
            "complete": all(p["complete"] for p in devices + activities),
            "payload_profile": "structural",
            "hub": {"name": "Fake"},
            "devices": devices,
            "activities": activities,
        }

    def _backup(self, kind: str, ent: int, refresh_catalog: bool):
        self.backup_calls.append((kind, ent, refresh_catalog))
        if ent not in self._catalog(kind):
            return None
        self.detail[kind][ent] = list(self.pending_detail[kind].get(ent, []))
        self.state.detail_fetched_at[kind][ent] = f"stamp-{len(self.backup_calls)}"
        self.bump_cache_generation()
        return self._entity_payload(kind, ent)

    def backup_device(self, device_id, *, wait_timeout=10.0, include_blobs=True,
                      reuse_commands=False, refresh_catalog=True):
        assert include_blobs is False, "refresh() must be structural"
        return self._backup("device", device_id & 0xFF, refresh_catalog)

    def backup_activity(self, activity_id, *, wait_timeout=10.0, refresh_catalog=True):
        return self._backup("activity", activity_id & 0xFF, refresh_catalog)


    def export_cache_state(self) -> dict:
        import copy
        return {
            "catalog": copy.deepcopy(self._ready),
            "detail": copy.deepcopy(self.detail),
            "detail_fetched_at": copy.deepcopy(self.state.detail_fetched_at),
            "generation": self.state.generation,
        }

    # -- intents / payloads (phase 3 W3) ----------------------------------
    # The fake's catalogs count as read unless a test says otherwise.
    _devices_catalog_ready = True
    _activities_catalog_ready = True

    def create_device(self, name, *, device_class):
        self.write_calls.append(("create_device", name, device_class))
        if self.reject:
            return None
        new_id = max(self._catalog("device"), default=0) + 1
        self._ready["devices"] = {**self._catalog("device"), new_id: {"name": name}}
        return {"status": "success", "device_id": new_id}

    def create_activity(self, name):
        self.write_calls.append(("create_activity", name))
        if self.reject:
            return None
        new_id = max(self._catalog("activity"), default=100) + 1
        self._ready["activities"] = {**self._catalog("activity"), new_id: {"name": name}}
        return {"status": "success", "activity_id": new_id}

    def delete_device(self, device_id):
        self.write_calls.append(("delete_device", device_id))
        if self.reject:
            return None
        if device_id >= 101:
            catalog = self._catalog("activity"); catalog.pop(device_id, None)
            self._ready["activities"] = catalog
            self.detail["activity"].pop(device_id, None)
            return {"status": "success", "device_id": device_id, "confirmed_activities": [], "impacted_activities": []}
        catalog = self._catalog("device"); catalog.pop(device_id, None)
        self._ready["devices"] = catalog
        self.detail["device"].pop(device_id, None)
        self.detail["activity"].pop(101, None)   # the hub rewrote it; detail dropped
        return {"status": "success", "device_id": device_id,
                "confirmed_activities": [101], "impacted_activities": [101]}

    def reorder_devices(self, ordered_ids):
        self.write_calls.append(("reorder_devices", list(ordered_ids)))
        return None if self.reject else {"status": "success", "ordered_ids": list(ordered_ids)}

    def reorder_activities(self, ordered_ids):
        self.write_calls.append(("reorder_activities", list(ordered_ids)))
        return None if self.reject else {"status": "success", "ordered_ids": list(ordered_ids)}

    def set_hub_name(self, name, *, timeout=5.0):
        self.write_calls.append(("set_hub_name", name))
        return not self.reject

    def erase_configuration(self, *, timeout=120.0, settle_seconds=2.0):
        self.write_calls.append(("erase",))
        if self.reject:
            return False
        self._ready["devices"] = {}; self._ready["activities"] = {}
        self.detail = {"device": {}, "activity": {}}
        return True

    def backup_hub_bundle(self, *, include_blobs=True, wait_timeout=10.0, progress=None, device_ids=None, hub_info=None):
        self.write_calls.append(("backup", include_blobs))
        if progress is not None:
            progress(status="running", phase="device", message="Backing up device 5…",
                     completed_steps=0, total_steps=1, current_device_id=5)
        for dev in self._catalog("device"):
            self._backup("device", dev, False)
        return {"kind": "hub_bundle", "payload_profile": "full_backup" if include_blobs else "structural",
                "devices": [], "activities": []}

    def preflight_restore_bundle(self, payload):
        self.write_calls.append(("preflight", payload.get("tag")))
        if payload.get("schema_version", 1) != 1:
            raise ValueError("bad schema")
        return {"devices": 1, "activities": 1}

    def restore_hub_bundle(self, payload, *, progress_callback=None, **kwargs):
        self.write_calls.append(("restore", payload.get("tag")))
        if progress_callback is not None:
            progress_callback(status="running", phase="device", message="Restoring…",
                              completed_steps=0, total_steps=2)
        if self.reject:
            # The engine's shape: lists of per-entity records, not counts.
            return {"status": "failed", "failed_at": ["device", 3], "device_id_map": {"3": 9},
                    "restored_devices": [], "restored_activities": []}
        self._ready["devices"] = {**self._catalog("device"), 9: {"name": "Restored"}}
        return {"status": "success", "device_id_map": {"3": 9},
                "restored_devices": [{"source_device_id": 3, "device_id": 9}],
                "restored_activities": [{"source_activity_id": 101, "activity_id": 101}]}

    def request_ir_command_dump(self, device_id, command_id=None, *, timeout=10.0):
        self.write_calls.append(("dump", device_id, command_id))
        blob = self.payloads.get((device_id, command_id))
        if blob is None:
            return {"complete": True, "commands": []}
        # The engine's dump row: blob hex INCLUDING the replay-tail byte.
        return {"complete": True, "commands": [
            {"command_id": command_id, "device_id": device_id, "ir_blob_hex": (blob + b"\x5a").hex()}
        ]}

    def _resolve_device_class(self, device_id):
        return getattr(self, "classes", {}).get(device_id, "ir")

    def play_ir_blob(self, blob, **kwargs):
        self.write_calls.append(("play", bytes(blob)))
        return not self.reject

    def ir_learn_command(self, *, timeout=60.0, ack_timeout=2.0):
        self.write_calls.append(("learn", timeout))
        return self.learn_result

    def cancel_ir_learn(self):
        return True

    def import_cache_state(self, payload: dict) -> None:
        import copy
        self._ready = copy.deepcopy(payload["catalog"])
        self.detail = copy.deepcopy(payload["detail"])
        self.state.detail_fetched_at = copy.deepcopy(payload["detail_fetched_at"])
        self.state.generation = max(self.state.generation, int(payload["generation"]))
        self.bump_cache_generation()

    # -- listener registration ------------------------------------------
    def on_hub_state_change(self, cb) -> None:
        self.hub_state_listeners.append(cb)

    def on_client_state_change(self, cb) -> None:
        self.client_state_listeners.append(cb)

    # The remaining engine listeners, for the events() stream.
    def on_activity_change(self, cb) -> None:
        self._listeners.setdefault("activity", []).append(cb)

    def on_activity_list_update(self, cb) -> None:
        self._listeners.setdefault("activity_list", []).append(cb)

    def on_ota_update(self, cb) -> None:
        self._listeners.setdefault("ota", []).append(cb)

    def on_app_activation(self, cb) -> None:
        self._listeners.setdefault("activation", []).append(cb)

    def fire_activity_change(self, new_id, old_id, name) -> None:
        for cb in self._listeners.get("activity", []):
            cb(new_id, old_id, name)

    def fire_simple(self, which: str) -> None:
        for cb in self._listeners.get(which, []):
            cb()

    def set_connected(self, *, hub: bool, client: bool = False) -> None:
        self.transport.is_hub_connected = hub
        self.transport.is_client_connected = client
        self.can_issue = hub and not client
        for cb in list(self.hub_state_listeners):
            cb(hub)
        for cb in list(self.client_state_listeners):
            cb(client)

    def on_burst_end(self, key, cb) -> None:
        self._listeners.setdefault(key, []).append(cb)
        self.burst_listeners.setdefault(key, []).append(cb)

    # emulate state_helpers.BurstScheduler._notify_burst_end
    def fire_burst(self, full_key: str) -> None:
        for cb in self._listeners.get(full_key, []):
            cb(full_key)
        if ":" in full_key:
            prefix = full_key.split(":", 1)[0]
            for cb in self._listeners.get(prefix, []):
                cb(full_key)

    def fire_hub_state(self, value: bool) -> None:
        for cb in self.hub_state_listeners:
            cb(value)

    # -- gating / lifecycle ---------------------------------------------
    def can_issue_commands(self) -> bool:
        return self.can_issue

    def get_proxy_status(self) -> bool:
        return True

    def has_banner_identity(self) -> bool:
        return self.banner_known

    def fetch_banner_info(self, *, force_refresh=True, timeout=2.0):
        # Reading the banner is only possible when we own the hub.
        self.banner_fetches += 1
        if self.can_issue:
            self.banner_known = True
        return ({}, self.banner_known)

    def get_banner_info(self) -> dict:
        return {"model": "X1S", "name": "Living Room"} if self.banner_known else {}

    def update_discovery_identity(self, *, mdns_txt, hub_version):
        # Publishing the advertisement; record what identity we advertised.
        self.advertised.append((dict(mdns_txt), hub_version))

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.stopped = True

    # -- lazy getters ----------------------------------------------------
    # NOTE: catalog getters gate on force_refresh (matching the real
    # engine); per-entity getters below gate on fetch_if_missing.
    def get_activities(self, *, force_refresh=True):
        if force_refresh:
            self.fetch_calls.append(("activities", None))
            return ({}, False)
        data = self._ready["activities"]
        return (data, True) if data is not None else ({}, False)

    def get_devices(self, *, force_refresh=False):
        if force_refresh:
            self.fetch_calls.append(("devices", None))
            return ({}, False)
        data = self._ready["devices"]
        return (data, True) if data is not None else ({}, False)

    def get_commands_for_entity(self, ent_id, *, fetch_if_missing=True):
        lo = ent_id & 0xFF
        if lo in self._ready["commands"]:
            return (dict(self._ready["commands"][lo]), True)
        if fetch_if_missing:
            self.fetch_calls.append(("commands", lo))
        return ({}, False)

    def get_macros_for_activity(self, act_id, *, fetch_if_missing=True):
        lo = act_id & 0xFF
        if lo in self._ready["macros"]:
            return (list(self._ready["macros"][lo]), True)
        if fetch_if_missing:
            self.fetch_calls.append(("macros", lo))
        return ([], False)

    def get_buttons_for_entity(self, ent_id, *, fetch_if_missing=True):
        lo = ent_id & 0xFF
        if lo in self.buttons_ready:
            return (list(self.buttons_ready[lo]), True)
        if fetch_if_missing:
            self.fetch_calls.append(("buttons", lo))
        return ([], False)

    def ensure_commands_for_activity(self, act_id, *, fetch_if_missing=True):
        return ({}, True)

    def send_command(self, ent_id, key_code) -> bool:
        self.sent.append((ent_id, key_code))
        return True

    # -- test helpers ----------------------------------------------------
    def make_commands_ready(self, lo, data) -> None:
        self._ready["commands"][lo] = data

    def make_activities_ready(self, data) -> None:
        self._ready["activities"] = data


def _wrap(fake: FakeProxy) -> "aio.AsyncXProxy":
    return aio.AsyncXProxy.wrap(fake)


# ---------------------------------------------------------------------------
# delegation / surface guards
# ---------------------------------------------------------------------------


def test_proxy_methods_exist_on_real_engine() -> None:
    missing = [
        name
        for name in aio.AsyncXProxy.PROXY_METHODS
        if not callable(getattr(x1_proxy_mod.X1Proxy, name, None))
    ]
    assert not missing, f"PROXY_METHODS drifted from X1Proxy: {sorted(missing)}"


def test_every_public_engine_method_is_triaged() -> None:
    # The facade is curated by hand on purpose. This guard does not force
    # exposure; it forces a *decision*: every public X1Proxy method must
    # sit in exactly one tier (wrapped / delegated / listener / engine-only
    # with a reason), so a new engine method fails here until placed.
    triage = aio.engine_method_triage(x1_proxy_mod.X1Proxy)
    assert not triage["untriaged"], (
        "public engine methods not placed in any facade tier "
        f"(wrap, delegate, or add to aio.ENGINE_ONLY with a reason): "
        f"{sorted(triage['untriaged'])}"
    )
    assert not triage["overlap"], f"placed in more than one tier: {sorted(triage['overlap'])}"
    assert not triage["stale"], f"placed but gone from the engine: {sorted(triage['stale'])}"


def test_engine_only_entries_carry_a_reason() -> None:
    empty = [name for name, reason in aio.ENGINE_ONLY.items() if not str(reason).strip()]
    assert not empty, f"ENGINE_ONLY entries without a reason: {empty}"


def test_triage_flags_an_unplaced_engine_method() -> None:
    class Grown(x1_proxy_mod.X1Proxy):
        def brand_new_public_method(self) -> None:  # pragma: no cover - never called
            pass

    triage = aio.engine_method_triage(Grown)
    assert triage["untriaged"] == {"brand_new_public_method"}
    assert not triage["overlap"]
    assert not triage["stale"]


def test_human_surface_delegates_to_real_engine_methods() -> None:
    # Each clean method wraps a real engine method; assert those exist so
    # the human surface can't silently drift from the engine.
    required = [
        "get_activities",
        "get_devices",
        "get_commands_for_entity",
        "get_buttons_for_entity",
        "get_macros_for_activity",
        "ensure_commands_for_activity",
        "send_command",
        "can_issue_commands",
        "sync_activity",
        "sync_device",
    ]
    missing = [n for n in required if not callable(getattr(x1_proxy_mod.X1Proxy, n, None))]
    assert not missing, f"engine methods missing: {missing}"

    for name in (
        "activities",
        "devices",
        "commands",
        "buttons",
        "macros",
        "favorites",
        "current_activity",
        "press",
        "start_activity",
        "stop_activity",
        "find_remote",
        "sync_activity",
        "sync_device",
    ):
        assert callable(getattr(aio.AsyncXProxy, name, None)), f"missing facade method {name}"


def test_unknown_attribute_raises_with_hint() -> None:
    async def main():
        proxy = _wrap(FakeProxy())
        try:
            proxy.definitely_not_a_method
        except AttributeError as err:
            assert ".sync" in str(err)
        else:
            raise AssertionError("expected AttributeError")

    asyncio.run(main())


# ---------------------------------------------------------------------------
# read surface
# ---------------------------------------------------------------------------


def test_activities_devices_read_cached_via_force_refresh() -> None:
    # Locks in that the facade uses force_refresh (not fetch_if_missing)
    # for the catalog getters — the real engine signature.
    async def main():
        fake = FakeProxy()
        fake.make_activities_ready({1: {"name": "Watch TV"}})
        fake._ready["devices"] = {5: {"name": "TV"}}
        proxy = _wrap(fake)
        acts = await proxy.activities()
        assert [(a.activity_id, a.name, a.active) for a in acts] == [(1, "Watch TV", False)]
        devs = await proxy.devices()
        assert [(d.device_id, d.name, d.power_state) for d in devs] == [(5, "TV", None)]
        assert fake.fetch_calls == []  # cached: no refresh fetch kicked

    asyncio.run(main())


def test_current_activity_reports_live_state_without_fetch() -> None:
    # current_activity reads the live engine state (no catalog fetch) and
    # is available even in observe mode (app holds the hub).
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=True, client=True)  # observe mode
        fake.state.activity_names = {1: "Watch TV"}
        proxy = _wrap(fake)

        assert await proxy.current_activity() is None  # idle

        fake.state.current_activity = 1
        assert await proxy.current_activity() == {"activity_id": 1, "name": "Watch TV"}
        assert fake.fetch_calls == []  # never triggers a hub fetch

    asyncio.run(main())


def test_read_returns_cached_without_fetch() -> None:
    async def main():
        fake = FakeProxy()
        fake.make_commands_ready(5, {0xC6: "Power"})
        proxy = _wrap(fake)
        assert [c.to_dict() for c in await proxy.commands(5)] == [{"command_id": 0xC6, "label": "Power"}]
        assert fake.fetch_calls == []  # already cached: no hub fetch

    asyncio.run(main())


def test_read_fetches_then_awaits_burst() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        async def land_later():
            await asyncio.sleep(0.05)
            fake.make_commands_ready(5, {0xC6: "Power"})
            # Fire from a worker thread to exercise call_soon_threadsafe.
            t = threading.Thread(target=fake.fire_burst, args=("commands:5",))
            t.start()
            t.join()

        asyncio.ensure_future(land_later())
        result = await proxy.commands(5)
        assert [c.to_dict() for c in result] == [{"command_id": 0xC6, "label": "Power"}]
        assert ("commands", 5) in fake.fetch_calls  # fetch was kicked

    asyncio.run(main())


def test_read_raises_when_app_connected_and_uncached() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=True, client=True)  # app holds the hub
        proxy = _wrap(fake)
        try:
            await proxy.commands(5)
        except RuntimeError as err:
            assert "app client" in str(err)
        else:
            raise AssertionError("expected RuntimeError")
        assert fake.fetch_calls == []  # never tried to fetch

    asyncio.run(main())


def test_read_error_distinguishes_hub_not_connected() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)  # not connected yet, no app
        proxy = _wrap(fake)
        try:
            await proxy.commands(5)
        except RuntimeError as err:
            assert "not connected" in str(err)
            assert "app client" not in str(err)
        else:
            raise AssertionError("expected RuntimeError")

    asyncio.run(main())


def test_wait_until_controllable_resolves_on_state_change() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)  # start: not controllable
        proxy = _wrap(fake)

        async def connect_later():
            await asyncio.sleep(0.05)
            t = threading.Thread(target=fake.set_connected, kwargs={"hub": True})
            t.start()
            t.join()

        asyncio.ensure_future(connect_later())
        assert await proxy.wait_until_controllable(timeout=5) is True

    asyncio.run(main())


def test_wait_until_discoverable_reads_banner_then_advertises() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=True)  # control mode, not yet advertising
        proxy = _wrap(fake)
        assert await proxy.wait_until_discoverable(timeout=2) is True
        # It drove the banner read once, then published the advertisement
        # aligned to the banner identity (model X1S -> HVER "2").
        assert fake.banner_fetches == 1
        assert len(fake.advertised) == 1
        txt, hub_version = fake.advertised[0]
        assert hub_version == "X1S"
        assert txt["HVER"] == "2"
        assert txt["NAME"] == "Living Room"

    asyncio.run(main())


def test_wait_until_discoverable_publishes_without_refetch_when_identity_known() -> None:
    async def main():
        fake = FakeProxy()
        # App attached (observe mode): it drove the banner, so identity is
        # already known but we can't issue commands.
        fake.set_connected(hub=True, client=True)
        fake.banner_known = True
        proxy = _wrap(fake)
        assert await proxy.wait_until_discoverable(timeout=2) is True
        # No banner read needed; we just (re)published the advertisement.
        assert fake.banner_fetches == 0
        assert len(fake.advertised) == 1

    asyncio.run(main())


def test_wait_until_discoverable_false_when_hub_never_connects() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)
        proxy = _wrap(fake)
        assert await proxy.wait_until_discoverable(timeout=0.2) is False
        assert fake.banner_fetches == 0
        assert fake.advertised == []

    asyncio.run(main())


def test_wait_connected_true_in_observe_mode() -> None:
    async def main():
        fake = FakeProxy()
        # Hub up but app attached: connected (observe) yet not controllable.
        fake.set_connected(hub=True, client=True)
        proxy = _wrap(fake)
        assert await proxy.wait_connected(timeout=1) is True
        assert await proxy.wait_until_controllable(timeout=0.2) is False

    asyncio.run(main())


def test_read_returns_cached_even_when_app_connected() -> None:
    async def main():
        fake = FakeProxy()
        fake.can_issue = False
        fake.make_commands_ready(5, {0xC6: "Power"})
        proxy = _wrap(fake)
        assert [c.to_dict() for c in await proxy.commands(5)] == [{"command_id": 0xC6, "label": "Power"}]

    asyncio.run(main())


def test_read_timeout_cleans_up_waiter() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        try:
            await proxy.commands(7, timeout=0.05)
        except TimeoutError:
            pass
        else:
            raise AssertionError("expected TimeoutError")
        assert proxy._burst_waiters.get("commands:7", []) == []  # no leak

    asyncio.run(main())


def test_favorites_returns_rich_device_command_label() -> None:
    async def main():
        fake = FakeProxy()
        fake.buttons_ready[101] = []  # keymap fetched (no buttons), so no wait
        fake.favorite_labels[101] = [
            {"name": "Denon Power", "device_id": 3, "command_id": 45}
        ]
        proxy = _wrap(fake)
        assert [f.to_dict() for f in await proxy.favorites(101)] == [
            {"device_id": 3, "command_id": 45, "label": "Denon Power"}
        ]

    asyncio.run(main())


def test_commands_and_buttons_return_send_pairs() -> None:
    async def main():
        fake = FakeProxy()
        fake.make_commands_ready(5, {12: "Sleep"})
        fake.buttons_ready[101] = [174, 175, 176]
        fake.state.button_details = {
            101: {
                174: {"device_id": 3, "command_id": 20},
                # A long-press pair rides on the same row.
                175: {"device_id": 3, "command_id": 21,
                      "long_press_device_id": 4, "long_press_command_id": 9},
                # A command without a device is not a pair (remote.py rule).
                176: {"device_id": 3, "command_id": 22, "long_press_command_id": 9},
            }
        }
        proxy = _wrap(fake)

        assert [c.to_dict() for c in await proxy.commands(5)] == [{"command_id": 12, "label": "Sleep"}]

        btns = await proxy.buttons(101)
        assert [b.to_dict() for b in btns] == [
            {"button_code": 174, "name": btns[0].name, "device_id": 3, "command_id": 20,
             "long_press_device_id": None, "long_press_command_id": None},
            {"button_code": 175, "name": btns[1].name, "device_id": 3, "command_id": 21,
             "long_press_device_id": 4, "long_press_command_id": 9},
            {"button_code": 176, "name": btns[2].name, "device_id": 3, "command_id": 22,
             "long_press_device_id": None, "long_press_command_id": None},
        ]
        assert set(btns[0].to_dict()) == {
            "button_code", "name", "device_id", "command_id",
            "long_press_device_id", "long_press_command_id",
        }

    asyncio.run(main())


# ---------------------------------------------------------------------------
# control surface
# ---------------------------------------------------------------------------


def test_press_and_activity_control() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        assert await proxy.press(101, 0xB0) is True
        await proxy.start_activity(5)
        await proxy.stop_activity(5)

        assert fake.sent[0] == (101, 0xB0)
        assert fake.sent[1] == (5, protocol_const.ButtonName.POWER_ON)
        assert fake.sent[2] == (5, protocol_const.ButtonName.POWER_OFF)

    asyncio.run(main())


# ---------------------------------------------------------------------------
# executor delegation / lifecycle / marshaling
# ---------------------------------------------------------------------------


def test_lifecycle_and_context_manager() -> None:
    async def main():
        fake = FakeProxy()
        async with _wrap(fake) as proxy:
            assert fake.started and not fake.stopped
            assert proxy.sync is fake
        assert fake.stopped

    asyncio.run(main())


def test_run_escape_hatch() -> None:
    async def main():
        proxy = _wrap(FakeProxy())
        assert await proxy.run(lambda a, b: a + b, 2, b=3) == 5

    asyncio.run(main())


def test_delegated_method_runs_in_executor() -> None:
    async def main():
        call_thread = {}

        # restore_device is a delegated PROXY_METHODS name.
        class WithProvision(FakeProxy):
            def restore_device(self, *args, **kwargs):
                call_thread["t"] = threading.get_ident()
                return {"ok": True}

        proxy = _wrap(WithProvision())
        assert await proxy.restore_device({}) == {"ok": True}
        assert call_thread["t"] != threading.get_ident()

    asyncio.run(main())


def test_cache_snapshot_serializers_are_not_on_facade() -> None:
    # The engine's raw (de)serializers stay off the public async surface;
    # the typed state document (export_state / import_state) is the
    # facade's face for them (phase 3 W0).
    async def main():
        proxy = _wrap(FakeProxy())
        assert callable(proxy.export_state) and callable(proxy.import_state)
        for name in ("export_cache_state", "import_cache_state", "clear_cached_entity_detail"):
            assert name not in aio.AsyncXProxy.PROXY_METHODS
            try:
                getattr(proxy, name)
            except AttributeError:
                pass
            else:
                raise AssertionError(f"{name} should not be exposed on the facade")

    asyncio.run(main())


def test_live_edit_sync_runs_in_executor_with_loop_progress() -> None:
    # sync_activity/sync_device are explicit facade methods (not
    # PROXY_METHODS delegates) so the progress callback lands on the event
    # loop while the engine call itself runs in the executor.
    async def main():
        call_threads = {}
        progress_threads: list[int] = []
        done = asyncio.Event()

        class WithSync(FakeProxy):
            def sync_activity(self, *, baseline, edited, activity_id, progress_callback=None):
                call_threads["activity"] = threading.get_ident()
                if progress_callback is not None:
                    progress_callback(phase="writing", completed_steps=0, total_steps=1)
                return {"status": "success", "completed_steps": 1, "total_steps": 1}

            def sync_device(self, *, baseline, edited, device_id, progress_callback=None):
                call_threads["device"] = threading.get_ident()
                return {"status": "success", "completed_steps": 0, "total_steps": 0}

        proxy = _wrap(WithSync())
        loop_thread = threading.get_ident()
        seen: list = []

        def on_progress(report) -> None:
            progress_threads.append(threading.get_ident())
            seen.append(report)
            done.set()

        result = await proxy.sync_activity(
            baseline={}, edited={}, activity_id=0x65, progress=on_progress
        )
        assert isinstance(result, models.SyncResult) and result.ok
        assert result.completed_steps == 1 and result.snapshot_id
        assert call_threads["activity"] != loop_thread

        await asyncio.wait_for(done.wait(), 5)
        assert progress_threads == [loop_thread]
        assert isinstance(seen[0], models.WriteProgress) and seen[0].phase == "writing"

        result = await proxy.sync_device(baseline={}, edited={}, device_id=3)
        assert result.to_dict()["status"] == "success" and result.total_steps == 0
        assert call_threads["device"] != loop_thread

    asyncio.run(main())


def test_sync_callback_delivered_on_loop_thread() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        loop_thread = threading.get_ident()
        seen: list[tuple[bool, int]] = []
        done = asyncio.Event()

        def cb(value: bool) -> None:
            seen.append((value, threading.get_ident()))
            done.set()

        proxy.on_hub_state_change(cb)
        worker = threading.Thread(target=fake.fire_hub_state, args=(True,))
        worker.start()
        worker.join()
        await asyncio.wait_for(done.wait(), 5)
        assert seen == [(True, loop_thread)]

    asyncio.run(main())


def test_coroutine_callback_scheduled_on_loop() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        loop_thread = threading.get_ident()
        seen: list[tuple[str, bool, int]] = []
        done = asyncio.Event()

        async def cb(value: bool) -> None:
            seen.append(("coro", value, threading.get_ident()))
            done.set()

        proxy.on_hub_state_change(cb)
        proxy.on_burst_end("devices", lambda *a: None)  # registration shape check
        assert "devices" in fake.burst_listeners

        worker = threading.Thread(target=fake.fire_hub_state, args=(False,))
        worker.start()
        worker.join()
        await asyncio.wait_for(done.wait(), 5)
        assert seen == [("coro", False, loop_thread)]

    asyncio.run(main())


# ---------------------------------------------------------------------------
# discovery facade
# ---------------------------------------------------------------------------


def test_async_discover_hubs_delegates(monkeypatch) -> None:
    sentinel = ["hub"]
    captured: dict = {}

    def fake_discover(*, timeout, zc, include_proxies):
        captured.update(timeout=timeout, zc=zc, include_proxies=include_proxies)
        captured["thread"] = threading.get_ident()
        return sentinel

    monkeypatch.setattr(aio, "discover_hubs", fake_discover)

    async def main():
        result = await aio.async_discover_hubs(0.5, include_proxies=True)
        assert result is sentinel
        assert captured["timeout"] == 0.5 and captured["include_proxies"] is True
        assert captured["thread"] != threading.get_ident()

    asyncio.run(main())


def test_async_hub_browser_marshals_callbacks() -> None:
    discovery = importlib.import_module(f"{_pkg.__name__}.discovery")
    hub_versions = importlib.import_module(f"{_pkg.__name__}.hub_versions")

    class FakeServiceInfo:
        port = 8102
        properties = {b"HVER": b"2", b"NAME": b"Den"}

        def parsed_addresses(self):
            return ["192.168.1.50"]

    class FakeZeroconf:
        def get_service_info(self, service_type, name, timeout=3000):
            return FakeServiceInfo()

    class FakeStateChange:
        name = "Added"

    async def main():
        loop_thread = threading.get_ident()
        seen: list[tuple[str, int]] = []
        done = asyncio.Event()

        async def on_added(hub) -> None:
            seen.append((hub.name, threading.get_ident()))
            done.set()

        browser = aio.AsyncHubBrowser(zc=FakeZeroconf(), on_added=on_added)
        browser.sync._create_browser = lambda zc: types.SimpleNamespace(
            cancel=lambda: None
        )
        await browser.start()
        try:
            worker = threading.Thread(
                target=browser.sync._on_service_state_change,
                args=(
                    browser.sync._zc,
                    hub_versions.MDNS_SERVICE_TYPE_X1,
                    "DEN._x1hub._udp.local.",
                    FakeStateChange(),
                ),
            )
            worker.start()
            worker.join()
            await asyncio.wait_for(done.wait(), 5)
        finally:
            await browser.stop()

        assert seen == [("Den", loop_thread)]
        # The snapshot survives stop(); it reflects the last browse state.
        assert [hub.name for hub in browser.hubs] == ["Den"]

    asyncio.run(main())


# ---------------------------------------------------------------------------
# typed errors + status surface (phase 1 F4 / F2)
# ---------------------------------------------------------------------------

errors = importlib.import_module(f"{_pkg.__name__}.errors")
models = importlib.import_module(f"{_pkg.__name__}.models")


def test_typed_errors_are_stdlib_subclasses() -> None:
    assert issubclass(errors.HubNotConnectedError, RuntimeError)
    assert issubclass(errors.HubBusyError, RuntimeError)
    assert issubclass(errors.FetchTimeoutError, TimeoutError)


def test_read_raises_typed_busy_and_not_connected() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        fake.set_connected(hub=True, client=True)
        try:
            await proxy.commands(1)
        except errors.HubBusyError:
            pass
        else:
            raise AssertionError("expected HubBusyError")
        fake.set_connected(hub=False)
        try:
            await proxy.commands(1)
        except errors.HubNotConnectedError:
            pass
        else:
            raise AssertionError("expected HubNotConnectedError")

    asyncio.run(main())


def test_read_timeout_is_typed() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        try:
            await proxy.commands(1, timeout=0.05)
        except errors.FetchTimeoutError:
            pass
        else:
            raise AssertionError("expected FetchTimeoutError")

    asyncio.run(main())


def test_status_reports_mode_and_counts() -> None:
    async def main():
        fake = FakeProxy()
        fake.make_activities_ready({1: {"name": "TV"}, 2: {"name": "Music"}})
        fake.state.current_activity = 0x0102
        fake.state.activity_names[2] = "Music"
        proxy = _wrap(fake)

        st = await proxy.status()
        assert isinstance(st, models.HubStatus)
        assert st.mode == "control" and st.controllable and st.hub_connected
        assert st.hub_version == "X1" and st.proxy_enabled
        assert st.activities_cached == 2 and st.devices_cached == 0
        assert st.running_activity == models.RunningActivity(activity_id=2, name="Music")
        assert st.to_dict()["running_activity"] == {"activity_id": 2, "name": "Music"}

        fake.set_connected(hub=True, client=True)
        assert (await proxy.status()).mode == "observe"
        fake.set_connected(hub=False)
        st = await proxy.status()
        assert st.mode == "disconnected" and not st.app_connected

    asyncio.run(main())


def test_hub_info_cached_then_refresh_then_busy() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        # Nothing known and control mode: hub_info fetches the banner.
        info = await proxy.hub_info()
        assert fake.banner_fetches == 1
        assert isinstance(info, models.HubInfo) and info.known
        assert info.model == "X1S" and info.name == "Living Room"

        # Known banner is served from cache without a fetch.
        await proxy.hub_info()
        assert fake.banner_fetches == 1
        # refresh=True forces a re-read.
        await proxy.hub_info(refresh=True)
        assert fake.banner_fetches == 2

        # Observe mode: cached identity still served, refresh refused typed.
        fake.set_connected(hub=True, client=True)
        assert (await proxy.hub_info()).known
        try:
            await proxy.hub_info(refresh=True)
        except errors.HubBusyError:
            pass
        else:
            raise AssertionError("expected HubBusyError")

    asyncio.run(main())


def test_hub_info_unknown_without_fetch_is_not_an_error() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)
        proxy = _wrap(fake)
        info = await proxy.hub_info()
        assert not info.known and info.model is None
        assert fake.banner_fetches == 0

    asyncio.run(main())


# ---------------------------------------------------------------------------
# typed catalog results (phase 1 F3)
# ---------------------------------------------------------------------------

devices_mod = importlib.import_module(f"{_pkg.__name__}.devices")


def test_devices_project_power_state_from_stored_record() -> None:
    async def main():
        fake = FakeProxy()
        fake.hub_version = "X1S"
        on = devices_mod.DeviceConfig(name="TV", brand="Sony", power_state=1)
        # The create payload carries a 3-byte header in front of the record
        # body; the catalog row stores the body alone (what parse expects).
        body_on = devices_mod.build_device_create_payload(on, hub_version="X1S")[3:]
        # The catalog row keeps the record body; the facade parses the
        # power byte out of it (None when the body is missing or bad).
        fake._ready["devices"] = {
            5: {"name": "TV", "brand": "Sony", "device_class": "ir",
                "device_class_code": 1, "raw_body": body_on, "idle_behavior": 2},
            6: {"name": "Amp", "raw_body": b"\x00\x01"},
            7: {"name": "Lamp"},
        }
        proxy = _wrap(fake)
        devs = {d.device_id: d for d in await proxy.devices()}
        assert devs[5].power_state == 1
        assert devs[5].brand == "Sony" and devs[5].device_class == "ir"
        assert devs[5].device_class_code == 1 and devs[5].idle_behavior == 2
        assert devs[6].power_state is None  # unparseable body
        assert devs[7].power_state is None and devs[7].brand is None
        assert devs[5].to_dict()["power_state"] == 1

    asyncio.run(main())


def test_activities_carry_flags_and_sort_by_id() -> None:
    async def main():
        fake = FakeProxy()
        fake.make_activities_ready({
            102: {"name": "Music", "active": True, "needs_confirm": True},
            101: {"name": "TV", "active": False},
        })
        proxy = _wrap(fake)
        acts = await proxy.activities()
        assert [a.activity_id for a in acts] == [101, 102]
        assert acts[1] == models.Activity(activity_id=102, name="Music", active=True, needs_confirm=True)
        assert acts[0].to_dict() == {"activity_id": 101, "name": "TV", "active": False, "needs_confirm": False}

    asyncio.run(main())


# ---------------------------------------------------------------------------
# event stream (phase 1 F5)
# ---------------------------------------------------------------------------


async def _collect_until(proxy, kind, *, timeout=2.0):
    """Events up to and including the first one of ``kind``."""

    out = []
    agen = proxy.events()
    try:
        while not out or out[-1].kind != kind:
            out.append(await asyncio.wait_for(agen.__anext__(), timeout))
    finally:
        await agen.aclose()
    return out


async def _collect(proxy, n, *, maxsize=256, timeout=2.0):
    out = []
    agen = proxy.events(maxsize=maxsize)
    try:
        while len(out) < n:
            out.append(await asyncio.wait_for(agen.__anext__(), timeout))
    finally:
        await agen.aclose()
    return out


def test_events_fold_every_listener_into_typed_hub_events() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        async def fire():
            await asyncio.sleep(0.01)
            # From a worker thread, like the engine.
            def _engine():
                fake.fire_activity_change(0x0102, None, "Music")
                fake.fire_simple("activity_list")
                fake.fire_simple("ota")
            t = threading.Thread(target=_engine)
            t.start(); t.join()

        asyncio.ensure_future(fire())
        events = await _collect(proxy, 3)
        assert [e.kind for e in events] == ["activity_changed", "activity_list_updated", "ota"]
        assert [e.seq for e in events] == [1, 2, 3]
        assert events[0].payload == models.ActivityChanged(activity_id=2, previous_activity_id=None, name="Music")
        assert events[1].payload is None
        assert events[0].to_dict() == {
            "seq": 1, "kind": "activity_changed",
            "payload": {"activity_id": 2, "previous_activity_id": None, "name": "Music"},
        }
        assert isinstance(events[0], models.HubEvent)

    asyncio.run(main())


def test_events_emit_status_changed_once_per_mode_flip() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        async def fire():
            # The mode is derived on the loop after each callback (the
            # callbacks may run under the transport's locks), so yield
            # between flips the way real engine-thread callbacks would.
            await asyncio.sleep(0.01)
            fake.set_connected(hub=True, client=True)   # control -> observe
            await asyncio.sleep(0.01)
            fake.set_connected(hub=True, client=True)   # no flip: no status event
            await asyncio.sleep(0.01)
            fake.set_connected(hub=False)               # observe -> disconnected

        asyncio.ensure_future(fire())
        # 1st set: hub_state, app_state, status_changed; 2nd: hub_state, app_state;
        # 3rd: hub_state, app_state, status_changed.
        events = await _collect(proxy, 8)
        kinds = [e.kind for e in events]
        assert kinds.count("status_changed") == 2
        flips = [e.payload for e in events if e.kind == "status_changed"]
        assert flips[0] == models.StatusChanged(mode="observe", previous_mode="control")
        assert flips[1] == models.StatusChanged(mode="disconnected", previous_mode="observe")
        assert events[0].payload == models.ConnectionState(connected=True)

    asyncio.run(main())


def test_events_bounded_queue_drops_oldest_and_counts() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        agen = proxy.events(maxsize=2)
        # Prime the generator so its queue is registered, then flood it
        # before consuming.
        first_task = asyncio.ensure_future(agen.__anext__())
        await asyncio.sleep(0.01)
        for i in range(5):
            fake.fire_simple("ota")
        await asyncio.sleep(0.01)
        first = await first_task
        second = await asyncio.wait_for(agen.__anext__(), 1.0)
        await agen.aclose()
        # All five dispatches run on the loop before the pending get
        # resumes, so capacity 2 keeps the newest two (4, 5) and drops
        # three (1, 2, 3), each counted.
        assert proxy.events_dropped == 3
        assert (first.seq, second.seq) == (4, 5)

    asyncio.run(main())


def test_events_consumer_exit_unregisters_queue() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        agen = proxy.events()
        task = asyncio.ensure_future(agen.__anext__())
        await asyncio.sleep(0.01)
        assert len(proxy._event_queues) == 1
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        # Cancellation ran the generator's finally: the queue is gone.
        assert not proxy._event_queues
        await agen.aclose()
        # Listeners stay armed (registered once) even with no consumer.
        fake.fire_simple("ota")
        await asyncio.sleep(0.01)
        assert proxy.events_dropped == 0

    asyncio.run(main())


# ---------------------------------------------------------------------------
# connect-time initial sync (phase 1 F6)
# ---------------------------------------------------------------------------


def _land(fake, key, data=None) -> None:
    """Emulate the hub reply landing for a catalog burst."""

    if key == "devices":
        fake._ready["devices"] = data if data is not None else {}
    elif key == "activities":
        fake._ready["activities"] = data if data is not None else {}
    fake.fire_burst(key)


def test_initial_sync_runs_on_connect_in_order_and_marks_ready() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)
        proxy = aio.AsyncXProxy.wrap(fake, initial_sync=True)
        assert not (await proxy.status()).catalog_ready

        fake.set_connected(hub=True)          # hub connects: sync starts
        await asyncio.sleep(0.02)
        assert fake.banner_fetches == 1
        assert fake.fetch_calls == [("devices", None)]   # devices requested first

        _land(fake, "devices", {5: {"name": "TV"}})
        await asyncio.sleep(0.02)
        assert fake.fetch_calls == [("devices", None), ("activities", None)]
        assert not proxy._catalog_ready

        _land(fake, "activities", {1: {"name": "Watch TV"}})
        assert await proxy.wait_until_ready(timeout=1.0)
        st = await proxy.status()
        assert st.catalog_ready and st.activities_cached == 1 and st.devices_cached == 1
        # The catalog is served from cache now: no new fetch.
        assert [a.name for a in await proxy.activities()] == ["Watch TV"]
        assert fake.fetch_calls == [("devices", None), ("activities", None)]

    asyncio.run(main())


def test_read_during_initial_sync_joins_the_inflight_fetch() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)
        proxy = aio.AsyncXProxy.wrap(fake, initial_sync=True)
        fake.set_connected(hub=True)
        await asyncio.sleep(0.02)
        assert fake.fetch_calls == [("devices", None)]

        # A consumer asks for devices while the sync's fetch is in flight.
        read = asyncio.ensure_future(proxy.devices())
        await asyncio.sleep(0.02)
        assert fake.fetch_calls == [("devices", None)]   # no second request

        _land(fake, "devices", {5: {"name": "TV"}})
        devs = await asyncio.wait_for(read, 1.0)
        assert [d.name for d in devs] == ["TV"]

    asyncio.run(main())


def test_initial_sync_disconnect_mid_fetch_stays_not_ready_and_reruns() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)
        proxy = aio.AsyncXProxy.wrap(fake, initial_sync=True)
        events = proxy.events()
        first = asyncio.ensure_future(events.__anext__())

        fake.set_connected(hub=True)
        await asyncio.sleep(0.02)
        fake.set_connected(hub=False)          # drop while devices is pending
        await asyncio.sleep(0.02)
        assert not proxy._catalog_ready
        assert not await proxy.wait_until_ready(timeout=0.05)

        # Reconnect: the sync runs again from the banner.
        fake.set_connected(hub=True)
        await asyncio.sleep(0.02)
        assert fake.banner_fetches == 2
        _land(fake, "devices")
        await asyncio.sleep(0.02)
        _land(fake, "activities")
        assert await proxy.wait_until_ready(timeout=1.0)

        # The stream carried the ready flip.
        seen = [await first]
        agen = events
        for _ in range(12):
            try:
                seen.append(await asyncio.wait_for(agen.__anext__(), 0.05))
            except TimeoutError:
                break
        await agen.aclose()
        ready_events = [e.payload for e in seen if e.kind == "catalog_ready"]
        assert ready_events == [models.CatalogReady(ready=True)]

    asyncio.run(main())


def test_initial_sync_waits_for_control_mode() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)
        proxy = aio.AsyncXProxy.wrap(fake, initial_sync=True)
        fake.set_connected(hub=True, client=True)   # observe: app holds the hub
        await asyncio.sleep(0.02)
        assert fake.banner_fetches == 0 and fake.fetch_calls == []

        fake.set_connected(hub=True)                # app left: control mode
        await asyncio.sleep(0.02)
        assert fake.banner_fetches == 1 and fake.fetch_calls == [("devices", None)]

    asyncio.run(main())


def test_ready_waiter_is_false_when_initial_sync_is_off() -> None:
    async def main():
        proxy = _wrap(FakeProxy())          # wrap() defaults initial_sync=False
        assert not await proxy.wait_until_ready(timeout=0.01)
        assert not (await proxy.status()).catalog_ready

    asyncio.run(main())


# ---------------------------------------------------------------------------
# stop(release_hub=True) (phase 1 addendum F9)
# ---------------------------------------------------------------------------


def test_stop_release_hub_bounces_shared_listener_after_stop(monkeypatch) -> None:
    calls: list[str] = []

    class Engine(FakeProxy):
        def stop(self) -> None:
            calls.append("stop")

    monkeypatch.setattr(aio, "release_hub_from_listener", lambda ip: calls.append(f"release {ip}"))

    async def main():
        proxy = _wrap(Engine())
        await proxy.stop()
        assert calls == ["stop"]                      # plain stop: no release
        calls.clear()
        await proxy.stop(release_hub=True)
        assert calls == ["stop", "release 1.2.3.4"]   # release: AFTER the stop, for this hub's IP

    asyncio.run(main())


# ---------------------------------------------------------------------------
# refresh reads (review 2026-09-09: fetch-then-prune, never clear)
# ---------------------------------------------------------------------------


def test_devices_refresh_forces_a_fetch_and_awaits_it() -> None:
    async def main():
        fake = FakeProxy()
        fake._ready["devices"] = {5: {"name": "TV"}}
        proxy = _wrap(fake)
        assert [d.name for d in await proxy.devices()] == ["TV"]
        assert fake.fetch_calls == []                       # cached read

        read = asyncio.ensure_future(proxy.devices(refresh=True))
        await asyncio.sleep(0.02)
        assert fake.fetch_calls == [("devices", None)]      # a forced re-read
        assert fake._ready["devices"] == {5: {"name": "TV"}}   # nothing cleared meanwhile
        _land(fake, "devices", {5: {"name": "TV"}, 6: {"name": "Amp"}})
        devs = await asyncio.wait_for(read, 1.0)
        assert [d.name for d in devs] == ["TV", "Amp"]

        # activities(refresh=True) takes the same path.
        fake.make_activities_ready({1: {"name": "Watch TV"}})
        read = asyncio.ensure_future(proxy.activities(refresh=True))
        await asyncio.sleep(0.02)
        assert fake.fetch_calls[-1] == ("activities", None)
        _land(fake, "activities", {1: {"name": "Watch TV"}})
        assert [a.name for a in await asyncio.wait_for(read, 1.0)] == ["Watch TV"]

    asyncio.run(main())


def test_refused_refresh_raises_and_keeps_the_cached_catalog() -> None:
    async def main():
        fake = FakeProxy()
        fake._ready["devices"] = {5: {"name": "TV"}}
        proxy = _wrap(fake)
        fake.set_connected(hub=True, client=True)           # an app holds the hub
        try:
            await proxy.devices(refresh=True)
        except errors.HubBusyError:
            pass
        else:
            raise AssertionError("expected HubBusyError")
        assert fake.fetch_calls == []                       # never asked
        # The plain read still serves the last catalog.
        assert [d.name for d in await proxy.devices()] == ["TV"]

        fake.set_connected(hub=False)
        try:
            await proxy.activities(refresh=True)
        except errors.HubNotConnectedError:
            pass
        else:
            raise AssertionError("expected HubNotConnectedError")

    asyncio.run(main())


# ---------------------------------------------------------------------------
# snapshot / refresh / state document (phase 3 plan, W0)
# ---------------------------------------------------------------------------


def _catalog_fake(*, fetched_devices=(), fetched_activities=()) -> FakeProxy:
    """Two devices, one activity in the catalog; optionally some fetched."""

    fake = FakeProxy()
    fake._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
    fake._ready["activities"] = {101: {"name": "Watch TV"}}
    fake.pending_detail["device"] = {5: [{"button_id": 1}], 7: []}
    fake.pending_detail["activity"] = {101: [{"button_id": 2}]}
    for dev in fetched_devices:
        fake._backup("device", dev, True)
    for act in fetched_activities:
        fake._backup("activity", act, True)
    fake.backup_calls.clear()
    return fake


def test_snapshot_projects_without_fetch_and_reports_incomplete() -> None:
    async def main():
        fake = _catalog_fake(fetched_devices=(5,))
        proxy = _wrap(fake)
        snap = await proxy.snapshot()
        assert fake.fetch_calls == [] and fake.backup_calls == []
        assert isinstance(snap, models.HubSnapshot)
        assert [e.entity_id for e in snap.devices] == [5, 7]
        assert [e.entity_id for e in snap.activities] == [101]
        tv, amp = snap.devices
        assert tv.complete and tv.editable and tv.fetched_at
        assert not amp.complete and not amp.editable and amp.fetched_at is None
        assert snap.complete is False
        assert snap.entity("device", 7) is amp and snap.entity("activity", 1) is None
        doc = snap.to_dict()
        assert doc["snapshot_id"] == snap.snapshot_id and len(snap.snapshot_id) == 64
        assert doc["devices"][0]["editable"] is True and doc["complete"] is False
        assert snap.bundle["payload_profile"] == "structural"
        # Observe mode projects the same: no HubBusyError for a cache read.
        fake.set_connected(hub=True, client=True)
        assert (await proxy.snapshot()).snapshot_id == snap.snapshot_id

    asyncio.run(main())


def test_snapshot_id_is_content_only() -> None:
    async def main():
        fake = _catalog_fake(fetched_devices=(5, 7), fetched_activities=(101,))
        proxy = _wrap(fake)
        base = (await proxy.snapshot()).snapshot_id
        # Provenance never moves the id: a new fetch stamp.
        fake.state.detail_fetched_at["device"][5] = "later"
        again = await proxy.snapshot()
        assert again.snapshot_id == base and again.entity("device", 5).fetched_at == "later"
        # Content does: a binding appears on a device.
        fake.detail["device"][7] = [{"button_id": 9}]
        assert (await proxy.snapshot()).snapshot_id != base

    asyncio.run(main())


def test_refresh_whole_reads_catalogs_once_then_every_entity() -> None:
    async def main():
        fake = _catalog_fake()
        proxy = _wrap(fake)
        progress: list = []

        async def run():
            return await proxy.refresh(progress=progress.append)

        task = asyncio.ensure_future(run())
        await asyncio.sleep(0.02)
        assert fake.fetch_calls == [("devices", None)]
        _land(fake, "devices", {5: {"name": "TV"}, 7: {"name": "Amp"}})
        await asyncio.sleep(0.02)
        _land(fake, "activities", {101: {"name": "Watch TV"}})
        snap = await asyncio.wait_for(task, 2)

        # One catalog read each, then every entity WITHOUT its own catalog read.
        assert fake.fetch_calls == [("devices", None), ("activities", None)]
        assert fake.backup_calls == [
            ("device", 5, False), ("device", 7, False), ("activity", 101, False),
        ]
        assert snap.complete and all(e.editable for e in snap.devices + snap.activities)
        assert [p.phase for p in progress] == ["preparing", "device", "device", "activity", "finalizing"]
        assert all(isinstance(p, models.WriteProgress) for p in progress)
        assert (progress[1].entity_kind, progress[1].entity_id, progress[1].total_steps) == ("device", 5, 3)
        assert progress[-1].completed_steps == 3

    asyncio.run(main())


def test_refresh_emits_snapshot_changed_with_touched_ids() -> None:
    async def main():
        fake = _catalog_fake(fetched_devices=(5, 7), fetched_activities=(101,))
        proxy = _wrap(fake)
        before = await proxy.snapshot()
        fake.pending_detail["activity"][101] = [{"button_id": 3}]  # hub changed

        async def fire():
            await asyncio.sleep(0.01)
            await proxy.refresh(activity_id=101)

        asyncio.ensure_future(fire())
        (event,) = await _collect(proxy, 1)
        assert event.kind == "snapshot_changed"
        assert event.payload.activity_ids == (101,) and event.payload.device_ids == ()
        assert event.payload.snapshot_id != before.snapshot_id
        assert event.to_dict()["payload"]["engine_generation"] == fake.state.generation
        # Only the asked entity was read, with its own catalog read.
        assert fake.backup_calls == [("activity", 101, True)]

    asyncio.run(main())


def test_refresh_refused_in_observe_mode_without_hub_traffic() -> None:
    async def main():
        fake = _catalog_fake()
        fake.set_connected(hub=True, client=True)
        proxy = _wrap(fake)
        for kwargs in ({}, {"device_id": 5}):
            try:
                await proxy.refresh(**kwargs)
            except errors.HubBusyError:
                pass
            else:
                raise AssertionError("refresh must be refused in observe mode")
        assert fake.backup_calls == [] and fake.fetch_calls == []
        try:
            await proxy.refresh(device_id=5, activity_id=101)
        except ValueError:
            pass
        else:
            raise AssertionError("one entity at a time")

    asyncio.run(main())


def test_refresh_concurrent_whole_calls_join_one_read() -> None:
    async def main():
        fake = _catalog_fake()
        proxy = _wrap(fake)

        async def drive():
            await asyncio.sleep(0.02)
            _land(fake, "devices", {5: {"name": "TV"}, 7: {"name": "Amp"}})
            await asyncio.sleep(0.02)
            _land(fake, "activities", {101: {"name": "Watch TV"}})

        asyncio.ensure_future(drive())
        first, second = await asyncio.wait_for(
            asyncio.gather(proxy.refresh(), proxy.refresh()), 2
        )
        assert first.snapshot_id == second.snapshot_id
        assert fake.fetch_calls == [("devices", None), ("activities", None)]
        assert len(fake.backup_calls) == 3

    asyncio.run(main())


def test_refresh_cancel_stops_between_entities() -> None:
    async def main():
        gate = threading.Event()
        started = threading.Event()

        class Slow(FakeProxy):
            def backup_device(self, device_id, **kwargs):
                started.set()
                gate.wait(5)
                return super().backup_device(device_id, **kwargs)

        fake = Slow()
        fake._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
        fake._ready["activities"] = {}
        proxy = _wrap(fake)

        task = asyncio.ensure_future(proxy.refresh())
        await asyncio.sleep(0.02)
        _land(fake, "devices", {5: {"name": "TV"}, 7: {"name": "Amp"}})
        await asyncio.sleep(0.02)
        _land(fake, "activities", {})
        await asyncio.get_running_loop().run_in_executor(None, started.wait, 2)
        task.cancel()
        gate.set()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await asyncio.sleep(0.05)
        # The entity in flight completed; the next one never started.
        assert [c[1] for c in fake.backup_calls] == [5]
        assert proxy._whole_refresh_task is None
        # The facade is usable again afterwards.
        snap = await proxy.snapshot()
        assert snap.entity("device", 5).complete and not snap.entity("device", 7).complete

    asyncio.run(main())


def test_export_import_state_round_trip_keeps_id_and_stamps() -> None:
    async def main():
        source = _catalog_fake(fetched_devices=(5, 7), fetched_activities=(101,))
        src = _wrap(source)
        origin = await src.snapshot()
        doc = await src.export_state()
        assert doc["kind"] == "sofabaton_state" and doc["schema"] == 1
        assert doc["library"] == _pkg.__version__ and isinstance(doc["state"], dict)

        target = FakeProxy()
        dst = _wrap(target)
        assert (await dst.snapshot()).devices == []

        async def fire():
            await asyncio.sleep(0.01)
            await dst.import_state(doc)

        asyncio.ensure_future(fire())
        (event,) = await _collect(dst, 1)
        assert event.kind == "snapshot_changed" and event.payload.device_ids == ()
        restored = await dst.snapshot()
        assert restored.snapshot_id == origin.snapshot_id
        assert restored.complete and restored.entity("device", 7).fetched_at == origin.entity("device", 7).fetched_at
        assert restored.engine_generation > origin.engine_generation
        assert target.fetch_calls == [] and target.backup_calls == []

        for bad in ({}, {"kind": "sofabaton_state", "schema": 99, "state": {}},
                    {"kind": "sofabaton_state", "schema": 1}):
            try:
                await dst.import_state(bad)
            except errors.StateDocumentError:
                pass
            else:
                raise AssertionError(f"{bad!r} must be rejected")

    asyncio.run(main())


def test_sync_guards_snapshot_id_and_editable_baseline_then_rebases() -> None:
    async def main():
        calls: list = []

        class WithSync(FakeProxy):
            def sync_activity(self, *, baseline, edited, activity_id, progress_callback=None):
                calls.append(activity_id)
                self.detail["activity"][activity_id] = [{"button_id": 42}]  # hub moved
                return {"status": "success", "completed_steps": 1, "total_steps": 1}

            def sync_device(self, *, baseline, edited, device_id, progress_callback=None):
                calls.append(device_id)
                return {"status": "failed", "failed_at": "stale_check", "message": "changed"}

        fake = WithSync()
        fake._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
        fake._ready["activities"] = {101: {"name": "Watch TV"}}
        fake._backup("device", 5, True)
        fake._backup("activity", 101, True)
        proxy = _wrap(fake)
        snap = await proxy.snapshot()

        # Wrong snapshot id: refused before the engine, no hub traffic.
        try:
            await proxy.sync_activity(baseline=snap.bundle, edited=snap.bundle,
                                      activity_id=101, snapshot_id="stale")
        except errors.SnapshotOutdatedError:
            pass
        else:
            raise AssertionError("outdated snapshot must be refused")
        # Device 7 was never fetched: not editable.
        try:
            await proxy.sync_device(baseline=snap.bundle, edited=snap.bundle,
                                    device_id=7, snapshot_id=snap.snapshot_id)
        except errors.SnapshotIncompleteError:
            pass
        else:
            raise AssertionError("incomplete baseline must be refused")
        assert calls == []

        # A pre-write failure (stale preflight) rebases nothing and emits nothing.
        result = await proxy.sync_device(baseline=snap.bundle, edited=snap.bundle,
                                         device_id=5, snapshot_id=snap.snapshot_id)
        assert result.failed_at == "stale_check" and result.wrote_nothing and calls == [5]
        assert result.snapshot_id == snap.snapshot_id
        assert (await proxy.snapshot()).snapshot_id == snap.snapshot_id

        # A real write rebases: the projection moves and an event says so.
        async def fire():
            await asyncio.sleep(0.01)
            await proxy.sync_activity(baseline=snap.bundle, edited=snap.bundle,
                                      activity_id=101, snapshot_id=snap.snapshot_id)

        asyncio.ensure_future(fire())
        (event,) = await _collect(proxy, 1)
        assert event.kind == "snapshot_changed" and event.payload.activity_ids == (101,)
        assert event.payload.snapshot_id != snap.snapshot_id
        assert (await proxy.snapshot()).snapshot_id == event.payload.snapshot_id

    asyncio.run(main())


def test_app_session_end_is_an_app_state_event_and_leaves_the_cache_alone() -> None:
    # The hub can be edited outside this library at any time and never
    # says so; an app session through the proxy is merely one visible
    # occasion. It is reported as app_state, not as a snapshot change or a
    # freshness verdict (stale_risk was removed 2026-09-10).
    async def main():
        fake = _catalog_fake(fetched_devices=(5, 7), fetched_activities=(101,))
        proxy = _wrap(fake)
        before = await proxy.snapshot()

        async def session():
            await asyncio.sleep(0.01)
            fake.set_connected(hub=True, client=True)   # app attaches
            await asyncio.sleep(0.01)
            fake.set_connected(hub=True, client=False)  # app leaves

        asyncio.ensure_future(session())
        agen = proxy.events()
        seen = []
        try:
            while not any(e.kind == "app_state" and e.payload.connected is False for e in seen):
                seen.append(await asyncio.wait_for(agen.__anext__(), 2))
            await asyncio.sleep(0.05)                    # anything queued behind it
            while True:
                try:
                    seen.append(await asyncio.wait_for(agen.__anext__(), 0.05))
                except asyncio.TimeoutError:
                    break
        finally:
            await agen.aclose()
        assert [e.payload.connected for e in seen if e.kind == "app_state"] == [True, False]
        assert not any(e.kind == "snapshot_changed" for e in seen)
        after = await proxy.snapshot()
        assert after.snapshot_id == before.snapshot_id and after.engine_generation == before.engine_generation
        assert after.complete and after.entity("device", 5).editable  # detail kept
        assert fake.fetch_calls == [] and fake.backup_calls == []

        # A refresh of one entity re-stamps it and announces.
        async def fire():
            await asyncio.sleep(0.01)
            await proxy.refresh(device_id=5)

        asyncio.ensure_future(fire())
        (event,) = await _collect(proxy, 1)
        assert event.kind == "snapshot_changed" and event.payload.device_ids == (5,)
        latest = await proxy.snapshot()
        assert [c[1] for c in fake.backup_calls] == [5]    # only device 5 was re-read
        assert latest.entity("device", 7).fetched_at == before.entity("device", 7).fetched_at

    asyncio.run(main())


def test_app_session_end_skips_projection_when_nobody_listens() -> None:
    async def main():
        calls = []

        class Counting(FakeProxy):
            def assemble_hub_bundle_from_state(self, **kwargs):
                calls.append(1)
                return super().assemble_hub_bundle_from_state(**kwargs)

        fake = Counting()
        proxy = _wrap(fake)
        fake.set_connected(hub=True, client=True)
        fake.set_connected(hub=True, client=False)
        await asyncio.sleep(0.05)
        assert calls == []  # no snapshot taken, no consumer: nothing projected
        assert proxy._last_snapshot_id is None

    asyncio.run(main())


# ---------------------------------------------------------------------------
# intents and payloads (phase 3 plan, W3)
# ---------------------------------------------------------------------------


def _write_fake() -> FakeProxy:
    fake = _catalog_fake(fetched_devices=(5, 7), fetched_activities=(101,))
    fake._devices_catalog_ready = True
    fake._activities_catalog_ready = True
    return fake


def test_intents_are_refused_in_observe_mode_without_engine_calls() -> None:
    async def main():
        fake = _write_fake()
        fake.set_connected(hub=True, client=True)
        proxy = _wrap(fake)
        attempts = [
            proxy.sync_activity(baseline={}, edited={}, activity_id=101),
            proxy.sync_device(baseline={}, edited={}, device_id=5),
            proxy.add_device("Lamp", "ir"), proxy.add_activity("Read"),
            proxy.remove_device(5), proxy.remove_activity(101), proxy.reorder_devices([7, 5]),
            proxy.reorder_activities([101]), proxy.set_hub_name("Den"), proxy.erase(),
            proxy.backup(), proxy.restore({"kind": "hub_bundle"}),
            proxy.read_payload(5, 1), proxy.play(bytes(16)), proxy.learn_ir(),
        ]
        for coro in attempts:
            try:
                await coro
            except errors.HubBusyError:
                pass
            else:
                raise AssertionError("must be refused in observe mode")
        assert fake.write_calls == []

    asyncio.run(main())


def test_intents_raise_typed_rejection_and_validate_inputs() -> None:
    async def main():
        fake = _write_fake()
        fake.reject = True
        proxy = _wrap(fake)
        for coro in (proxy.add_device("Lamp", "ir"), proxy.remove_device(5),
                     proxy.set_hub_name("Den"), proxy.erase(), proxy.play(bytes(16))):
            try:
                await coro
            except errors.HubRejectedError:
                pass
            else:
                raise AssertionError("engine refusal must raise HubRejectedError")
        # Input validation happens before the engine is touched.
        fake.write_calls.clear()
        for coro in (proxy.add_device("   ", "ir"), proxy.add_device("Lamp", "tv"), proxy.add_activity(""), proxy.set_hub_name(""),
                     proxy.reorder_devices([5, 5, 7]), proxy.reorder_devices([5]),
                     proxy.reorder_activities([101, 7]), proxy.restore({"kind": "nope"})):
            try:
                await coro
            except ValueError:
                pass
            else:
                raise AssertionError("bad input must raise ValueError")
        assert fake.write_calls == []

    asyncio.run(main())


def test_add_and_remove_device_rebase_and_announce() -> None:
    async def main():
        fake = _write_fake()
        proxy = _wrap(fake)
        before = await proxy.snapshot()

        async def fire():
            await asyncio.sleep(0.01)
            new_id = await proxy.add_device("Lamp", "ir")
            assert new_id == 8
            removed = await proxy.remove_device(5)
            assert removed == models.DeviceRemoved(device_id=5, confirmed_activity_ids=(101,), impacted_activity_ids=(101,))
            await proxy.remove_activity(101)

        asyncio.ensure_future(fire())
        added, removed_ev, act_removed = await _collect(proxy, 3)
        assert added.kind == "snapshot_changed" and added.payload.device_ids == (8,)
        assert removed_ev.payload.device_ids == (5,) and removed_ev.payload.activity_ids == (101,)
        assert act_removed.payload.activity_ids == (101,) and act_removed.payload.device_ids == ()
        assert fake.write_calls == [("create_device", "Lamp", "ir"), ("delete_device", 5), ("delete_device", 101)]
        try:
            await proxy.remove_activity(5)
        except ValueError:
            pass
        else:
            raise AssertionError("a device id is not an activity")
        after = await proxy.snapshot()
        assert after.snapshot_id != before.snapshot_id
        assert [e.entity_id for e in after.devices] == [7, 8]
        assert not after.entity("device", 8).editable          # new: never fetched
        assert after.entity("activity", 101) is None           # removed

    asyncio.run(main())


def test_reorder_rename_erase_go_through_the_engine_and_announce() -> None:
    async def main():
        fake = _write_fake()
        proxy = _wrap(fake)
        events = []

        async def consume():
            async for event in proxy.events():
                if event.kind == "snapshot_changed":
                    events.append(event)
                    if len(events) == 4:
                        return

        task = asyncio.ensure_future(consume())
        await asyncio.sleep(0.01)
        await proxy.reorder_devices([7, 5])
        await proxy.reorder_activities([101])
        await proxy.set_hub_name("Den")
        await proxy.erase()
        await asyncio.wait_for(task, 2)
        assert fake.write_calls == [("reorder_devices", [7, 5]), ("reorder_activities", [101]),
                                    ("set_hub_name", "Den"), ("erase",)]
        assert events[0].payload.device_ids == (7, 5) and events[1].payload.activity_ids == (101,)
        assert (await proxy.snapshot()).devices == []

    asyncio.run(main())


def test_backup_and_restore_typed_results_and_replace() -> None:
    async def main():
        fake = _write_fake()
        proxy = _wrap(fake)
        progress: list = []
        bundle = await proxy.backup(progress=progress.append)
        assert bundle["payload_profile"] == "full_backup"
        assert progress and isinstance(progress[0], models.WriteProgress)
        assert (progress[0].entity_kind, progress[0].entity_id) == ("device", 5)

        result = await proxy.restore({"kind": "hub_bundle", "tag": "a"}, replace=True, progress=progress.append)
        assert isinstance(result, models.RestoreResult) and result.ok
        assert result.device_id_map == {3: 9} and result.restored_devices == 1
        assert result.snapshot_id == (await proxy.snapshot()).snapshot_id
        # replace=True: preflight, THEN erase, then restore.
        kinds = [c[0] for c in fake.write_calls]
        assert kinds == ["backup", "preflight", "erase", "restore"]
        assert result.restored["devices"][0]["device_id"] == 9
        # A bundle the restore would refuse never reaches the erase.
        fake.write_calls.clear()
        try:
            await proxy.restore({"kind": "hub_bundle", "tag": "bad", "schema_version": 999}, replace=True)
        except ValueError:
            pass
        else:
            raise AssertionError("an invalid bundle must be refused")
        assert [c[0] for c in fake.write_calls] == ["preflight"]

        fake.reject = True
        failed = await proxy.restore({"kind": "hub_bundle", "tag": "b"})
        assert not failed.ok and failed.failed_at == ("device", 3) and failed.wrote_nothing
        assert failed.to_dict()["failed_at"] == ["device", 3]
        assert models.RestoreResult.from_engine({"status": "failed", "failed_at": ["proxy", None]}, snapshot_id=None).failed_at == ("proxy", None)

    asyncio.run(main())


def test_payload_read_play_and_learn() -> None:
    async def main():
        fake = _write_fake()
        raw = _pkg.IrPayload.from_raw_timings([9000, 4500, 560, 560], 38000)
        fake.payloads[(5, 2)] = raw.blob
        proxy = _wrap(fake)

        got = await proxy.read_payload(5, 2)
        assert got == raw and got.kind == "raw" and got.carrier_hz == 38000
        assert await proxy.read_payload(5, 3) is None
        assert fake.write_calls[:2] == [("dump", 5, 2), ("dump", 5, 3)]
        # The payload is typed by the device's class: a short body on an IR-class device is a record ...
        fake.payloads[(5, 4)] = bytes([0x05, 0x04])
        short = await proxy.read_payload(5, 4)
        assert isinstance(short, _pkg.CommandRecord) and short.blob == bytes([0x05, 0x04])
        # ... a wifi_mqtt record decodes its fields, a Bluetooth key stays bytes ...
        fake.classes = {6: "wifi_mqtt"}
        fake.payloads[(6, 1)] = bytes([0x06, 0x01])
        mqtt = await proxy.read_payload(6, 1)
        assert isinstance(mqtt, _pkg.CommandRecord) and mqtt.device_class == "wifi_mqtt"
        assert mqtt.fields == {"device_id": 6, "command_id": 1}
        fake.classes[7] = "bluetooth"
        fake.payloads[(7, 1)] = bytes([0x07, 0x00, 0x27])
        bt = await proxy.read_payload(7, 1)
        assert isinstance(bt, _pkg.CommandRecord) and bt.fields is None and bt.hex == "07 00 27"
        # ... and a network record is a NetworkCommand that keeps its trailer, so blob is the stored body.
        fake.classes[8] = "wifi_roku"
        stored = _pkg.NetworkCommand("wifi_roku", {"path": "keypress/Home"}, "f1").blob
        fake.payloads[(8, 1)] = stored
        roku = await proxy.read_payload(8, 1)
        assert isinstance(roku, _pkg.NetworkCommand) and roku.fields == {"path": "keypress/Home"}
        assert roku.trailer_hex == "f1" and roku.blob == stored
        # A network body that does not decode stays a record rather than being misread.
        fake.payloads[(8, 2)] = bytes([0xFF] * 12)
        assert isinstance(await proxy.read_payload(8, 2), _pkg.CommandRecord)

        await proxy.play(got)
        await proxy.play(got.blob)
        assert fake.write_calls[-2:] == [("play", raw.blob), ("play", raw.blob)]

        learned = await proxy.learn_ir(timeout=12)
        assert isinstance(learned, _pkg.IrPayload) and learned.kind == "descriptive"
        assert fake.write_calls[-1] == ("learn", 12)

        fake.learn_result = {"state": "timed_out", "timeout_s": 12}
        try:
            await proxy.learn_ir()
        except errors.IrLearnError as err:
            assert err.state == "timed_out"
        else:
            raise AssertionError("a timed-out learn must raise")
        fake.learn_result = {"state": "learned", "payload_hex": None}
        try:
            await proxy.learn_ir()
        except errors.IrLearnError as err:
            assert err.state == "undecodable"
        assert await proxy.cancel_learn() is True

    asyncio.run(main())


def test_ir_payload_constructors_and_command_row() -> None:
    pronto = _pkg.IrPayload.from_pronto("0000 006D 0002 0000 0158 00AB 0016 0016")
    assert pronto.kind == "raw" and pronto.descriptor is None
    assert 38000 <= pronto.carrier_hz <= 38100   # 0x006D pronto frequency word
    raw = _pkg.IrPayload.from_raw_timings([9000, 4500, 560, 560], 38000)
    assert raw.kind == "raw" and raw.carrier_hz == 38000
    assert _pkg.IrPayload.from_hex(raw.hex) == raw == _pkg.IrPayload.from_bytes(raw.blob)
    assert _pkg.IrPayload.from_hex("0x" + raw.blob.hex()) == raw

    desc = _pkg.IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21")
    assert desc.kind == "descriptive" and desc.descriptor == "P:NEC1 D:4 S:5 F:21"
    assert desc.carrier_hz is None
    row = desc.to_command_row(9, " Power ")
    assert row["command_id"] == 9 and row["name"] == "Power"
    assert row["restore_data"]["new"] is True and row["restore_data"]["library_type"] == 0x0D
    assert row["restore_data"]["decoded"] == {"class": "ir", "fields": {"descriptor": "P:NEC1 D:4 S:5 F:21"}}
    assert bytes.fromhex(row["restore_data"]["data_hex"]) == desc.blob
    assert "decoded" not in raw.to_command_row(3, "")["restore_data"]
    assert raw.to_command_row(3, "")["name"] == "Command 3"
    assert desc.to_dict()["kind"] == "descriptive"

    for bad in (b"", bytes(9)):
        try:
            _pkg.IrPayload.from_bytes(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("short payloads are refused")
    try:
        _pkg.IrPayload.from_hex("zz")
    except ValueError:
        pass
    else:
        raise AssertionError("bad hex is refused")


def test_sync_progress_is_typed_write_progress_with_entity() -> None:
    async def main():
        class WithSync(FakeProxy):
            def sync_device(self, *, baseline, edited, device_id, progress_callback=None):
                progress_callback(phase="stale_check", message="Checking…", completed_steps=0,
                                  total_steps=2, current_device_id=device_id)
                progress_callback(phase="writing", message="Renaming", step_kind="device_rename",
                                  completed_steps=1, total_steps=2, current_device_id=device_id)
                return {"status": "failed", "failed_at": "device_rename (device 5)",
                        "message": "The hub rejected", "completed_steps": 1, "total_steps": 2}

        fake = WithSync()
        proxy = _wrap(fake)
        seen: list = []
        result = await proxy.sync_device(baseline={}, edited={}, device_id=5, progress=seen.append)
        await asyncio.sleep(0.02)
        assert [p.phase for p in seen] == ["stale_check", "writing"]
        assert seen[1].step_kind == "device_rename" and seen[1].entity_id == 5
        assert not result.ok and not result.wrote_nothing and result.completed_steps == 1

    asyncio.run(main())


def test_refresh_cancel_drains_the_in_flight_read_before_releasing_the_hub() -> None:
    # Review of 635ecfe, finding 4: a cancelled refresh used to release the
    # lock (and the job) while the engine thread was still reading.
    async def main():
        started, release, completed = threading.Event(), threading.Event(), threading.Event()

        class Slow(FakeProxy):
            def backup_device(self, device_id, **kwargs):
                if device_id == 5:
                    started.set()
                    assert release.wait(10)
                    completed.set()
                return super().backup_device(device_id, **kwargs)

        fake = Slow()
        fake._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
        fake._ready["activities"] = {}
        proxy = _wrap(fake)

        async def catalog(**kwargs):
            return []

        proxy.devices = proxy.activities = catalog     # skip the catalog bursts
        task = asyncio.ensure_future(proxy.refresh())
        assert await asyncio.get_running_loop().run_in_executor(None, started.wait, 2)
        task.cancel()
        await asyncio.sleep(0.05)
        # Still draining: the lock is held, the task is not done, nothing else runs.
        assert proxy._refresh_lock.locked() and not task.done() and not completed.is_set()
        second = asyncio.ensure_future(proxy.refresh(device_id=7))
        await asyncio.sleep(0.05)
        assert not second.done()
        release.set()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert completed.is_set()                      # the read landed before the task ended
        # The loop stopped between entities: device 7 was read by the SECOND
        # refresh only, which took the lock the moment the first released it.
        await asyncio.wait_for(second, 2)
        assert not proxy._refresh_lock.locked()
        assert [c[1] for c in fake.backup_calls] == [5, 7]

    asyncio.run(main())


def test_refresh_second_cancel_keeps_draining_the_in_flight_read() -> None:
    # Review of ce9f205, P2: a second cancellation during the drain used to
    # reach the read task, abandon the engine thread and release the lock.
    async def main():
        started, release, completed = threading.Event(), threading.Event(), threading.Event()

        class Slow(FakeProxy):
            def backup_device(self, device_id, **kwargs):
                if device_id == 5:
                    started.set()
                    assert release.wait(10)
                    completed.set()
                return super().backup_device(device_id, **kwargs)

        fake = Slow()
        fake._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
        fake._ready["activities"] = {}
        proxy = _wrap(fake)

        async def catalog(**kwargs):
            return []

        proxy.devices = proxy.activities = catalog
        task = asyncio.ensure_future(proxy.refresh())
        assert await asyncio.get_running_loop().run_in_executor(None, started.wait, 2)
        for _ in range(3):                             # an impatient client
            task.cancel()
            await asyncio.sleep(0.05)
            assert proxy._refresh_lock.locked() and not task.done() and not completed.is_set()
        release.set()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert completed.is_set()                      # the read landed before the task ended
        assert not proxy._refresh_lock.locked()
        assert [c[1] for c in fake.backup_calls] == [5]   # stopped between entities

    asyncio.run(main())


# ---------------------------------------------------------------------------
# phase 4 H2: batch_writes on the facade
# ---------------------------------------------------------------------------


class _BatchFake(FakeProxy):
    """The engine's batch surface plus recording syncs."""

    def __init__(self) -> None:
        super().__init__()
        self.batch_calls: list = []
        self.sync_kwargs: list = []
        self._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
        self._ready["activities"] = {101: {"name": "Watch TV"}}
        self._backup("device", 5, True)
        self._backup("activity", 101, True)

    def begin_write_batch(self):
        self.batch_calls.append("begin")

    def end_write_batch(self, *, send_remote_sync=True):
        self.batch_calls.append(("end", send_remote_sync))
        return {"remote_sync": "sent", "remote_sync_requests": 2, "origins": ["a", "b"]}

    def sync_activity(self, *, baseline, edited, activity_id, progress_callback=None, **kw):
        self.sync_kwargs.append(("activity", kw))
        self.detail["activity"][activity_id] = [{"button_id": 42}]
        return {"status": "success", "completed_steps": 1, "total_steps": 1}

    def sync_device(self, *, baseline, edited, device_id, progress_callback=None, **kw):
        self.sync_kwargs.append(("device", kw))
        self.detail["device"][device_id] = [{"command_id": 9}]
        return {"status": "success", "completed_steps": 1, "total_steps": 1}


def test_batch_writes_folds_rebases_into_one_event_and_closes_the_engine_batch() -> None:
    async def main():
        fake = _BatchFake()
        proxy = _wrap(fake)
        snap = await proxy.snapshot()
        seen_inside: dict = {}

        async def run_batch():
            await asyncio.sleep(0.01)
            async with proxy.batch_writes() as batch:
                r1 = await proxy.sync_activity(baseline=snap.bundle, edited=snap.bundle,
                                               activity_id=101, strict=True)
                r2 = await proxy.sync_device(baseline=snap.bundle, edited=snap.bundle, device_id=5)
                # Rebases happened (the projection moved) but no event went out yet.
                seen_inside["ids"] = (r1.snapshot_id, r2.snapshot_id)
                seen_inside["current"] = (await proxy.snapshot()).snapshot_id
                seen_inside["outcome"] = batch.outcome
            return batch

        task = asyncio.ensure_future(run_batch())
        events = await _collect(proxy, 1)
        batch = await task

        assert [e.kind for e in events] == ["snapshot_changed"]
        event = events[0].payload
        assert event.activity_ids == (101,) and event.device_ids == (5,)
        assert seen_inside["outcome"] is None
        assert seen_inside["ids"][0] != snap.snapshot_id
        assert seen_inside["current"] == seen_inside["ids"][1] == event.snapshot_id
        out = batch.outcome
        assert out.remote_sync == "sent" and out.remote_sync_requests == 2
        assert out.rebases == 2 and out.snapshot_id == event.snapshot_id
        assert out.device_ids == (5,) and out.activity_ids == (101,)
        assert fake.batch_calls == ["begin", ("end", True)]
        # strict=True reaches the engine as strict_preflight; the default sends nothing extra.
        assert fake.sync_kwargs == [("activity", {"strict_preflight": True}), ("device", {})]
        assert proxy._batch is None

    asyncio.run(main())


def test_batch_writes_closes_on_error_and_cancel_and_refuses_nesting() -> None:
    async def main():
        fake = _BatchFake()
        proxy = _wrap(fake)
        snap = await proxy.snapshot()

        # An exception inside the block still closes the engine batch and fills the outcome.
        holder: dict = {}
        try:
            async with proxy.batch_writes(send_remote_sync=False) as batch:
                holder["batch"] = batch
                async with proxy.batch_writes():
                    pass
        except RuntimeError as err:
            assert "already open" in str(err)
        else:
            raise AssertionError("nesting must raise")
        assert fake.batch_calls == ["begin", ("end", False)]
        assert holder["batch"].outcome is not None and holder["batch"].outcome.rebases == 0
        assert proxy._batch is None

        # An empty batch emits no event: the projection did not move.
        assert (await proxy.snapshot()).snapshot_id == snap.snapshot_id

        # A cancelled task drains the finalisation before the cancel propagates.
        fake.batch_calls.clear()
        started = asyncio.Event()

        async def cancelled_batch():
            async with proxy.batch_writes() as batch:
                holder["cancelled"] = batch
                await proxy.sync_activity(baseline=snap.bundle, edited=snap.bundle, activity_id=101)
                started.set()
                await asyncio.sleep(30)

        task = asyncio.ensure_future(cancelled_batch())
        await started.wait()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        else:
            raise AssertionError("the cancel must propagate after the batch closed")
        assert fake.batch_calls == ["begin", ("end", True)]
        assert holder["cancelled"].outcome is not None
        assert holder["cancelled"].outcome.activity_ids == (101,)
        assert proxy._batch is None

    asyncio.run(main())


# ---------------------------------------------------------------------------
# phase 4 H3: sync_hub, the whole-document runner
# ---------------------------------------------------------------------------

import copy  # noqa: E402

hub_apply = importlib.import_module(f"{_pkg.__name__}.hub_apply")
hub_sync_mod = importlib.import_module(f"{_pkg.__name__}.hub_sync")
activity_sync_mod = importlib.import_module(f"{_pkg.__name__}.activity_sync")


class _ApplyFake(FakeProxy):
    """A fake whose syncs run the REAL per-entity planners on the pair the
    runner hands them (so the working-document splice is exercised) and
    then report a configurable outcome."""

    def __init__(self) -> None:
        super().__init__()
        self.batch_calls: list = []
        self.syncs: list = []          # (kind, entity_id, step kinds, strict)
        self.fail_next_sync: dict = {}  # kind -> engine result dict
        self.block_sync = None          # threading.Event: a sync waits on it
        self.in_sync = threading.Event()
        self._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}}
        self._ready["activities"] = {101: {"name": "Watch TV"}}
        for ent in (5, 7):
            self._backup("device", ent, True)
        self._backup("activity", 101, True)

    def begin_write_batch(self):
        self.batch_calls.append("begin")

    def end_write_batch(self, *, send_remote_sync=True):
        self.batch_calls.append(("end", send_remote_sync))
        asked = sum(1 for c in self.write_calls if c[0] in ("create_device", "create_activity",
                                                             "reorder_devices", "reorder_activities"))
        return {"remote_sync": "sent" if asked and send_remote_sync else "not_needed",
                "remote_sync_requests": asked, "origins": []}

    def _sync(self, kind, baseline, edited, entity_id, kw):
        build = (activity_sync_mod.build_device_sync_plan if kind == "device"
                 else activity_sync_mod.build_activity_sync_plan)
        plan = build(baseline, edited, entity_id)  # raises ValueError when out of scope
        self.syncs.append((kind, entity_id, [s.kind for s in plan], kw.get("strict_preflight", False)))
        if self.block_sync is not None:
            self.in_sync.set()
            self.block_sync.wait(10)
        forced = self.fail_next_sync.pop(kind, None)
        if forced is not None:
            return forced
        # The write "lands": the entity's detail becomes what was asked.
        row = next(r for r in edited["devices" if kind == "device" else "activities"]
                   if r["device"]["device_id"] == entity_id)
        self.detail[kind][entity_id] = list(row.get("button_bindings") or [])
        self.pending_detail[kind][entity_id] = list(row.get("button_bindings") or [])
        self.bump_cache_generation()
        return {"status": "success", "completed_steps": len(plan), "total_steps": len(plan)}

    def sync_activity(self, *, baseline, edited, activity_id, progress_callback=None, **kw):
        return self._sync("activity", baseline, edited, activity_id, kw)

    def sync_device(self, *, baseline, edited, device_id, progress_callback=None, **kw):
        return self._sync("device", baseline, edited, device_id, kw)


def _apply_binding(button, dev, cmd):
    return {"button_id": button, "device_id": dev, "command_id": cmd,
            "long_press_device_id": None, "long_press_command_id": None}


def _apply_docs(proxy_snapshot):
    """A desired document touching every item kind the runner knows."""

    base = copy.deepcopy(proxy_snapshot.bundle)
    desired = copy.deepcopy(base)
    desired["hub"]["name"] = "Loft"
    act = next(a for a in desired["activities"] if a["device"]["device_id"] == 101)
    act["button_bindings"].append(_apply_binding(0xB6, 5, 1))
    desired["devices"].append({"device": {"device_id": -1, "name": "Projector", "device_class": "ir"},
                               "button_bindings": [], "commands": [], "macros": []})
    desired["activities"].append({"device": {"device_id": -2, "name": "Movie", "entity_type": "activity"},
                                  "button_bindings": [_apply_binding(0xB6, -1, 1)],
                                  "favorite_slots": [], "favorites_order": [], "macros": []})
    desired["devices"] = [d for d in desired["devices"] if d["device"]["device_id"] != 7]
    desired["activities"].reverse()  # -2 first: a real reorder
    return base, desired


def test_sync_hub_runs_every_item_kind_in_order_inside_one_batch() -> None:
    async def main():
        fake = _ApplyFake()
        proxy = _wrap(fake)
        base, desired = _apply_docs(await proxy.snapshot())
        fake.backup_calls.clear()  # the fixture's own setup reads
        states: list = []
        reports: list = []

        async def run():
            await asyncio.sleep(0.01)
            return await proxy.sync_hub(baseline=base, desired=desired, progress=reports.append,
                                        on_state=lambda s: states.append(s.status))

        task = asyncio.ensure_future(run())
        events = await _collect(proxy, 1)
        result = await task

        assert result.ok and result.status == "success"
        # Plan order: hub rename, device creates (the empty new device needs
        # no sync), activity creates, activity edits (existing first, then
        # the created one), deletes, orders.
        # A create always brings its kind's order item; the runner writes
        # it only when the live order differs from the desired one.
        assert [i.kind for i in result.items] == [
            "hub_rename", "add_device", "add_activity", "sync_activity", "sync_activity",
            "remove_device", "reorder_devices", "reorder_activities",
        ]
        assert all(i.status == "done" for i in result.items)
        assert result.id_map == {-1: 8, -2: 102}
        # The created activity's sync item carries the physical id after the create.
        assert [i.entity_id for i in result.items] == [None, 8, 102, 101, 102, 7, None, None]
        assert result.remote_sync == "sent" and result.rebased and result.snapshot_id
        # Engine calls in the plan's order. The device order the document
        # asks for ([5, 8] once 7 is gone) is what the fake already lists,
        # so that item is done without a write; the activity order differs
        # and is written with the placeholder mapped.
        assert [c[0] for c in fake.write_calls] == [
            "set_hub_name", "create_device", "create_activity", "delete_device", "reorder_activities",
        ]
        assert fake.write_calls[-1] == ("reorder_activities", [102, 101])
        assert result.items[6].kind == "reorder_devices" and result.items[6].message == "already in this order"
        # The syncs ran the real planners on the spliced working document,
        # strictly, and the created activity's binding pointed at device 8.
        assert [(k, e, strict) for k, e, _steps, strict in fake.syncs] == [
            ("activity", 101, True), ("activity", 102, True),
        ]
        assert "binding_write" in fake.syncs[1][2]
        # Stage B re-read the touched activity before the first write.
        assert fake.backup_calls[:1] == [("activity", 101, True)]
        # One batch, one event, state handed over after every item.
        assert fake.batch_calls == ["begin", ("end", True)]
        assert [e.kind for e in events] == ["snapshot_changed"]
        assert states[0] == "running" and states[-1] == "success" and states.count("running") >= 8
        assert any(r.phase == "live_check" for r in reports)
        assert any(r.item_index is not None and r.item_count == 8 for r in reports)
        assert result.state.runs == 1 and result.writes >= 5
        # Serialisation round-trips.
        again = hub_apply.ApplyState.from_dict(result.state.to_dict())
        assert [i.to_dict() for i in again.items] == [i.to_dict() for i in result.state.items]
        assert again.placeholders == {"-1": 8, "-2": 102}
        assert result.to_dict()["id_map"] == {"-1": 8, "-2": 102}

    asyncio.run(main())


def test_sync_hub_stage_b_stops_before_any_write_when_an_entity_moved() -> None:
    async def main():
        fake = _ApplyFake()
        proxy = _wrap(fake)
        base = copy.deepcopy((await proxy.snapshot()).bundle)
        desired = copy.deepcopy(base)
        next(a for a in desired["activities"] if a["device"]["device_id"] == 101)["device"]["name"] = "Cinema"
        # The hub moved after the document was taken.
        fake.pending_detail["activity"][101] = [_apply_binding(0xB0, 7, 3)]

        result = await proxy.sync_hub(baseline=base, desired=desired)
        assert result.status == "stopped" and result.failed_at == "live_check"
        assert "activity 101" in result.message
        assert fake.write_calls == [] and fake.syncs == []
        assert [i.status for i in result.items] == ["not_attempted"]
        assert result.resumable and result.remote_sync == "not_needed"
        assert fake.batch_calls == ["begin", ("end", True)]

    asyncio.run(main())


def test_sync_hub_stops_at_a_partial_item_and_resumes_from_the_hub_state() -> None:
    async def main():
        fake = _ApplyFake()
        proxy = _wrap(fake)
        base = copy.deepcopy((await proxy.snapshot()).bundle)
        desired = copy.deepcopy(base)
        next(d for d in desired["devices"] if d["device"]["device_id"] == 5)["button_bindings"].append(
            _apply_binding(0xB6, 5, 1))
        next(a for a in desired["activities"] if a["device"]["device_id"] == 101)["button_bindings"].append(
            _apply_binding(0xB0, 7, 3))
        fake.fail_next_sync["device"] = {"status": "failed", "failed_at": "binding_write",
                                         "message": "no ack", "completed_steps": 1, "total_steps": 2}
        saved: list = []

        first = await proxy.sync_hub(baseline=base, desired=desired, on_state=lambda s: saved.append(s.to_dict()))
        assert first.status == "stopped" and first.failed_at == "item" and first.resumable
        assert [(i.kind, i.status) for i in first.items] == [("sync_device", "partial"), ("sync_activity", "not_attempted")]
        assert first.items[0].completed_steps == 1 and first.items[0].total_steps == 2
        assert first.needs_refresh == (hub_sync_mod.EntityRef("device", 5),)
        assert first.writes == 1

        # Resume from the persisted record (what a server would reload).
        state = hub_apply.ApplyState.from_dict(saved[-1])
        assert state.resumable and state.cursor == 0
        fake.backup_calls.clear()
        second = await proxy.sync_hub(state=state)
        assert second.ok and second.state.runs == 2 and second.apply_id == first.apply_id
        assert [i.status for i in second.items] == ["done", "done"]
        assert second.needs_refresh == ()
        # Stage B on resume re-read the partial entity and the untouched one.
        assert [c[:2] for c in fake.backup_calls[:2]] == [("device", 5), ("activity", 101)]
        assert fake.batch_calls == ["begin", ("end", True), "begin", ("end", True)]

        # A finished apply cannot be resumed again.
        try:
            await proxy.sync_hub(state=second.state)
        except ValueError:
            pass
        else:
            raise AssertionError("a finished apply must not resume")

    asyncio.run(main())


def test_sync_hub_cancel_finishes_the_item_in_flight_and_leaves_a_resumable_state() -> None:
    async def main():
        fake = _ApplyFake()
        proxy = _wrap(fake)
        base = copy.deepcopy((await proxy.snapshot()).bundle)
        desired = copy.deepcopy(base)
        next(d for d in desired["devices"] if d["device"]["device_id"] == 5)["button_bindings"].append(
            _apply_binding(0xB6, 5, 1))
        next(a for a in desired["activities"] if a["device"]["device_id"] == 101)["button_bindings"].append(
            _apply_binding(0xB0, 7, 3))
        fake.block_sync = threading.Event()
        saved: list = []

        task = asyncio.ensure_future(proxy.sync_hub(baseline=base, desired=desired,
                                                    on_state=lambda s: saved.append(s)))
        await asyncio.get_running_loop().run_in_executor(None, fake.in_sync.wait, 5)
        task.cancel()
        await asyncio.sleep(0.05)
        assert not task.done(), "the item in flight must be drained first"
        fake.block_sync.set()
        try:
            await task
        except asyncio.CancelledError:
            pass
        else:
            raise AssertionError("the cancel must propagate after the batch closed")

        state = saved[-1]
        assert state.status == "cancelled" and state.resumable
        assert [(i.kind, i.status) for i in state.items] == [("sync_device", "done"), ("sync_activity", "not_attempted")]
        assert fake.batch_calls == ["begin", ("end", True)]
        assert len(fake.syncs) == 1

        fake.block_sync = None
        result = await proxy.sync_hub(state=state)
        assert result.ok and [i.status for i in result.items] == ["done", "done"]
        assert len(fake.syncs) == 2  # the done item was not re-run

    asyncio.run(main())


def test_sync_hub_resume_adopts_a_create_that_landed_without_its_id() -> None:
    async def main():
        fake = _ApplyFake()
        proxy = _wrap(fake)
        base = copy.deepcopy((await proxy.snapshot()).bundle)
        desired = copy.deepcopy(base)
        desired["devices"].append({"device": {"device_id": -1, "name": "Projector", "device_class": "ir"},
                                   "button_bindings": [_apply_binding(0xB6, -1, 1)], "commands": [], "macros": []})
        first = await proxy.sync_hub(baseline=base, desired=desired)
        assert first.ok and first.id_map == {-1: 8}
        assert [c[0] for c in fake.write_calls] == ["create_device"]

        # The record a crashed server would hold: the create was in flight
        # and its id never reached the record.
        doc = first.state.to_dict()
        doc["status"], doc["cursor"] = "stopped", 0
        doc["placeholders"] = {"-1": None}
        for item in doc["items"]:
            item["status"], item["entity_id"] = ("running" if item["kind"] == "add_device" else "not_attempted"), None
        state = hub_apply.ApplyState.from_dict(doc)

        second = await proxy.sync_hub(state=state)
        assert second.ok and second.id_map == {-1: 8}
        assert [c[0] for c in fake.write_calls] == ["create_device"], "no duplicate create"
        # Three items: the create, its sync, and the device order item the
        # create brings, skipped because the live order already matched.
        assert [i.status for i in second.items] == ["done", "done", "done"]
        assert second.items[2].kind == "reorder_devices" and second.items[2].message == "already in this order"

    asyncio.run(main())


def test_sync_hub_refuses_bad_input_before_any_traffic() -> None:
    async def main():
        fake = _ApplyFake()
        proxy = _wrap(fake)
        snap = await proxy.snapshot()
        base = copy.deepcopy(snap.bundle)
        try:
            await proxy.sync_hub()
        except ValueError:
            pass
        else:
            raise AssertionError("documents or a state are required")
        try:
            await proxy.sync_hub(baseline=base, desired=base, snapshot_id="stale")
        except errors.SnapshotOutdatedError:
            pass
        else:
            raise AssertionError("an outdated snapshot id must be refused")
        desired = copy.deepcopy(base)
        desired["devices"] = [d for d in desired["devices"] if d["device"]["device_id"] != 5]
        next(a for a in desired["activities"] if a["device"]["device_id"] == 101)["button_bindings"].append(
            _apply_binding(0xB0, 5, 1))
        try:
            await proxy.sync_hub(baseline=base, desired=desired, snapshot_id=snap.snapshot_id)
        except hub_sync_mod.DanglingReferenceError:
            pass
        else:
            raise AssertionError("stage A must refuse a dangling reference")
        assert fake.write_calls == [] and fake.batch_calls == []
        # An unchanged document is a successful empty run.
        result = await proxy.sync_hub(baseline=base, desired=copy.deepcopy(base), snapshot_id=snap.snapshot_id)
        assert result.ok and result.items == () and result.remote_sync == "not_needed" and result.writes == 0

    asyncio.run(main())



# ---------------------------------------------------------------------------
# phase 4 decision 6: the snapshot lists entities in the hub's display order
# ---------------------------------------------------------------------------


def test_snapshot_arrays_follow_the_hub_sort_byte_not_the_ids() -> None:
    async def main():
        class Sorted(FakeProxy):
            def assemble_hub_bundle_from_state(self, **kwargs):
                bundle = super().assemble_hub_bundle_from_state(**kwargs)
                order = {5: 2, 7: 0, 9: 1}          # display order: 7, 9, 5
                for row in bundle["devices"]:
                    row["device"]["sort"] = order.get(row["device"]["device_id"])
                for row in bundle["activities"]:
                    row["device"]["sort"] = {101: 1, 102: 0}.get(row["device"]["device_id"])
                return bundle

        fake = Sorted()
        fake._ready["devices"] = {5: {"name": "TV"}, 7: {"name": "Amp"}, 9: {"name": "Box"}, 11: {"name": "Unsorted"}}
        fake._ready["activities"] = {101: {"name": "Watch"}, 102: {"name": "Listen"}}
        proxy = _wrap(fake)
        snap = await proxy.snapshot()
        # Sorted by the byte; an entity without one goes last, ids break ties.
        assert [r["device"]["device_id"] for r in snap.bundle["devices"]] == [7, 9, 5, 11]
        assert [r["device"]["device_id"] for r in snap.bundle["activities"]] == [102, 101]
        assert [e.entity_id for e in snap.devices] == [7, 9, 5, 11]

    asyncio.run(main())
