"""A fake AsyncXProxy for manager and route tests.

Models what the server touches: lifecycle, ``status()``, ``hub_info()``,
``events()``, the six reads, control, and the catalog refresh delegate.
``ready(mac)`` emulates the connect-time initial sync completing, which
is when the manager learns the MAC. ``fail_with`` injects one of the
library's typed errors into every read; ``refuse`` makes control calls
return False the way the facade does when the proxy does not own the
hub.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from sofabaton import (
    Activity,
    Button,
    CatalogReady,
    Command,
    Device,
    Favorite,
    HubBusyError,
    HubConfig,
    HubEvent,
    HubInfo,
    HubSnapshot,
    HubStatus,
    Macro,
    RunningActivity,
    SnapshotChanged,
    SnapshotEntity,
    StateDocumentError,
    WriteProgress,
)


CRLF = chr(13) + chr(10)


class FakeProxy:
    def __init__(self, config: HubConfig) -> None:
        self.config = config
        self.started = False
        self.stops: list[bool] = []          # release_hub flag per stop()
        self.advertised = 0                  # wait_until_discoverable calls
        self.mac: Optional[str] = None
        self.model = "X1S"
        self._queue: asyncio.Queue = asyncio.Queue()
        self._seq = 0
        self.catalog_ready = False
        self.fail_with: Optional[BaseException] = None
        self.refuse = False
        self.running: Optional[RunningActivity] = None
        self.sent: list[tuple[str, tuple]] = []
        self.catalog_clears = 0
        self.refreshes = 0
        self.start_error: Optional[BaseException] = None
        # Snapshot surface (phase 3): which entities are "fetched", the
        # imported document, the refreshes asked for.
        self.fetched: set[int] = set()
        self.imported: Optional[dict] = None
        self.refresh_calls: list[dict] = []
        self.refresh_gate: Optional[asyncio.Event] = None   # a refresh waits here per entity when set
        self.drain_gate: Optional[asyncio.Event] = None     # a cancelled refresh drains here when set
        self.fetched_at: dict[int, str] = {}                # per-entity fetch stamps (None when absent)
        self.cancellations = 0                              # CancelledErrors the refresh received
        self.exports = 0
        self.syncs: list[dict] = []
        self.sync_failure: Optional[dict] = None          # an engine result dict a sync returns instead
        self.edited_entities: dict[tuple, dict] = {}
        self.intents: list[tuple] = []
        self.reject_intents = False
        self.hub_name = "X1 HUB"
        self.payloads: dict = {}
        self.played: list = []
        self.learn_result = None
        self.learn_gate: Optional[asyncio.Event] = None
        self.learn_timeouts: list = []
        self.learn_cancels = 0
        self.backups: list = []
        self.restores: list = []
        self.restore_failure: Optional[dict] = None
        self.restore_gate: Optional[asyncio.Event] = None
        # Whole-document writes (phase 4): the sync_hub calls, the outcome
        # the fake reports (success | stopped) and where it stops, a gate
        # a run waits on (for cancel tests).
        self.applies: list[dict] = []
        self.apply_outcome = "success"
        self.apply_stop_at = 1
        self.apply_gate: Optional[asyncio.Event] = None
        # Managed wifi devices (callbacks plan): the deploys and updates
        # asked for, injected errors, and the extra device rows the
        # snapshot shows for them (block fields, command labels).
        self.local_ip = "192.168.1.10"
        self.wifi_deploys: list[dict] = []
        self.wifi_updates: list[dict] = []
        self.wifi_deploy_error: Optional[BaseException] = None
        self.wifi_update_error: Optional[BaseException] = None
        self.device_blocks: dict[int, dict] = {}
        self.device_commands: dict[int, list] = {}
        self.activities_data = [
            Activity(activity_id=101, name="Watch TV", active=False, needs_confirm=False),
            Activity(activity_id=102, name="Music", active=False, needs_confirm=False),
        ]
        self.devices_data = [
            Device(device_id=1, name="TV", brand="Sony", device_class="ir", device_class_code=1, power_state=0, idle_behavior=None),
            Device(device_id=2, name="Amp", brand="Denon", device_class="ir", device_class_code=1, power_state=1, idle_behavior=2),
        ]

    # -- lifecycle -----------------------------------------------------------

    def set_zeroconf(self, zc) -> None:
        self.zeroconf = zc

    async def start(self) -> None:
        if self.start_error is not None:
            raise self.start_error
        self.started = True

    async def stop(self, *, release_hub: bool = False) -> None:
        self.started = False
        self.stops.append(release_hub)

    async def wait_until_discoverable(self, timeout: float = 30.0) -> bool:
        self.advertised += 1
        return True

    # -- status --------------------------------------------------------------

    async def status(self) -> HubStatus:
        return HubStatus(
            hub_connected=self.started,
            app_connected=self.refuse,
            controllable=self.started and not self.refuse,
            mode="observe" if (self.started and self.refuse) else ("control" if self.started else "disconnected"),
            hub_version=self.model,
            proxy_enabled=True,
            running_activity=self.running,
            activities_cached=len(self.activities_data),
            devices_cached=len(self.devices_data),
            catalog_ready=self.catalog_ready,
        )

    async def hub_info(self, *, refresh: bool = False) -> HubInfo:
        self._maybe_fail()
        if self.mac is None:
            return HubInfo(known=False, model=None, name=None, mac=None, firmware_version=None, production_batch=None)
        return HubInfo(known=True, model=self.model, name=self.hub_name, mac=self.mac, firmware_version=5, production_batch="20221120")

    # -- reads ---------------------------------------------------------------

    def _maybe_fail(self) -> None:
        if self.fail_with is not None:
            raise self.fail_with

    async def activities(self) -> list[Activity]:
        self._maybe_fail()
        return list(self.activities_data)

    async def devices(self, *, refresh: bool = False) -> list[Device]:
        self._maybe_fail()
        if refresh:
            self.refreshes += 1
        return list(self.devices_data)

    async def clear_devices_catalog(self) -> None:
        self.catalog_clears += 1

    async def commands(self, device_id: int) -> list[Command]:
        self._maybe_fail()
        return [Command(command_id=1, label="Power"), Command(command_id=2, label="Mute")]

    async def buttons(self, entity_id: int) -> list[Button]:
        self._maybe_fail()
        return [
            Button(button_code=174, name="UP", device_id=1, command_id=17),
            Button(button_code=175, name="DOWN", device_id=1, command_id=18,
                   long_press_device_id=2, long_press_command_id=5),
        ]

    async def macros(self, activity_id: int) -> list[Macro]:
        self._maybe_fail()
        return [Macro(command_id=200, label="All On")]

    async def favorites(self, activity_id: int) -> list[Favorite]:
        self._maybe_fail()
        return [Favorite(device_id=1, command_id=1, label="Power")]

    async def current_activity(self):
        return None if self.running is None else {"activity_id": self.running.activity_id, "name": self.running.name}

    # -- control -------------------------------------------------------------

    async def send(self, entity_id: int, command_id: int) -> bool:
        self.sent.append(("send", (entity_id, command_id)))
        return not self.refuse

    async def start_activity(self, activity_id: int) -> bool:
        self.sent.append(("start", (activity_id,)))
        if not self.refuse:
            self.running = RunningActivity(activity_id=activity_id, name=next((a.name for a in self.activities_data if a.activity_id == activity_id), None))
        return not self.refuse

    async def stop_activity(self, activity_id: int) -> bool:
        self.sent.append(("stop", (activity_id,)))
        if not self.refuse:
            self.running = None
        return not self.refuse

    async def find_remote(self) -> bool:
        self.sent.append(("find", ()))
        return not self.refuse

    async def resync_remote(self) -> bool:
        self.sent.append(("resync", ()))
        return not self.refuse

    # -- snapshot / state document (phase 3) -----------------------------------

    def _entity(self, kind: str, entity_id: int, name: str) -> dict:
        fetched = entity_id in self.fetched
        payload = {"kind": f"{kind}_backup", "complete": fetched, "editable": fetched,
                   "fetched_at": self.fetched_at.get(entity_id),
                   "device": {"device_id": entity_id, "name": name}, "button_bindings": [], "macros": []}
        if kind == "device":
            payload["device"].update({"brand": "Acme", "device_class": "tv", "idle_behavior": 0})
            payload["commands"] = [{"command_id": 1, "name": "Power"}, {"command_id": 2, "name": "Mute"}]
            payload["key_sort"] = None
            payload["input_record"] = None
            if entity_id in self.device_blocks:
                payload["device"].update(self.device_blocks[entity_id])
            if entity_id in self.device_commands:
                payload["commands"] = [dict(row) for row in self.device_commands[entity_id]]
        else:
            payload["device"]["entity_type"] = "activity"
            payload["favorite_slots"] = [{"button_id": 1, "device_id": 1, "command_id": 1}]
            payload["favorites_order"] = [1]
            payload["referenced_source_device_ids"] = [1]
        return payload

    def _bundle(self) -> dict:
        def _row(kind, entity_id, name):
            edited = self.edited_entities.get((kind, entity_id))
            if edited is not None:
                return {**edited, "complete": True, "editable": True}
            return self._entity(kind, entity_id, name)

        return {
            "kind": "hub_bundle", "schema_version": 1, "captured_at": "2026-09-10T00:00:00Z",
            "complete": all(e in self.fetched for e in self._entity_ids()), "payload_profile": "structural",
            "hub": {"name": self.hub_name},
            "devices": [_row("device", d.device_id, d.name) for d in self.devices_data],
            "activities": [_row("activity", a.activity_id, a.name) for a in self.activities_data],
        }

    def _entity_ids(self) -> list[int]:
        return [d.device_id for d in self.devices_data] + [a.activity_id for a in self.activities_data]

    async def snapshot(self) -> HubSnapshot:
        from sofabaton.models import snapshot_content_id
        bundle = self._bundle()
        entities = {
            "device": [SnapshotEntity(kind="device", entity_id=d.device_id, name=d.name, complete=d.device_id in self.fetched,
                                      editable=d.device_id in self.fetched,
                                      fetched_at=self.fetched_at.get(d.device_id)) for d in self.devices_data],
            "activity": [SnapshotEntity(kind="activity", entity_id=a.activity_id, name=a.name, complete=a.activity_id in self.fetched,
                                        editable=a.activity_id in self.fetched,
                                        fetched_at=self.fetched_at.get(a.activity_id)) for a in self.activities_data],
        }
        return HubSnapshot(snapshot_id=snapshot_content_id(bundle), captured_at=bundle["captured_at"],
                           engine_generation=self._seq, complete=bundle["complete"],
                           hub=bundle["hub"], devices=entities["device"], activities=entities["activity"], bundle=bundle)

    async def refresh(self, *, device_id=None, activity_id=None, progress=None, timeout=10.0):
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.refresh_calls.append({"device_id": device_id, "activity_id": activity_id})
        targets = [device_id] if device_id else ([activity_id] if activity_id else self._entity_ids())
        for index, entity_id in enumerate(targets):
            if progress is not None:
                progress(WriteProgress(phase="device" if entity_id < 101 else "activity", message=f"Refreshing {entity_id}",
                                       completed_steps=index, total_steps=len(targets), entity_kind=None, entity_id=entity_id))
            if self.refresh_gate is not None:
                try:
                    await self.refresh_gate.wait()
                except asyncio.CancelledError:
                    # Like the library: the in-flight read lands before the
                    # cancellation is honoured, however often it is repeated.
                    self.cancellations += 1
                    while self.drain_gate is not None and not self.drain_gate.is_set():
                        try:
                            await asyncio.shield(self.drain_gate.wait())
                        except asyncio.CancelledError:
                            self.cancellations += 1
                    raise
            self.fetched.add(entity_id)
        snap = await self.snapshot()
        self.emit("snapshot_changed", SnapshotChanged(snapshot_id=snap.snapshot_id, engine_generation=self._seq,
                                                      device_ids=tuple(t for t in targets if t < 101),
                                                      activity_ids=tuple(t for t in targets if t >= 101)))
        return snap

    # -- writes (phase 3 W3) ---------------------------------------------------

    async def sync_activity(self, *, baseline, edited, activity_id, progress=None, snapshot_id=None):
        return await self._sync("activity", baseline, edited, activity_id, progress, snapshot_id)

    async def sync_device(self, *, baseline, edited, device_id, progress=None, snapshot_id=None, allow_command_removal=False):
        self.last_allow_command_removal = allow_command_removal
        return await self._sync("device", baseline, edited, device_id, progress, snapshot_id)

    async def _sync(self, kind, baseline, edited, entity_id, progress, snapshot_id):
        from sofabaton import SyncResult
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.syncs.append({"kind": kind, "entity_id": entity_id, "baseline": baseline, "edited": edited, "snapshot_id": snapshot_id})
        if progress is not None:
            progress(WriteProgress(phase="writing", message="Writing", completed_steps=0, total_steps=1,
                                   entity_kind=kind, entity_id=entity_id, step_kind="binding_write"))
        if self.sync_failure is not None:
            return SyncResult.from_engine(self.sync_failure, snapshot_id=(await self.snapshot()).snapshot_id)
        # The edit "lands": remember the edited entity so the snapshot moves.
        key = "devices" if kind == "device" else "activities"
        for row in edited.get(key) or []:
            if int(row["device"]["device_id"]) == entity_id:
                self.edited_entities[(kind, entity_id)] = row
        snap = await self.snapshot()
        self.emit("snapshot_changed", SnapshotChanged(snapshot_id=snap.snapshot_id, engine_generation=self._seq,
                                                      device_ids=(entity_id,) if kind == "device" else (),
                                                      activity_ids=(entity_id,) if kind == "activity" else ()))
        return SyncResult(status="success", failed_at=None, message=None, completed_steps=1, total_steps=1,
                          counters={}, snapshot_id=snap.snapshot_id)

    async def sync_hub(self, *, baseline=None, desired=None, state=None, snapshot_id=None,
                       progress=None, on_state=None, hub_version=None):
        """Run the real planner (stage A), then report items the way the
        library's runner would, handing the state to ``on_state`` as it goes."""

        from sofabaton import ApplyState, HubSyncResult, build_hub_sync_plan

        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.applies.append({"baseline": baseline, "desired": desired, "state": state,
                             "snapshot_id": snapshot_id, "hub_version": hub_version})
        if state is None:
            plan = build_hub_sync_plan(baseline, desired, hub_version=hub_version)
            state = ApplyState.new(baseline, desired, plan, hub_version=hub_version)
        state.runs += 1
        state.status = "running"
        state.failed_at = state.message = None
        if on_state:
            on_state(state)
        if self.apply_gate is not None:
            try:
                await self.apply_gate.wait()
            except asyncio.CancelledError:
                state.status = "cancelled"
                state.message = "cancelled between items"
                if on_state:
                    on_state(state)
                raise
        for index, item in enumerate(state.items):
            if item.status == "done":
                continue
            if progress:
                progress(WriteProgress(phase="item", message=item.label, completed_steps=0, total_steps=1,
                                       entity_kind=item.entity_kind, entity_id=item.entity_id,
                                       item_index=index, item_count=len(state.items)))
            if self.apply_outcome == "stopped" and index == self.apply_stop_at:
                item.status, item.completed_steps, item.total_steps = "partial", 1, 2
                item.failed_at, item.message = "binding_write", "no ack"
                state.writes += 1
                state.cursor = index
                state.failed_at, state.message = "item", f"item {index} partial: no ack"
                if item.entity_kind and item.entity_id is not None:
                    state.note_refresh(item.entity_kind, item.entity_id)
                state.status = "stopped"
                break
            item.status, item.completed_steps, item.total_steps = "done", 1, 1
            state.writes += 1
            state.cursor = index + 1
            if on_state:
                on_state(state)
        else:
            state.status = "success"
            state.needs_refresh = []
        state.remote_sync = "sent" if state.writes else "not_needed"
        snap = await self.snapshot()
        state.rebased, state.snapshot_id = True, snap.snapshot_id
        if on_state:
            on_state(state)
        return HubSyncResult.from_state(state)

    async def _intent(self, name, *args):
        from sofabaton import HubRejectedError
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.intents.append((name, args))
        if self.reject_intents:
            raise HubRejectedError(f"the hub did not accept {name}")

    async def add_device(self, name, device_class):
        await self._intent("add_device", name, device_class)
        new_id = max(d.device_id for d in self.devices_data) + 1
        self.devices_data.append(Device(device_id=new_id, name=name, brand=None, device_class=device_class,
                                        device_class_code=None, power_state=None, idle_behavior=None))
        return new_id

    async def add_activity(self, name):
        await self._intent("add_activity", name)
        new_id = max(a.activity_id for a in self.activities_data) + 1
        self.activities_data.append(Activity(activity_id=new_id, name=name, active=False, needs_confirm=False))
        return new_id

    async def remove_device(self, device_id):
        from sofabaton import DeviceRemoved
        await self._intent("remove_device", device_id)
        self.devices_data = [d for d in self.devices_data if d.device_id != device_id]
        self.device_blocks.pop(device_id, None)
        self.device_commands.pop(device_id, None)
        self._emit_snapshot_changed(device_ids=(device_id,))
        return DeviceRemoved(device_id=device_id, confirmed_activity_ids=(), impacted_activity_ids=(101,))

    # -- managed wifi devices (callbacks plan) -----------------------------------

    def local_address(self) -> str:
        return self.local_ip

    def _action_id(self) -> str:
        from sofabaton_server.models import mac_key
        return mac_key(self.mac) if self.mac else self.config.host

    def _emit_snapshot_changed(self, *, device_ids=(), activity_ids=()) -> None:
        import asyncio as _asyncio
        try:
            loop = _asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        async def _later():
            snap = await self.snapshot()
            self.emit("snapshot_changed", SnapshotChanged(snapshot_id=snap.snapshot_id, engine_generation=self._seq,
                                                          device_ids=tuple(device_ids), activity_ids=tuple(activity_ids)))

        if loop is not None:
            loop.create_task(_later())

    def place_wifi_device(self, device_id: int, spec, *, host: str = "", port: int = 0, brand: str = "m3tac0de",
                          device_class: str = "wifi_ip") -> None:
        """Make the snapshot show a managed wifi device with our callback records
        (what adoption and the identity check look at)."""

        from sofabaton import Device, IrPayload
        from sofabaton.wifi_device import labels_from_spec
        normalized = spec.normalized()
        if all(d.device_id != device_id for d in self.devices_data):
            self.devices_data.append(Device(device_id=device_id, name=normalized.name, brand=brand, device_class=device_class,
                                            device_class_code=0x20 if device_class == "wifi_mqtt" else 0x1C,
                                            power_state=None, idle_behavior=None))
        self.fetched.add(device_id)
        self.device_blocks[device_id] = {"brand": brand, "device_class": device_class, "name": normalized.name}
        labels = labels_from_spec(normalized)
        self.device_commands[device_id] = [{"command_id": cid, "name": label} for cid, label in sorted(labels.items())]
        if device_class == "wifi_mqtt":
            return                                   # inert records: nothing on the device names the server
        path = f"/launch/{self._action_id()}/{device_id}/0/short"
        text = f"POST {path} HTTP/1.1" + CRLF + f"Host:{host}:{port}" + CRLF + "Content-Type:application/x-www-form-urlencoded" + CRLF + CRLF
        self.payloads[(device_id, 1)] = IrPayload.from_bytes(text.encode("ascii"))

    async def deploy_wifi_device(self, spec, *, host=None, port=None, transport="http"):
        from sofabaton import WifiDeployment, WifiTarget
        from sofabaton.wifi_device import labels_from_spec
        await self._intent("deploy_wifi_device", spec.normalized().name, host, port)
        if self.wifi_deploy_error is not None:
            raise self.wifi_deploy_error
        normalized = spec.normalized()
        new_id = max([d.device_id for d in self.devices_data] + [0]) + 1
        self.wifi_deploys.append({"device_id": new_id, "spec": normalized, "host": host, "port": port, "transport": transport})
        if transport == "mqtt":
            if self.model != "X2":
                raise ValueError("the mqtt transport exists on the X2 only")
            self.place_wifi_device(new_id, normalized, brand=normalized.brand, device_class="wifi_mqtt")
            self._emit_snapshot_changed(device_ids=(new_id,))
            return WifiDeployment(device_id=new_id, spec=normalized, target=None, labels=labels_from_spec(normalized),
                                  hub_version=self.model, transport="mqtt")
        self.place_wifi_device(new_id, normalized, host=host, port=port, brand=normalized.brand)
        self._emit_snapshot_changed(device_ids=(new_id,))
        return WifiDeployment(device_id=new_id, spec=normalized, target=WifiTarget(host, port, self._action_id()),
                              labels=labels_from_spec(normalized), hub_version=self.model)

    async def update_wifi_device(self, deployment, spec, *, progress=None):
        from sofabaton import WifiDeployment
        from sofabaton.wifi_device import labels_from_spec
        await self._intent("update_wifi_device", deployment.device_id, spec.normalized().name)
        if self.wifi_update_error is not None:
            raise self.wifi_update_error
        normalized = spec.normalized()
        self.wifi_updates.append({"device_id": deployment.device_id, "spec": normalized, "deployment": deployment})
        labels = labels_from_spec(normalized)
        self.device_commands[deployment.device_id] = [{"command_id": cid, "name": label} for cid, label in sorted(labels.items())]
        self.device_blocks.setdefault(deployment.device_id, {})["name"] = normalized.name
        self._emit_snapshot_changed(device_ids=(deployment.device_id,))
        return WifiDeployment(device_id=deployment.device_id, spec=normalized, target=deployment.target,
                              labels=labels, hub_version=self.model, transport=deployment.transport)

    async def remove_activity(self, activity_id):
        await self._intent("remove_activity", activity_id)
        self.activities_data = [a for a in self.activities_data if a.activity_id != activity_id]

    async def reorder_devices(self, ordered_ids):
        await self._intent("reorder_devices", list(ordered_ids))

    async def reorder_activities(self, ordered_ids):
        await self._intent("reorder_activities", list(ordered_ids))

    async def set_hub_name(self, name, *, timeout=5.0):
        await self._intent("set_hub_name", name)
        self.hub_name = name

    # -- payloads / backup / restore (phase 3 W3) ------------------------------

    async def read_payload(self, device_id, command_id, *, timeout=10.0):
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        return self.payloads.get((device_id, command_id))

    async def play(self, payload):
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.played.append(payload)

    async def learn_ir(self, *, timeout=60.0):
        from sofabaton import IrLearnError
        self.learn_timeouts.append(timeout)
        if self.learn_gate is not None:
            await self.learn_gate.wait()
        if self.learn_result is None:
            raise IrLearnError("timed_out")
        return self.learn_result

    async def cancel_learn(self):
        self.learn_cancels += 1
        if self.learn_gate is not None:
            self.learn_gate.set()
        return True

    async def backup(self, *, include_blobs=True, device_ids=None, progress=None, timeout=10.0):
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.backups.append({"include_blobs": include_blobs, "device_ids": device_ids})
        if progress is not None:
            progress(WriteProgress(phase="device", message="Backing up device 1", completed_steps=0, total_steps=1,
                                   entity_kind="device", entity_id=1))
        return {"kind": "hub_bundle", "payload_profile": "full_backup" if include_blobs else "structural",
                "devices": [{"device": {"device_id": 1}}], "activities": []}

    async def restore(self, bundle, *, replace=False, progress=None):
        from sofabaton import RestoreResult
        self._maybe_fail()
        if self.refuse:
            raise HubBusyError("an app client holds the hub")
        self.restores.append({"bundle": bundle, "replace": replace})
        if self.restore_gate is not None:
            await self.restore_gate.wait()
        if self.restore_failure is not None:
            return RestoreResult.from_engine(self.restore_failure, snapshot_id=(await self.snapshot()).snapshot_id,
                                             erased=bool(replace))
        # The engine's real shape: lists of per-entity records.
        return RestoreResult.from_engine(
            {"status": "success", "device_id_map": {"1": 9},
             "restored_devices": [{"source_device_id": 1, "device_id": 9}], "restored_activities": []},
            snapshot_id=(await self.snapshot()).snapshot_id)

    async def erase(self, *, timeout=120.0):
        await self._intent("erase")
        self.devices_data = []
        self.activities_data = []

    async def export_state(self) -> dict:
        self.exports += 1
        return {"kind": "sofabaton_state", "schema": 1, "library": "test", "exported_at": "now",
                "state": {"fetched": sorted(self.fetched)}}

    async def import_state(self, document: dict) -> HubSnapshot:
        if not isinstance(document, dict) or document.get("kind") != "sofabaton_state":
            raise StateDocumentError("not a sofabaton state document")
        self.imported = document
        self.fetched = set(document.get("state", {}).get("fetched", []))
        return await self.snapshot()

    # -- events --------------------------------------------------------------

    async def events(self):
        while True:
            yield await self._queue.get()

    def emit(self, kind: str, payload=None) -> None:
        self._seq += 1
        self._queue.put_nowait(HubEvent(seq=self._seq, kind=kind, payload=payload))

    def ready(self, mac: str) -> None:
        self.mac = mac
        self.catalog_ready = True
        self.emit("catalog_ready", CatalogReady(ready=True))


class Factory:
    """Records every proxy it built, keyed by host."""

    def __init__(self) -> None:
        self.built: dict[str, list[FakeProxy]] = {}
        self.start_error: Optional[BaseException] = None   # injected into new proxies
        self.on_build = None                                # callable(proxy): shape a proxy before the app starts it

    def __call__(self, config: HubConfig) -> FakeProxy:
        proxy = FakeProxy(config)
        proxy.start_error = self.start_error
        if self.on_build is not None:
            self.on_build(proxy)
        self.built.setdefault(config.host, []).append(proxy)
        return proxy

    def latest(self, host: str) -> FakeProxy:
        return self.built[host][-1]


# -- discovery fakes ---------------------------------------------------------------


class FakeBrowser:
    """Stands in for AsyncHubBrowser: the test feeds advertisements through it."""

    instances: list["FakeBrowser"] = []

    def __init__(self, *, zc=None, include_proxies=False, on_added=None, on_updated=None, on_removed=None) -> None:
        self.zc = zc
        self.include_proxies = include_proxies
        self.on_added, self.on_updated, self.on_removed = on_added, on_updated, on_removed
        self.running = False
        FakeBrowser.instances.append(self)

    async def start(self):
        self.running = True
        return self

    async def stop(self) -> None:
        self.running = False


class FakeAdvertiser:
    def __init__(self) -> None:
        self.started: list[tuple[int, dict]] = []
        self.updates: list[dict] = []
        self.stopped = False

    def start(self, zc, settings, hub_count) -> None:
        from sofabaton_server.discovery import advertisement_txt
        self.started.append((settings.port, advertisement_txt(settings, hub_count)))

    def update(self, settings, hub_count) -> None:
        from sofabaton_server.discovery import advertisement_txt
        self.updates.append(advertisement_txt(settings, hub_count))

    def stop(self) -> None:
        self.stopped = True


class FakeZeroconf:
    def close(self) -> None:
        pass


def no_network_discovery(settings, manager, *, scanner=None):
    """A DiscoveryService that never touches the network (for route tests)."""

    from sofabaton_server.discovery import DiscoveryService

    async def _no_hubs(**kwargs):
        return []

    return DiscoveryService(
        settings, manager,
        browser_factory=FakeBrowser,
        scanner=scanner or _no_hubs,
        advertiser=FakeAdvertiser(),
        zeroconf=FakeZeroconf(),
    )
