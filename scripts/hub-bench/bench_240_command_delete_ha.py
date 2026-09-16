"""Live validation of command removal from the Hub tab's device editor,
THROUGH the deployed HA integration (PR #287 follow-up, 2026-09-16).

The editor drops one command from a device and stages the hub's own
reference cascade in its working bundle (favorites, binding legs, macro
steps in every activity; the device's own bindings, power rows, user-macro
steps and inputs-page entry). The device sync plan previews it, the scope
guard accepts exactly that cascade, and the plan ends with one
``command_delete`` (family 0x10). This bench sends what the editor sends
and then reads the hub back to confirm:

  - the command is gone and every other command on the device survived,
  - the hub cascaded every activity reference (no dangling favorite /
    binding leg / macro step), and touched nothing else in those
    activities,
  - the device's own rows that referenced the command are gone,
  - the readback (blobs/fetch) agrees with the structural bundle.

Target selection: ``--device N --command N`` names the command; without
it the bench picks the command with the richest reference profile on an
unprotected device (never the Wifi Events device, never a managed Wifi
Device). On an X2 the ONLY allowed device is id 1 ("MQTT test") — any
other device is refused, flag or not.

The HA entries must be ENABLED (HA owns the hub connection). Reads
scripts/.ha-config.json + scripts/.ha-token like bench_181.

Usage:
    python bench_240_command_delete_ha.py <entry_prefix> <tag> [--device N --command N] [--dry-run]

Results: out/<tag>-command-delete-ha.json; exit 1 when any check failed.
"""

from __future__ import annotations

import asyncio
import copy
import json
import ssl
import sys
import time
from pathlib import Path
from typing import Any

import websockets

BENCH_DIR = Path(__file__).resolve().parent / "out"
BENCH_DIR.mkdir(exist_ok=True)
SCRIPTS = Path(__file__).resolve().parents[1]
CONFIG = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
TOKEN = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
BASE = CONFIG["base_url"]
WS_URL = BASE.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/api/websocket"

PREFIX = sys.argv[1]
TAG = sys.argv[2]
DRY_RUN = "--dry-run" in sys.argv


def _arg(flag: str) -> int | None:
    if flag in sys.argv:
        return int(sys.argv[sys.argv.index(flag) + 1])
    return None


WANT_DEVICE = _arg("--device")
WANT_COMMAND = _arg("--command")

# The one device Marcel released on the X2 (2026-09-16). Hard rule.
X2_ALLOWED_DEVICES = {1}

POWER_MACROS = {198, 199}
DELAY = 0xFF

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""))


class HaWs:
    def __init__(self) -> None:
        self._id = 0
        self.ws = None

    async def __aenter__(self):
        kwargs = {}
        if WS_URL.startswith("wss://"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            kwargs["ssl"] = ctx
        self.ws = await websockets.connect(WS_URL, max_size=64 * 1024 * 1024, **kwargs)
        hello = json.loads(await self.ws.recv())
        assert hello["type"] == "auth_required", hello
        await self.ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        ok = json.loads(await self.ws.recv())
        assert ok["type"] == "auth_ok", ok
        return self

    async def __aexit__(self, *exc):
        await self.ws.close()

    async def call(self, payload: dict, timeout: float = 180.0) -> tuple[dict, float]:
        self._id += 1
        msg_id = self._id
        t0 = time.time()
        await self.ws.send(json.dumps({"id": msg_id, **payload}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=max(1.0, deadline - time.time())))
            if raw.get("type") == "result" and raw.get("id") == msg_id:
                return raw, time.time() - t0
        raise TimeoutError(f"no result for id={msg_id}")


async def pick(ha: HaWs, prefix: str) -> dict:
    state, _ = await ha.call({"type": "sofabaton_x1s/control_panel/state"})
    assert state.get("success"), state
    for hub in (state.get("result") or {}).get("hubs") or []:
        if str(hub.get("entry_id") or "").startswith(prefix) or str(hub.get("name") or "").startswith(prefix):
            return hub
    raise SystemExit(f"no hub matching {prefix!r}")


async def hub_line(ha: HaWs, hub: dict) -> str:
    states, _ = await ha.call({"type": "get_states"})
    for st in states.get("result") or []:
        attrs = st.get("attributes") or {}
        if str(st.get("entity_id", "")).startswith("remote.") and attrs.get("entry_id") == hub["entry_id"]:
            if attrs.get("hub_version"):
                return str(attrs["hub_version"]).upper()
    return str(hub.get("version") or "").upper()


async def wait_op(ha: HaWs, entry_id: str, kind: str, timeout: float = 300.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        state, _ = await ha.call({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = (state.get("result") or {}).get(kind) or {}
        msg = f"[{op.get('completed_steps')}/{op.get('total_steps')}] {op.get('phase')}: {op.get('message')}"
        if msg != last:
            print("     ", msg)
            last = msg
        if op.get("status") in {"success", "failed", "error"}:
            return op
        await asyncio.sleep(1.0)
    raise TimeoutError(f"{kind} did not finish within {timeout}s")


async def structural_bundle(ha: HaWs, entry_id: str) -> dict:
    res, _ = await ha.call({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id})
    assert res.get("success"), res
    bundle = (res.get("result") or {}).get("bundle")
    if not bundle:
        raise SystemExit("no structural bundle: enable the persistent cache and refresh it first")
    return bundle


# ── bundle helpers ─────────────────────────────────────────────────────


def _i(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def device_row(bundle: dict, device_id: int) -> dict | None:
    for row in bundle.get("devices") or []:
        if _i((row.get("device") or {}).get("device_id")) == device_id:
            return row
    return None


def is_delay(step: dict) -> bool:
    return _i(step.get("device_id")) == DELAY or _i(step.get("command_id")) == DELAY


def drop_steps(steps: list, match) -> list:
    out: list = []
    index = 0
    while index < len(steps):
        step = steps[index]
        if match(step):
            index += 1
            while index < len(steps) and is_delay(steps[index]):
                index += 1
            continue
        out.append(step)
        index += 1
    return out


def reference_profile(bundle: dict, device_id: int, command_id: int) -> dict[str, int]:
    """Where (device_id, command_id) is referenced — mirrors bundleDeleteImpact
    plus the inputs page."""
    prof = {"act_favorites": 0, "act_binding_short": 0, "act_binding_long": 0, "act_macro_steps": 0,
            "dev_binding_short": 0, "dev_binding_long": 0, "dev_power_steps": 0, "dev_macro_steps": 0, "inputs": 0}
    for act in bundle.get("activities") or []:
        for slot in act.get("favorite_slots") or []:
            if _i(slot.get("device_id")) == device_id and _i(slot.get("command_id")) == command_id:
                prof["act_favorites"] += 1
        for row in act.get("button_bindings") or []:
            if _i(row.get("device_id")) == device_id and _i(row.get("command_id")) == command_id:
                prof["act_binding_short"] += 1
            elif _i(row.get("long_press_device_id")) == device_id and _i(row.get("long_press_command_id")) == command_id:
                prof["act_binding_long"] += 1
        for macro in act.get("macros") or []:
            for step in macro.get("steps") or []:
                if _i(step.get("device_id")) == device_id and _i(step.get("command_id")) == command_id:
                    prof["act_macro_steps"] += 1
    dev = device_row(bundle, device_id) or {}
    for row in dev.get("button_bindings") or []:
        if _i(row.get("command_id")) == command_id:
            prof["dev_binding_short"] += 1
        elif _i(row.get("long_press_command_id")) == command_id:
            prof["dev_binding_long"] += 1
    for macro in dev.get("macros") or []:
        for step in macro.get("steps") or []:
            if not is_delay(step) and _i(step.get("command_id")) == command_id:
                key = "dev_power_steps" if _i(macro.get("button_id")) in POWER_MACROS else "dev_macro_steps"
                prof[key] += 1
    for entry in ((dev.get("input_record") or {}).get("entries") or []):
        if _i(entry.get("command_id")) == command_id:
            prof["inputs"] += 1
    return prof


def editor_cascade(bundle: dict, device_id: int, command_id: int) -> dict:
    """What deleteBundleDeviceCommand(..., {reconcileMembership: false}) produces."""
    out = copy.deepcopy(bundle)
    dev = device_row(out, device_id)
    assert dev is not None
    dev["commands"] = [c for c in dev.get("commands") or [] if _i(c.get("command_id")) != command_id]
    bindings = []
    for row in dev.get("button_bindings") or []:
        if _i(row.get("command_id")) == command_id:
            continue
        if _i(row.get("long_press_command_id")) == command_id:
            row = {k: v for k, v in row.items() if k not in ("long_press_device_id", "long_press_command_id")}
        bindings.append(row)
    dev["button_bindings"] = bindings
    dev["macros"] = [
        {**m, "steps": drop_steps(list(m.get("steps") or []), lambda s: not is_delay(s) and _i(s.get("command_id")) == command_id)}
        for m in dev.get("macros") or []
    ]
    record = dev.get("input_record")
    if isinstance(record, dict) and record.get("entries"):
        record["entries"] = [e for e in record["entries"] if _i(e.get("command_id")) != command_id]
    for act in out.get("activities") or []:
        act["favorite_slots"] = [
            s for s in act.get("favorite_slots") or []
            if not (_i(s.get("device_id")) == device_id and _i(s.get("command_id")) == command_id)
        ]
        act["macros"] = [
            {**m, "steps": drop_steps(list(m.get("steps") or []),
                                      lambda s: _i(s.get("device_id")) == device_id and _i(s.get("command_id")) == command_id)}
            for m in act.get("macros") or []
        ]
        rows = []
        for row in act.get("button_bindings") or []:
            if _i(row.get("device_id")) == device_id and _i(row.get("command_id")) == command_id:
                continue
            if _i(row.get("long_press_device_id")) == device_id and _i(row.get("long_press_command_id")) == command_id:
                row = {k: v for k, v in row.items() if k not in ("long_press_device_id", "long_press_command_id")}
            rows.append(row)
        act["button_bindings"] = rows
    return out


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def strip_volatile_activity(act: dict) -> dict:
    out = {k: v for k, v in act.items() if k not in ("captured_at", "fetched_at", "complete", "payload_profile", "editable")}
    # The hub removes a user macro left with no steps; compare with those
    # dropped on both sides so that cascade counts as expected.
    out["macros"] = [
        m for m in out.get("macros") or []
        if (m.get("steps") or []) or _i(m.get("button_id")) in POWER_MACROS
    ]
    return out


def protected_device(row: dict) -> str | None:
    brand = str((row.get("device") or {}).get("brand") or "")
    if brand.startswith("m3-haevents"):
        return "Wifi Events device"
    if brand.startswith("m3-"):
        return "managed Wifi Device"
    return None


def choose_target(bundle: dict, line: str) -> tuple[int, int, dict]:
    candidates: list[tuple[int, int, int, dict]] = []
    for row in bundle.get("devices") or []:
        device_id = _i((row.get("device") or {}).get("device_id"))
        if line == "X2" and device_id not in X2_ALLOWED_DEVICES:
            continue
        if protected_device(row):
            continue
        commands = row.get("commands") or []
        if len(commands) < 2:
            continue
        for cmd in commands:
            command_id = _i(cmd.get("command_id"))
            prof = reference_profile(bundle, device_id, command_id)
            score = sum(1 for v in prof.values() if v) * 10 + sum(prof.values())
            candidates.append((score, device_id, command_id, prof))
    if not candidates:
        raise SystemExit("no candidate command (need an unprotected device with 2+ commands)")
    candidates.sort(key=lambda c: (-c[0], c[1], c[2]))
    print("  top candidates:")
    for score, device_id, command_id, prof in candidates[:5]:
        used = {k: v for k, v in prof.items() if v}
        print(f"    dev={device_id} cmd={command_id} score={score} refs={used}")
    _score, device_id, command_id, prof = candidates[0]
    return device_id, command_id, prof


async def main() -> int:
    async with HaWs() as ha:
        hub = await pick(ha, PREFIX)
        entry_id = hub["entry_id"]
        line = await hub_line(ha, hub)
        print(f"hub {hub.get('name')} entry={entry_id[:8]} line={line} connected={hub.get('hub_connected')} devices={hub.get('device_count')}")
        check("hub connected", bool(hub.get("hub_connected")), "")

        before = await structural_bundle(ha, entry_id)
        if WANT_DEVICE is not None and WANT_COMMAND is not None:
            device_id, command_id = WANT_DEVICE, WANT_COMMAND
            prof = reference_profile(before, device_id, command_id)
        else:
            device_id, command_id, prof = choose_target(before, line)
        row = device_row(before, device_id)
        if row is None:
            raise SystemExit(f"device {device_id} is not in the bundle")
        if line == "X2" and device_id not in X2_ALLOWED_DEVICES:
            raise SystemExit(f"X2: device {device_id} is NOT released for this bench (only {sorted(X2_ALLOWED_DEVICES)})")
        guard = protected_device(row)
        if guard:
            raise SystemExit(f"device {device_id} is a {guard}; pick another")
        names = {_i(c.get("command_id")): str(c.get("name") or "") for c in row.get("commands") or []}
        if command_id not in names:
            raise SystemExit(f"command {command_id} is not on device {device_id}: {sorted(names)}")
        dev_block = row.get("device") or {}
        print(f"\ntarget: device {device_id} '{dev_block.get('name')}' class={dev_block.get('device_class')} "
              f"command {command_id} '{names[command_id]}'")
        print(f"  reference profile: {json.dumps(prof)}")
        ids_before = sorted(names)
        results: dict[str, Any] = {
            "hub": {"name": hub.get("name"), "entry_id": entry_id, "line": line},
            "target": {"device_id": device_id, "command_id": command_id, "name": names[command_id],
                       "device_name": dev_block.get("name"), "device_class": dev_block.get("device_class")},
            "profile_before": prof, "commands_before": ids_before,
        }

        edited = editor_cascade(before, device_id, command_id)

        res, dt = await ha.call({"type": "sofabaton_x1s/device/sync_plan", "entry_id": entry_id, "device_id": device_id,
                                 "baseline": before, "edited": edited}, timeout=120)
        check("device/sync_plan accepted the editor cascade", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")
        if not res.get("success"):
            results["plan_error"] = res.get("error")
            return finish(results)
        kinds = [s["kind"] for s in (res.get("result") or {}).get("steps") or []]
        results["plan"] = (res.get("result") or {}).get("steps")
        print(f"  plan: {kinds}")
        check("plan has exactly one command_delete", kinds.count("command_delete") == 1, str(kinds))
        check("command_delete is the last step", bool(kinds) and kinds[-1] == "command_delete", str(kinds))
        if prof["inputs"]:
            check("inputs page rewrite planned before the delete", "inputs_write" in kinds, str(kinds))
        if prof["dev_power_steps"] or prof["dev_macro_steps"]:
            check("device macro rewrite planned before the delete", any(k.startswith("macro") for k in kinds), str(kinds))
        if prof["dev_binding_short"] or prof["dev_binding_long"]:
            check("device binding change planned before the delete", any(k.startswith("binding") for k in kinds), str(kinds))

        if DRY_RUN:
            print("\n--dry-run: not syncing")
            return finish(results)

        res, dt = await ha.call({"type": "sofabaton_x1s/device/sync", "entry_id": entry_id, "device_id": device_id,
                                 "baseline": before, "edited": edited}, timeout=240)
        check("device/sync accepted", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")
        if not res.get("success"):
            results["sync_error"] = res.get("error")
            return finish(results)
        op = await wait_op(ha, entry_id, "device_sync")
        check("device_sync finished", op.get("status") == "success", f"{op.get('status')} {op.get('message')}")
        results["sync"] = {k: op.get(k) for k in ("status", "message", "completed_steps", "total_steps", "failed_at")}
        if op.get("status") != "success":
            return finish(results)

        # ── readback ──
        after = await structural_bundle(ha, entry_id)
        arow = device_row(after, device_id) or {}
        ids_after = sorted(_i(c.get("command_id")) for c in arow.get("commands") or [])
        results["commands_after"] = ids_after
        check("command gone from the device", command_id not in ids_after, str(ids_after))
        check("every other command survived", ids_after == [i for i in ids_before if i != command_id], f"before={ids_before} after={ids_after}")
        prof_after = reference_profile(after, device_id, command_id)
        results["profile_after"] = prof_after
        # The inputs page is the one reference the live path cannot rewrite:
        # ``inputs_write`` is a restore-only (family 0x46) primitive and the
        # live step is a logged no-op, so the hub keeps the entry (observed
        # X1 2026-09-16, Avstar input 4). The editor still prunes it in the
        # working bundle (the validator insists), and the post-sync rebase
        # brings the hub's entry back. Reported, not failed.
        cascaded = {k: v for k, v in prof_after.items() if k != "inputs"}
        check("no favorite / binding / macro reference to the command survives", not any(cascaded.values()), json.dumps(cascaded))
        if prof["inputs"]:
            check("inputs-page entry after delete (known: hub keeps it, live inputs_write is a no-op)", True,
                  f"entries referencing the command: {prof_after['inputs']}")

        # Every activity: identical to the baseline with the cascade stripped
        # (what the editor staged), i.e. the hub touched nothing else.
        acts_before = {_i((a.get("device") or {}).get("device_id")): a for a in edited.get("activities") or []}
        acts_after = {_i((a.get("device") or {}).get("device_id")): a for a in after.get("activities") or []}
        check("same activity set", set(acts_before) == set(acts_after), f"{sorted(acts_before)} vs {sorted(acts_after)}")
        diffs = []
        for act_id, staged in acts_before.items():
            got = acts_after.get(act_id)
            if got is None:
                continue
            if canonical(strip_volatile_activity(staged)) != canonical(strip_volatile_activity(got)):
                diffs.append(act_id)
                results.setdefault("activity_diffs", {})[str(act_id)] = {"staged": strip_volatile_activity(staged), "hub": strip_volatile_activity(got)}
        check("activities read back exactly as staged", not diffs, f"differs: {diffs}")

        # Device rows: what the editor staged is what the hub holds.
        srow = device_row(edited, device_id) or {}
        brow = device_row(before, device_id) or {}
        for key in ("button_bindings", "macros", "input_record"):
            # input_record: expect the BASELINE page back (see above).
            staged_v = (brow if key == "input_record" else srow).get(key)
            got_v = arow.get(key)
            if key == "macros":
                staged_v = [m for m in staged_v or [] if (m.get("steps") or []) or _i(m.get("button_id")) in POWER_MACROS]
                got_v = [m for m in got_v or [] if (m.get("steps") or []) or _i(m.get("button_id")) in POWER_MACROS]
            same = canonical(staged_v) == canonical(got_v)
            if not same:
                results.setdefault("device_diffs", {})[key] = {"staged": staged_v, "hub": got_v}
            check(f"device {key} read back as {'on the baseline' if key == 'input_record' else 'staged'}", same, "" if same else "see json")

        res, _ = await ha.call({"type": "sofabaton_x1s/blobs/fetch", "entry_id": entry_id, "device_id": device_id}, timeout=120)
        check("blobs/fetch after delete", res.get("success") is True, str(res.get("error")))
        if res.get("success"):
            rows = (res.get("result") or {}).get("commands") or []
            got = sorted(_i(r.get("command_id")) for r in rows)
            check("readback command ids match the bundle", got == ids_after, f"readback={got}")
        return finish(results)


def finish(results: dict) -> int:
    failed = [c for c in checks if not c[1]]
    results["checks"] = checks
    (BENCH_DIR / f"{TAG}-command-delete-ha.json").write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
