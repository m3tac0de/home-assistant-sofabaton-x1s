#!/usr/bin/env python3
"""sofabaton CLI — discover hubs and drive a proxy interactively.

``sofabaton discover``  one-shot mDNS scan for hubs.
``sofabaton run``       start a proxy and open an interactive shell.

The shell is a thin UI over :class:`AsyncXProxy`: it reads input on the
executor so the event loop keeps running, so live hub/app/activity
events print as they happen, and every command maps to a facade call.
"""

import argparse
import asyncio
import logging
import sys
from typing import Any, Awaitable, Callable, Dict, Optional

from .aio import AsyncXProxy, async_discover_hubs
from .hub_versions import HVER_BY_HUB_VERSION
from .protocol_const import BUTTONNAME_BY_CODE, ButtonName

# ----------------- helpers -----------------


def parse_int(s: str) -> int:
    """Parse decimal or 0x..."""
    s = s.strip()
    if s.lower().startswith("0x"):
        return int(s, 16)
    return int(s, 10)


def resolve_button(code_or_name: str) -> int | None:
    """Accept either numeric (e.g. 0xB0) or name (e.g. OK)."""
    try:
        return parse_int(code_or_name)
    except ValueError:
        pass
    upper = code_or_name.upper()
    if hasattr(ButtonName, upper):
        return getattr(ButtonName, upper)
    for code, name in BUTTONNAME_BY_CODE.items():
        if name.upper() == upper:
            return code
    return None


def parse_payload_hex(text: str) -> bytes:
    """Parse pasted IR-payload hex into bytes.

    Accepts the formats payloads circulate in: space/newline-separated
    byte pairs, contiguous hex, comma-separated lists, and ``0x``
    prefixes. Raises ``ValueError`` on anything that isn't clean hex.
    """

    tokens = text.replace(",", " ").split()
    cleaned = "".join(t[2:] if t.lower().startswith("0x") else t for t in tokens)
    return bytes.fromhex(cleaned)


def _kv_list_to_dict(items) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for it in items or []:
        if "=" in it:
            k, v = it.split("=", 1)
            out[k.strip()] = v.strip()
        else:
            out[it.strip()] = ""
    return out


def resolve_button_code(token: str) -> int:
    """A button code from a number or a ``ButtonName`` alias (``POWER_ON``)."""

    try:
        return parse_int(token) & 0xFF
    except ValueError:
        pass
    code = getattr(ButtonName, token.strip().upper(), None)
    if isinstance(code, int):
        return code & 0xFF
    raise ValueError(f"unknown button {token!r} (a code or a ButtonName alias)")


def _parse_shell_args(rest: str) -> tuple[Optional[str], Dict[str, str], set[str]]:
    """Split a REPL argument string into (path, key=value opts, bare flags).

    Tokens shaped ``key=value`` land in the opts dict; a bare ``erase``
    token becomes a flag; the first remaining token is treated as the
    file path. This keeps ``backup``/``restore`` feeling like a CLI
    without pulling argparse into the interactive loop.
    """

    path: Optional[str] = None
    opts: Dict[str, str] = {}
    flags: set[str] = set()
    for tok in rest.split():
        if "=" in tok:
            key, value = tok.split("=", 1)
            opts[key.strip().lower()] = value.strip()
        elif tok.lower() in ("erase", "plan"):
            flags.add(tok.lower())
        elif path is None:
            path = tok
    return path, opts, flags


def _parse_id_csv(value: Optional[str]) -> list[int]:
    """Parse ``5,7,0x0A`` into a de-duplicated list of 8-bit ids."""

    ids: list[int] = []
    for part in (value or "").split(","):
        part = part.strip()
        if not part:
            continue
        ident = parse_int(part) & 0xFF
        if ident and ident not in ids:
            ids.append(ident)
    return ids


def _bundle_entity_id(entry: Dict) -> int:
    """Read the source id off a bundle device/activity payload."""

    block = entry.get("device") if isinstance(entry, dict) else None
    return int((block or {}).get("device_id", 0)) & 0xFF


def _activity_referenced_device_ids(activity: Dict) -> set[int]:
    """Source device ids an activity payload points at (buttons/macros/favs).

    Mirrors the library's own reference walk so the CLI can warn when a
    selective restore would drop a device an activity still needs.
    """

    refs: set[int] = set()

    def _add(raw) -> None:
        try:
            value = int(raw) & 0xFF
        except (TypeError, ValueError):
            return
        if value and value != 0xFF:  # 0 = unset, 0xFF = delay sentinel
            refs.add(value)

    for row in activity.get("button_bindings") or []:
        if isinstance(row, dict):
            _add(row.get("device_id"))
            _add(row.get("long_press_device_id"))
    for row in activity.get("macros") or []:
        if isinstance(row, dict):
            for step in row.get("steps") or []:
                if isinstance(step, dict):
                    _add(step.get("device_id"))
    for row in activity.get("favorite_slots") or []:
        if isinstance(row, dict):
            _add(row.get("device_id"))
    return refs


def _filter_bundle(
    bundle: Dict, device_ids: list[int], activity_ids: list[int]
) -> Dict:
    """Return a copy of a hub_bundle keeping only the selected entities.

    An empty id list means "keep all" for that kind, so callers can
    subset devices, activities, or both. The bundle is plain JSON, so
    this is just list filtering — no library round-trip needed.
    """

    filtered = dict(bundle)
    devices = list(bundle.get("devices") or [])
    activities = list(bundle.get("activities") or [])
    if device_ids:
        devices = [d for d in devices if _bundle_entity_id(d) in device_ids]
    if activity_ids:
        activities = [a for a in activities if _bundle_entity_id(a) in activity_ids]
    filtered["devices"] = devices
    filtered["activities"] = activities
    return filtered


async def _ainput(prompt: str) -> Optional[str]:
    """Read a line without blocking the event loop. None on EOF."""

    def _read() -> Optional[str]:
        try:
            return input(prompt)
        except EOFError:
            return None

    return await asyncio.get_running_loop().run_in_executor(None, _read)


# ----------------- interactive shell -----------------


class AsyncShell:
    """A small REPL over :class:`AsyncXProxy`."""

    prompt = "x> "

    def __init__(self, proxy: AsyncXProxy) -> None:
        self.p = proxy
        self._stop = False
        self._commands: Dict[str, Callable[[str], Awaitable[None]]] = {
            "help": self.cmd_help,
            "?": self.cmd_help,
            "status": self.cmd_status,
            "activities": self.cmd_activities,
            "devices": self.cmd_devices,
            "commands": self.cmd_commands,
            "buttons": self.cmd_buttons,
            "macros": self.cmd_macros,
            "favorites": self.cmd_favorites,
            "press": self.cmd_press,
            "send": self.cmd_press,  # alias
            "start": self.cmd_start,
            "stop": self.cmd_stop,
            "find": self.cmd_find,
            "testir": self.cmd_testir,
            "proxy": self.cmd_proxy,
            "backup": self.cmd_backup,
            "restore": self.cmd_restore,
            "snapshot": self.cmd_snapshot,
            "apply": self.cmd_apply,
            "refresh": self.cmd_refresh,
            "rename": self.cmd_rename,
            "bind": self.cmd_bind,
            "unbind": self.cmd_unbind,
            "hubname": self.cmd_hubname,
            "quit": self.cmd_quit,
            "exit": self.cmd_quit,
        }

        # Live events (delivered on the loop) print as they happen.
        proxy.on_hub_state_change(lambda up: print(f"\n[event] hub {'CONNECTED' if up else 'DISCONNECTED'}"))
        proxy.on_client_state_change(lambda up: print(f"\n[event] app {'CONNECTED' if up else 'GONE'}"))
        proxy.on_activity_change(
            lambda new, old, name: print(f"\n[event] activity -> {name or '?'} ({old} -> {new})")
        )

    # ----- read commands ----------------------------------------------------
    #
    # Browsing is for retrieving the (entity_id, command_id) pairs you send
    # with ``press``/``send``. IDs are shown as decimal ints throughout.

    async def _safe(self, label: str, coro):
        try:
            return await coro
        except (RuntimeError, TimeoutError) as err:
            print(f"[{label}] {err}")
            return None

    async def cmd_status(self, _args: str) -> None:
        st = await self.p.status()
        info = await self.p.hub_info()
        print("== status ==")
        print(f"hub connected   : {st.hub_connected}")
        print(f"app connected   : {st.app_connected}")
        print(f"controllable    : {st.controllable}  ({st.mode} mode)")
        print(f"hub version     : {st.hub_version}")
        if info.known:
            print(f"hub name        : {info.name or '?'}  (fw {info.firmware_version}, mac {info.mac or '?'})")
        cur = st.running_activity
        running = f"{cur.name or '?'} (id {cur.activity_id})" if cur else "(none)"
        print(f"running activity: {running}")
        print(f"activities      : {st.activities_cached} cached")
        print(f"devices         : {st.devices_cached} cached")

    async def cmd_activities(self, _args: str) -> None:
        acts = await self._safe("activities", self.p.activities())
        if not acts:
            print("no activities (need control mode?)")
            return
        print("activity_id  active  name")
        for act in acts:
            print(f"{act.activity_id:<11}  {'*' if act.active else ' ':^6}  {act.name}")

    async def cmd_devices(self, _args: str) -> None:
        devs = await self._safe("devices", self.p.devices())
        if not devs:
            print("no devices (need control mode?)")
            return
        print("device_id  name  (brand)  [class]  power")
        for dev in devs:
            power = "?" if dev.power_state is None else ("on" if dev.power_state else "off")
            print(f"{dev.device_id:<9}  {dev.name or '?'}  ({dev.brand or ''})  [{dev.device_class or '?'}]  {power}")

    async def cmd_commands(self, args: str) -> None:
        if not args.strip():
            print("usage: commands <device_id>")
            return
        dev = parse_int(args)
        cmds = await self._safe("commands", self.p.commands(dev))
        if not cmds:
            print("no commands (need control mode?)")
            return
        print(f"send with: press {dev} <command_id>")
        for c in cmds:
            print(f"  command_id={c.command_id:<5} {c.label}")

    async def cmd_buttons(self, args: str) -> None:
        if not args.strip():
            print("usage: buttons <activity_or_device_id>")
            return
        ent = parse_int(args)
        btns = await self._safe("buttons", self.p.buttons(ent))
        if not btns:
            print("no buttons (need control mode?)")
            return
        print(f"send with: press {ent} <button_code>")
        for b in btns:
            target = ""
            if b.device_id and b.command_id is not None:
                target = f"   -> device_id={b.device_id} command_id={b.command_id}"
            print(f"  button_code={b.button_code:<5} {b.name or '':<10}{target}")

    async def cmd_macros(self, args: str) -> None:
        if not args.strip():
            print("usage: macros <activity_id>")
            return
        act = parse_int(args)
        macros = await self._safe("macros", self.p.macros(act))
        if not macros:
            print("no macros (need control mode?)")
            return
        print(f"send with: press {act} <command_id>")
        for m in macros:
            print(f"  command_id={m.command_id:<5} {m.label or ''}")

    async def cmd_favorites(self, args: str) -> None:
        if not args.strip():
            print("usage: favorites <activity_id>")
            return
        act = parse_int(args)
        favs = await self._safe("favorites", self.p.favorites(act))
        if not favs:
            print("no favorites (need control mode?)")
            return
        print("send with: press <device_id> <command_id>")
        for f in favs:
            print(f"  device_id={f.device_id:<5} command_id={f.command_id:<5} {f.label or ''}")

    # ----- control commands -------------------------------------------------

    async def cmd_press(self, args: str) -> None:
        parts = args.split()
        if len(parts) != 2:
            print("usage: press <entity_id> <button_name_or_code>   (e.g. press 101 POWER_ON)")
            return
        ent = parse_int(parts[0])
        btn = resolve_button(parts[1])
        if btn is None:
            print(f"unknown button {parts[1]!r}")
            return
        ok = await self.p.press(ent, btn)
        print("sent" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_start(self, args: str) -> None:
        if not args.strip():
            print("usage: start <activity_id>")
            return
        ok = await self.p.start_activity(parse_int(args))
        print("started" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_stop(self, args: str) -> None:
        if not args.strip():
            print("usage: stop <activity_id>")
            return
        ok = await self.p.stop_activity(parse_int(args))
        print("stopped" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_find(self, _args: str) -> None:
        ok = await self.p.find_remote()
        print("sent find-remote" if ok else "refused (need control mode: disconnect the app)")

    async def cmd_testir(self, args: str) -> None:
        if not args.strip():
            print("usage: testir <hex payload>      (e.g. testir 01 20 00 10 01 00 94 ac ...)")
            print("fires the payload out of the IR blaster once; nothing is saved")
            return
        try:
            payload = parse_payload_hex(args)
        except ValueError as err:
            print(f"not a valid hex payload: {err}")
            return
        if len(payload) < 10:
            print(f"payload too short ({len(payload)}B) to be a stored IR payload")
            return
        try:
            await self.p.play(payload)
        except (RuntimeError, ValueError) as err:
            print(f"not played: {err}")
            return
        print(f"played {len(payload)}B payload -- check the target device reacted")

    async def cmd_proxy(self, args: str) -> None:
        arg = args.strip().lower()
        if arg == "on":
            await self.p.enable_proxy()
            print("proxy enabled")
        elif arg == "off":
            await self.p.disable_proxy()
            print("proxy disabled")
        else:
            print("usage: proxy on|off")

    async def cmd_backup(self, args: str) -> None:
        import json

        path, opts, _flags = _parse_shell_args(args)
        path = path or "hub_backup.json"
        # device_ids=None backs up the whole hub; a list narrows to those
        # devices (the library omits activities for a device-only bundle).
        device_ids = _parse_id_csv(opts.get("devices"))
        if device_ids:
            print(f"backing up devices {device_ids} only (no activities)...")
        else:
            print("backing up the whole hub (this fetches every device + activity)...")
        bundle = await self._safe(
            "backup",
            self.p.backup(
                device_ids=device_ids or None,
                progress=lambda p: print(f"  {p.message}"),
            ),
        )
        if bundle is None:
            return
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(bundle, fh, indent=2)
        print(
            f"wrote {path}: schema v{bundle['schema_version']}, "
            f"{len(bundle['devices'])} devices, {len(bundle['activities'])} activities, "
            f"complete={bundle['complete']}"
        )

    async def cmd_restore(self, args: str) -> None:
        import json

        path, opts, flags = _parse_shell_args(args)
        if not path:
            print(
                "usage: restore <file.json> [devices=ID,..] "
                "[activities=ID,..] [erase]"
            )
            return
        try:
            with open(path, encoding="utf-8") as fh:
                bundle = json.load(fh)
        except (OSError, ValueError) as err:
            print(f"cannot read {path}: {err}")
            return

        # Selective restore is just pruning the (plain-JSON) bundle before
        # handing it to the library; the restore engine is unchanged.
        device_ids = _parse_id_csv(opts.get("devices"))
        activity_ids = _parse_id_csv(opts.get("activities"))
        if device_ids or activity_ids:
            bundle = _filter_bundle(bundle, device_ids, activity_ids)
            kept_devices = {_bundle_entity_id(d) for d in bundle["devices"]}
            dangling: set[int] = set()
            for activity in bundle["activities"]:
                dangling |= _activity_referenced_device_ids(activity) - kept_devices
            if dangling:
                missing = ", ".join(str(d) for d in sorted(dangling))
                print(
                    f"warning: selected activities reference devices not in the "
                    f"restore set ({missing}); the hub may reject them — add them "
                    f"to devices=..."
                )
            print(
                f"restoring subset: {len(bundle['devices'])} device(s), "
                f"{len(bundle['activities'])} activity(ies)"
            )

        # erase first = "replace" semantics: wipe the hub's tables, then
        # lay the (possibly subset) bundle down on a clean slate.
        if "erase" in flags:
            print("erasing the hub's configuration first (wipes all devices + activities)...")
        print(f"restoring {path} onto the hub...")
        result = await self._safe(
            "restore",
            self.p.restore(
                bundle, replace="erase" in flags, progress=lambda p: print(f"  {p.message}")
            ),
        )
        if result is not None:
            print("restore result:", result.to_dict())

    # ----- snapshot / edits (phase 3) ----------------------------------------
    #
    # Edits are snapshot-based: take the snapshot, apply a pure helper from
    # ``sofabaton.edits`` to its bundle, sync the pair. The snapshot id rides
    # along so an edit made on a stale snapshot is refused before any write.

    async def cmd_snapshot(self, args: str) -> None:
        import json

        _path, opts, _flags = _parse_shell_args(args)
        snap = await self._safe("snapshot", self.p.snapshot())
        if snap is None:
            return
        out = opts.get("out")
        if out:
            # The document a later ``apply`` needs as its baseline.
            with open(out, "w", encoding="utf-8") as fh:
                json.dump(snap.to_dict(), fh, indent=2)
            print(f"wrote {out}: snapshot {snap.snapshot_id[:12]}, "
                  f"{len(snap.devices)} devices, {len(snap.activities)} activities, complete={snap.complete}")
            return
        print(
            f"snapshot {snap.snapshot_id[:12]}  complete={snap.complete}  "
            f"generation={snap.engine_generation}"
        )
        for entity in snap.devices + snap.activities:
            flags = []
            if not entity.complete:
                flags.append("incomplete")
            print(
                f"  {entity.kind:8} {entity.entity_id:4}  {entity.name or '?':30} "
                f"{' '.join(flags) or 'editable'}"
            )

    async def cmd_apply(self, args: str) -> None:
        """Whole-document write (phase 4): ``apply <edited> baseline=<snapshot> [plan]``
        or ``apply resume=<record>``. The baseline is the file ``snapshot out=``
        wrote; the record ``<edited>.apply.json`` is written after every item and
        is what ``resume=`` takes. A desired file alone is refused: an edited
        document and a hash of its baseline are not the baseline."""

        import json

        from . import build_hub_sync_plan
        from .hub_apply import ApplyState
        from .hub_sync import DocumentError

        path, opts, flags = _parse_shell_args(args)
        resume = opts.get("resume")
        if not resume and (not path or not opts.get("baseline")):
            print("usage: apply <edited.json> baseline=<snapshot.json> [plan]")
            print("       apply resume=<file.apply.json>")
            return

        def _load(file: str):
            try:
                with open(file, encoding="utf-8") as fh:
                    return json.load(fh)
            except (OSError, ValueError) as err:
                print(f"cannot read {file}: {err}")
                return None

        def _report(result) -> None:
            print(f"apply {result.apply_id[:12]}: {result.status}"
                  + (f" ({result.failed_at}: {result.message})" if result.failed_at else ""))
            for item in result.items:
                where = item.entity_id if item.entity_id is not None else item.placeholder_id
                steps = f" {item.completed_steps}/{item.total_steps}" if item.total_steps else ""
                print(f"  {item.index:3} {item.kind:18} {where if where is not None else '':>5}  {item.status}{steps}"
                      + (f"  {item.message}" if item.message and item.status != 'done' else ""))
            if result.id_map:
                print("  ids: " + ", ".join(f"{p} -> {v}" for p, v in sorted(result.id_map.items())))
            print(f"  remote sync: {result.remote_sync}; snapshot {result.snapshot_id[:12] if result.snapshot_id else '?'}"
                  + ("; resume with: apply resume=<record>" if result.resumable else ""))

        if resume:
            doc = _load(resume)
            if doc is None:
                return
            try:
                state = ApplyState.from_dict(doc)
            except ValueError as err:
                print(f"{resume}: {err}")
                return
            record_path = resume
            kwargs: Dict[str, Any] = {"state": state}
        else:
            desired = _load(path)
            baseline = _load(opts["baseline"])
            if desired is None or baseline is None:
                return
            if "plan" in flags:
                try:
                    plan = build_hub_sync_plan(baseline, desired)
                except DocumentError as err:
                    print(f"refused ({err.code}): {err}")
                    return
                print(f"{len(plan.items)} item(s), {plan.step_count} step(s), "
                      f"{len(plan.live_check)} entity re-read(s) before the first write; nothing written")
                for item in plan.items:
                    where = item.entity_id if item.entity_id is not None else item.placeholder_id
                    print(f"  {item.index:3} {item.kind:18} {where if where is not None else '':>5}  {item.label}")
                    for step in item.steps:
                        print(f"        - {step.kind}: {step.label}")
                for note in plan.notes:
                    print(f"  note: {note}")
                if plan.provisional_ids:
                    print("  provisional ids: " + ", ".join(f"{p} -> {v}" for p, v in plan.provisional_ids.items()))
                return
            record_path = f"{path}.apply.json"
            kwargs = {"baseline": baseline, "desired": desired, "snapshot_id": desired.get("snapshot_id")}

        def _save(state) -> None:
            with open(record_path, "w", encoding="utf-8") as fh:
                json.dump(state.to_dict(), fh, indent=2)

        try:
            result = await self.p.sync_hub(
                progress=lambda p: print(f"  [{p.item_index if p.item_index is not None else '-'}] {p.message}"),
                on_state=_save, **kwargs,
            )
        except DocumentError as err:
            print(f"refused ({err.code}): {err}")
            return
        except (RuntimeError, TimeoutError, ValueError) as err:
            print(f"[apply] {err}")
            return
        _report(result)
        print(f"record: {record_path}")

    async def cmd_refresh(self, args: str) -> None:
        _path, opts, _flags = _parse_shell_args(args)
        kwargs: Dict[str, Any] = {}
        if opts.get("dev"):
            kwargs["device_id"] = parse_int(opts["dev"])
        elif opts.get("act"):
            kwargs["activity_id"] = parse_int(opts["act"])
        else:
            print("refreshing the whole hub (every device and activity; this takes a while)...")
        snap = await self._safe(
            "refresh", self.p.refresh(progress=lambda p: print(f"  {p.message}"), **kwargs)
        )
        if snap is not None:
            print(f"snapshot {snap.snapshot_id[:12]}  complete={snap.complete}")

    async def _apply_edit(self, kind: str, entity_id: int, edit) -> None:
        """Snapshot, edit, sync; ``edit(bundle) -> bundle``."""

        from . import edits as _edits  # noqa: F401  (helpers are passed in)

        snap = await self._safe("snapshot", self.p.snapshot())
        if snap is None:
            return
        entity = snap.entity(kind, entity_id)
        if entity is None:
            print(f"{kind} {entity_id} is not on the hub")
            return
        if not entity.editable:
            print(f"{kind} {entity_id} was never fully read; run: refresh {'dev' if kind == 'device' else 'act'}={entity_id}")
            return
        try:
            edited = edit(snap.bundle)
        except (KeyError, ValueError) as err:
            print(f"cannot edit: {err}")
            return
        sync = self.p.sync_device if kind == "device" else self.p.sync_activity
        key = "device_id" if kind == "device" else "activity_id"
        result = await self._safe(
            "sync",
            sync(
                baseline=snap.bundle, edited=edited, snapshot_id=snap.snapshot_id,
                progress=lambda p: print(f"  {p.message}"), **{key: entity_id},
            ),
        )
        if result is None:
            return
        if result.ok:
            print(f"done ({result.completed_steps} step(s)); snapshot {str(result.snapshot_id)[:12]}")
        else:
            print(f"failed at {result.failed_at}: {result.message}")

    async def cmd_rename(self, args: str) -> None:
        from . import edits as _edits

        parts = args.split(None, 2)
        if len(parts) < 3 or parts[0] not in ("dev", "act"):
            print("usage: rename dev|act <id> <new name>")
            return
        entity_id = parse_int(parts[1])
        name = parts[2].strip()
        if parts[0] == "dev":
            await self._apply_edit("device", entity_id, lambda b: _edits.rename_device(b, entity_id, name))
        else:
            await self._apply_edit("activity", entity_id, lambda b: _edits.rename_activity(b, entity_id, name))

    async def cmd_bind(self, args: str) -> None:
        from . import edits as _edits

        parts = args.split()
        if len(parts) not in (4, 6):
            print("usage: bind <act> <button> <dev> <cmd> [<lp_dev> <lp_cmd>]")
            print("       button = code or name (POWER_ON, VOLUME_UP ...); lp = long press")
            return
        act = parse_int(parts[0])
        try:
            button = resolve_button_code(parts[1])
        except ValueError as err:
            print(err)
            return
        dev, cmd = parse_int(parts[2]), parse_int(parts[3])
        long_press = (parse_int(parts[4]), parse_int(parts[5])) if len(parts) == 6 else None
        await self._apply_edit(
            "activity", act,
            lambda b: _edits.bind_button(b, act, button, dev, cmd, long_press=long_press),
        )

    async def cmd_unbind(self, args: str) -> None:
        from . import edits as _edits

        parts = args.split()
        if len(parts) != 2:
            print("usage: unbind <act> <button>")
            return
        act = parse_int(parts[0])
        try:
            button = resolve_button_code(parts[1])
        except ValueError as err:
            print(err)
            return
        await self._apply_edit("activity", act, lambda b: _edits.clear_button(b, act, button))

    async def cmd_hubname(self, args: str) -> None:
        name = args.strip()
        if not name:
            print("usage: hubname <new name>")
            return
        try:
            await self.p.set_hub_name(name)
        except (RuntimeError, TimeoutError, ValueError) as err:
            print(f"[hubname] {err}")
            print("hub name unchanged")
            return
        info = await self._safe("hub_info", self.p.hub_info())
        if info is not None:
            print(f"hub is now named {info.name!r}")

    # ----- meta -------------------------------------------------------------

    async def cmd_help(self, _args: str) -> None:
        print("commands:")
        print("  status                         hub/app state, version, cached counts")
        print("  activities | devices           list catalogs (-> ids)")
        print("  commands <dev>                 device commands (-> command_id)")
        print("  buttons <ent>                  buttons + their device/command mapping")
        print("  macros <act> | favorites <act> activity detail (-> device_id/command_id)")
        print("  press <ent> <id-or-button>     send a command/button (alias: send)")
        print("  start <act> | stop <act>       switch activity power")
        print("  find                           find-my-remote")
        print("  testir <hex..>                 play an IR payload once (nothing saved)")
        print("  proxy on|off                   toggle pass-through")
        print("  backup [file] [devices=ID,..]  back up the hub (subset = devices only)")
        print("  restore <file> [devices=ID,..] [activities=ID,..] [erase]")
        print("                                 restore a bundle; optionally a subset / erase-first")
        print("  snapshot [out=FILE]            the cached configuration: every entity + its provenance")
        print("  apply <edited.json> baseline=<snapshot.json> [plan]")
        print("                                 write a whole edited snapshot document (plan = preview only)")
        print("  apply resume=<file.apply.json> continue a stopped or cancelled apply")
        print("  refresh [dev=ID|act=ID]        re-read one entity, or the whole hub (slow)")
        print("  rename dev|act <id> <name>     rename a device / activity")
        print("  bind <act> <button> <dev> <cmd> [<lp_dev> <lp_cmd>]   bind a button (+ long press)")
        print("  unbind <act> <button>          clear a button")
        print("  hubname <name>                 rename the hub")
        print("  quit                           exit")
        print("\nBrowse to get (entity_id, command_id); send with: press <entity_id> <command_id>.")
        print("Reads/sends need control mode (no app attached through the proxy).")

    async def cmd_quit(self, _args: str) -> None:
        self._stop = True

    # ----- REPL loop --------------------------------------------------------

    async def loop(self) -> None:
        await self.cmd_help("")
        while not self._stop:
            line = await _ainput(self.prompt)
            if line is None:
                break
            line = line.strip()
            if not line:
                continue
            cmd, _, rest = line.partition(" ")
            handler = self._commands.get(cmd)
            if handler is None:
                print(f"unknown command {cmd!r}; type 'help'")
                continue
            try:
                await handler(rest.strip())
            except Exception as err:  # keep the shell alive on command errors
                print(f"error: {err}")


# ----------------- subcommands -----------------


def _main_discover(argv: list[str]) -> None:
    """One-shot mDNS scan for physical hubs (and optionally proxies).

    Synchronous on purpose: ``discover_hubs`` spins up its own ``Zeroconf``
    and blocks, which does not work inside a running asyncio loop.
    """

    ap = argparse.ArgumentParser(
        prog="sofabaton discover",
        description="Discover Sofabaton hubs on the local network via mDNS",
    )
    ap.add_argument("--timeout", type=float, default=5.0, help="scan duration in seconds (default 5)")
    ap.add_argument("--include-proxies", action="store_true", help="also list proxy advertisements")
    ap.add_argument("--json", action="store_true", help="emit one JSON object per hub")
    args = ap.parse_args(argv)

    # One-shot scan: the blocking discover_hubs is fine here (nothing else
    # runs on the loop). Imported at call time so it stays monkeypatchable.
    from .discovery import discover_hubs

    hubs = discover_hubs(timeout=args.timeout, include_proxies=args.include_proxies)
    if args.json:
        import json as _json

        for hub in hubs:
            print(
                _json.dumps(
                    {
                        "host": hub.host,
                        "port": hub.port,
                        "name": hub.name,
                        "mac": hub.mac,
                        "hub_version": hub.hub_version,
                        "is_proxy": hub.is_proxy,
                        "service_type": hub.service_type,
                        "txt": hub.txt,
                    }
                )
            )
        return

    if not hubs:
        print(f"no hubs found in {args.timeout:g}s")
        return
    print(f"{'host':15}  {'port':5}  {'ver':4}  {'proxy':5}  name")
    for hub in hubs:
        print(
            f"{hub.host:15}  {hub.port:5d}  {hub.hub_version or '?':4}  "
            f"{'yes' if hub.is_proxy else 'no':5}  {hub.name}"
        )


async def _main_run(argv: list[str]) -> None:
    ap = argparse.ArgumentParser(
        prog="sofabaton run",
        description="Proxy a hub + interactive shell",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "ports: the proxy has two faces (see docs/networking.md).\n"
            "  hub-facing  --hub-ip / --hub-port (we CALL_ME the hub on UDP)\n"
            "              --hub-listen-port      (the hub connects back on TCP)\n"
            "  app-facing  --app-discovery-port   (the app finds + calls us on UDP)\n"
        ),
    )
    # The arguments you commonly touch.
    ap.add_argument("--hub-ip", help="the hub's IP; omit to auto-discover the first hub")
    ap.add_argument(
        "--hub-listen-port",
        type=int,
        default=8200,
        help="TCP port on THIS host the hub connects back to (change to avoid a port clash; default 8200)",
    )
    # Protocol-fixed ports you should rarely need to change.
    ap.add_argument(
        "--hub-port",
        type=int,
        default=8102,
        help="UDP port ON THE HUB we send CALL_ME to (protocol-fixed; default 8102)",
    )
    ap.add_argument(
        "--app-discovery-port",
        type=int,
        default=8102,
        help="UDP port on THIS host the app discovers/calls us on (keep 8102 for iOS; default 8102)",
    )
    ap.add_argument(
        "--hub-version",
        choices=["X1", "X1S", "X2"],
        help="hub model; confirmed from the connect banner, so only needed to force a guess before connect",
    )
    ap.add_argument("--mdns-txt", action="append", help="raw TXT kv pair, e.g. HVER=2 (repeatable)")
    ap.add_argument("--mdns-name", default="X1-HUB-PROXY")
    ap.add_argument("--disable-proxy", action="store_true", help="start with pass-through disabled")
    ap.add_argument(
        "--connect-timeout",
        type=float,
        default=40.0,
        help="seconds to wait for the hub to connect (the hub's CALL_ME cycle can take ~30s)",
    )
    ap.add_argument("--debug", action="store_true", help="verbose engine logging")
    ap.add_argument("--no-dump", dest="diag_dump", action="store_false")
    ap.add_argument("--no-parse", dest="diag_parse", action="store_false")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.WARNING,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    # The version is authoritative from the connect banner, so we do not
    # need mDNS to learn it. A scan is only needed to *pick* a hub when
    # --hub-ip is omitted; with an explicit hub we connect straight away.
    hub_version = args.hub_version  # explicit pre-connect guess (banner wins)

    if args.hub_ip:
        hub_ip = args.hub_ip
        mdns_instance = args.mdns_name
        mdns_txt = _kv_list_to_dict(args.mdns_txt)
        print(f"connecting to {hub_ip} (hub version is confirmed from the connect banner)")
    else:
        print("discovering hubs...")
        found = await async_discover_hubs(timeout=6.0)
        physical = [h for h in found if not h.is_proxy] or found
        if not physical:
            print("no hubs found; pass --hub-ip ADDRESS")
            return
        hub = physical[0]
        hub_ip = hub.host
        mdns_txt = dict(hub.txt)
        mdns_instance = hub.name
        if hub_version is None:
            hub_version = hub.hub_version
        print(f"using {hub.name} ({hub_version}) at {hub.host}")

    # Keep the advertisement's HVER consistent with any known version.
    if hub_version and "HVER" not in mdns_txt:
        mdns_txt["HVER"] = HVER_BY_HUB_VERSION[hub_version]

    proxy = AsyncXProxy(
        hub_ip=hub_ip,
        hub_port=args.hub_port,
        app_discovery_port=args.app_discovery_port,
        hub_listen_port=args.hub_listen_port,
        mdns_txt=mdns_txt,
        mdns_instance=mdns_instance,
        hub_version=hub_version,
        proxy_enabled=not args.disable_proxy,
        diag_dump=args.diag_dump,
        diag_parse=args.diag_parse,
    )

    async with proxy:
        print("proxy started; waiting for the hub...")
        if await proxy.wait_connected(timeout=args.connect_timeout):
            # Make the proxy discoverable so the official app can attach to
            # it. This reads the hub's connect banner (authoritative for the
            # version and name) and brings the mDNS advertisement up.
            await proxy.wait_until_discoverable(timeout=5.0)
            st = await proxy.status()
            mode = "control mode" if st.controllable else "observe mode — an app is attached"
            print(f"hub connected — version {st.hub_version} ({mode})")
        else:
            print("hub not connected yet (the shell still works; events appear when it connects)")
        try:
            await AsyncShell(proxy).loop()
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass


_SUBCOMMANDS = ("run", "discover")


def main(argv: list[str] | None = None) -> None:
    """Entry point. ``run`` (default) opens the shell; ``discover`` scans."""

    args = list(sys.argv[1:] if argv is None else argv)
    if args[:1] in (["-h"], ["--help"]):
        print(
            "usage: sofabaton [run|discover] ...\n\n"
            "subcommands:\n"
            "  run       proxy a hub + interactive shell (default; see 'run -h')\n"
            "  discover  scan the LAN for Sofabaton hubs (see 'discover -h')"
        )
        return
    command = "run"
    if args and args[0] in _SUBCOMMANDS:
        command = args.pop(0)
    try:
        if command == "discover":
            _main_discover(args)  # sync: blocking zeroconf, no event loop
        else:
            asyncio.run(_main_run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
