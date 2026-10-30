"""bench_334: activity, device and Wifi Device icons (and X2 colors) through
the server (docs/internal/icon-color-editing-plan.md, E5 S4).

Drives a real server process (this checkout's sofabaton-x-server, the
library installed in the venv) over HTTP against one real hub, on scratch
entities it creates and deletes; nothing else is written. Every check
re-reads the entity from the hub first (POST /snapshot/refresh).

  1. POST /activities with an icon (and X2 color): the hub stores it;
  2. PUT /activities/{id} changing the icon (and color): the hub stores it;
     a rename-only PUT keeps them;
  3. POST /devices with an icon (and color), then PUT /devices/{id}
     changing them;
  4. an icon or color the hub line lacks is a 422 before any job;
  5. POST /wifi-devices with an icon (and color): the deploy's first update
     writes it; PUT /wifi-devices/{key} changing it; a later update that
     names none (a slot rename) keeps it;
  6. cleanup: delete the Wifi Device, the device and the activity.

Usage (the hub's HA entry must be disabled first: scripts/hub-bench/ha_entry.py):
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_334_server_icon_color.py <x1|x1s|x2>

Writes out/bench_334_<hub>.json and the server log under out/logs/.
"""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

import bench_common  # noqa: F401  (out/ dirs, logging setup)

REPO = Path(__file__).resolve().parents[2]
PORT = 8481
BASE = f"http://127.0.0.1:{PORT}/api/v1"
HOSTS = {"x1s": "192.168.2.151", "x1": "192.168.2.105", "x2": "192.168.2.123"}
# (create icon, create color), (edited icon, edited color) per entity kind;
# X1 ids are its own numbering; colors on the X2 only.
PLAN = {
    "x1s": {"activity": ((9, None), (4, None)), "device": ((11, None), (6, None)), "wifi": ((13, None), (2, None)),
            "bad": [{"icon": 17}, {"color_id": 3}]},
    "x1": {"activity": ((22, None), (8, None)), "device": ((23, None), (24, None)), "wifi": ((20, None), (21, None)),
           "bad": [{"icon": 26}, {"color_id": 3}]},
    "x2": {"activity": ((34, 3), (16, 2)), "device": ((25, 9), (41, 11)), "wifi": ((7, 5), (30, 8)),
           "bad": [{"icon": 46}, {"color_id": 13}]},
}
HUB = sys.argv[1].lower() if len(sys.argv) > 1 else ""
if HUB not in HOSTS:
    raise SystemExit("usage: bench_334_server_icon_color.py <x1|x1s|x2>")
ACTIVITY = "Bench Icon S"
DEVICE = "Bench Icon SD"
WIFI = "Bench Pencil S"

REPORT: dict = {"hub": HUB, "checks": [], "steps": []}
T0 = time.monotonic()


def step(label: str, **fields) -> None:
    row = {"step": label, "t": round(time.monotonic() - T0, 1), **fields}
    REPORT["steps"].append(row)
    print(f"[{row['t']:6.1f}s] {label} " + ", ".join(f"{k}={v}" for k, v in fields.items()), flush=True)


def check(label: str, ok: bool, detail: str = "") -> bool:
    REPORT["checks"].append({"label": label, "ok": bool(ok), "detail": detail})
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""), flush=True)
    return bool(ok)


def wait_for(desc: str, pred, timeout: float, every: float = 0.5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            value = pred()
        except Exception:  # noqa: BLE001
            value = None
        if value:
            return value
        time.sleep(every)
    check(f"{desc} within {timeout:.0f}s", False)
    return None


class Server:
    def __init__(self) -> None:
        self.data_dir = bench_common.BENCH_DIR / f"bench_334_{HUB}_data"
        self.log = open(bench_common.LOG_DIR / f"bench_334_{HUB}-server.log", "a", encoding="utf-8")
        self.proc: subprocess.Popen | None = None

    def start(self) -> None:
        if self.data_dir.exists():
            for f in self.data_dir.iterdir():
                f.unlink()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        env = dict(os.environ, PYTHONPATH=str(REPO / "sofabaton-x-server" / "src"), PYTHONUNBUFFERED="1")
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "sofabaton_server.cli", "--port", str(PORT), "--data-dir", str(self.data_dir),
             "--log-level", "info"],
            env=env, stdout=self.log, stderr=subprocess.STDOUT, cwd=str(REPO),
        )

    def stop(self) -> None:
        if self.proc is None:
            return
        self.proc.terminate()
        try:
            self.proc.wait(20)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.proc = None


def job(http: httpx.Client, hub: str, r: httpx.Response, what: str, timeout: float = 600.0) -> dict | None:
    if r.status_code != 202:
        check(f"{what}: accepted", False, f"{r.status_code} {r.text[:300]}")
        return None
    job_id = r.json()["job_id"]
    done = wait_for(f"job {what}", lambda: (lambda j: j if j["status"] in ("done", "failed", "cancelled") else None)(
        http.get(f"/hubs/{hub}/jobs/{job_id}").json()), timeout)
    if done is None:
        return None
    check(f"{what}: done", done["status"] == "done", json.dumps(done.get("error"))[:300] if done["status"] != "done" else "")
    return done if done["status"] == "done" else None


def entity(http: httpx.Client, hub: str, kind: str, entity_id: int, *, reread: bool = True) -> tuple[dict | None, str]:
    """The entity as the hub has it (a fresh read first), and the snapshot ETag."""

    if reread:
        body = {"device_id": entity_id} if kind == "device" else {"activity_id": entity_id}
        job(http, hub, http.post(f"/hubs/{hub}/snapshot/refresh", json=body), f"refresh {kind} {entity_id}")
    r = http.get(f"/hubs/{hub}/snapshot")
    doc = r.json()
    rows = doc["devices"] if kind == "device" else doc["activities"]
    return next((e for e in rows if e["device"]["device_id"] == entity_id), None), r.headers.get("etag", "")


def expect(label: str, row: dict | None, icon: int, color: int | None) -> None:
    dev = (row or {}).get("device") or {}
    check(f"{label}: icon {icon}", dev.get("icon") == icon, f"got {dev.get('icon')}")
    if color is not None:
        check(f"{label}: color {color}", dev.get("color_id") == color, f"got {dev.get('color_id')}")


def appearance(icon: int, color: int | None) -> dict:
    return {"icon": icon, **({"color_id": color} if color is not None else {})}


def cleanup(http: httpx.Client, hub: str) -> None:
    # Activities first: the X1S dropped an empty scratch activity on its own
    # during a device delete (bench 2026-10-27), so delete it while it is ours.
    for a in http.get(f"/hubs/{hub}/activities").json():
        if a["name"] in (ACTIVITY, f"{ACTIVITY} 2", "Never"):
            job(http, hub, http.delete(f"/hubs/{hub}/activities/{a['activity_id']}"), f"remove activity {a['activity_id']}")
    for row in http.get(f"/hubs/{hub}/wifi-devices").json().get("devices") or []:
        if row["spec"].get("name") == WIFI:
            job(http, hub, http.delete(f"/hubs/{hub}/wifi-devices/{row['key']}", params={"force": "true"}), "remove the Wifi Device")
    for d in http.get(f"/hubs/{hub}/devices").json():
        if d["name"] in (DEVICE, WIFI):
            job(http, hub, http.delete(f"/hubs/{hub}/devices/{d['device_id']}"), f"remove device {d['device_id']}")


def run(http: httpx.Client) -> None:
    plan = PLAN[HUB]
    r = http.post("/hubs", json={"host": HOSTS[HUB]})
    check("register the hub", r.status_code in (200, 201), r.text[:200])
    ready = wait_for("catalog_ready", lambda: (lambda rows: rows if rows and (rows[0].get("status") or {}).get("catalog_ready") else None)(
        http.get("/hubs").json()), 240)
    if not ready:
        return
    hub = ready[0]["hub_id"]
    step("registered", hub=hub, version=(ready[0].get("status") or {}).get("hub_version"))
    cleanup(http, hub)

    try:
        # 1. activity: create with an icon
        (a_icon, a_color), (a_icon2, a_color2) = plan["activity"]
        done = job(http, hub, http.post(f"/hubs/{hub}/activities", json={"name": ACTIVITY, **appearance(a_icon, a_color)}), "add activity")
        act = int((done or {}).get("result", {}).get("activity_id") or 0)
        if not check("activity created", bool(act)):
            return
        row, etag = entity(http, hub, "activity", act)
        expect("created activity", row, a_icon, a_color)

        # 2. the editor's PUT: icon (and color), then a rename that keeps them
        edited = copy.deepcopy(row)
        edited["device"].update(appearance(a_icon2, a_color2))
        job(http, hub, http.put(f"/hubs/{hub}/activities/{act}", json=edited, headers={"If-Match": etag}), "edit the activity's icon")
        row, etag = entity(http, hub, "activity", act)
        expect("activity after the icon edit", row, a_icon2, a_color2)
        edited = copy.deepcopy(row)
        edited["device"]["name"] = f"{ACTIVITY} 2"
        job(http, hub, http.put(f"/hubs/{hub}/activities/{act}", json=edited, headers={"If-Match": etag}), "rename the activity")
        row, _ = entity(http, hub, "activity", act)
        check("activity renamed", (row or {}).get("device", {}).get("name") == f"{ACTIVITY} 2")
        expect("activity after the rename", row, a_icon2, a_color2)

        # 3. device: create with an icon, then the editor's PUT
        (d_icon, d_color), (d_icon2, d_color2) = plan["device"]
        done = job(http, hub, http.post(f"/hubs/{hub}/devices", json={"name": DEVICE, "device_class": "ir", **appearance(d_icon, d_color)}), "add device")
        dev = int((done or {}).get("result", {}).get("device_id") or 0)
        if not check("device created", bool(dev)):
            return
        row, etag = entity(http, hub, "device", dev)
        expect("created device", row, d_icon, d_color)
        edited = copy.deepcopy(row)
        edited["device"].update(appearance(d_icon2, d_color2))
        job(http, hub, http.put(f"/hubs/{hub}/devices/{dev}", json=edited, headers={"If-Match": etag}), "edit the device's icon")
        row, etag = entity(http, hub, "device", dev)
        expect("device after the icon edit", row, d_icon2, d_color2)
        catalog = next((d for d in http.get(f"/hubs/{hub}/devices").json() if d["device_id"] == dev), {})
        check("the catalog row carries the icon", catalog.get("icon") == d_icon2, str(catalog))

        # 4. what the hub line lacks is refused up front
        for bad in plan["bad"]:
            r = http.post(f"/hubs/{hub}/activities", json={"name": "Never", **bad})
            check(f"create with {bad} refused", r.status_code == 422, f"{r.status_code} {r.text[:160]}")
            broken = copy.deepcopy(row)
            broken["device"].update(bad)
            r = http.put(f"/hubs/{hub}/devices/{dev}", json=broken, headers={"If-Match": etag})
            check(f"edit with {bad} refused", r.status_code == 422, f"{r.status_code} {r.text[:160]}")

        # 5. a Wifi Device: the deploy writes the pick, an update changes it, a later one keeps it
        (w_icon, w_color), (w_icon2, w_color2) = plan["wifi"]
        spec = {"name": WIFI, "slots": [{"label": "BP One"}, {"label": "BP Two"}]}
        done = job(http, hub, http.post(f"/hubs/{hub}/wifi-devices", json={**spec, **appearance(w_icon, w_color), "transport": "http"}),
                   "deploy the Wifi Device", timeout=900)
        result = (done or {}).get("result") or {}
        key, wdev = result.get("key"), int(result.get("device_id") or 0)
        if not check("Wifi Device deployed", bool(key and wdev), str(result)[:200]):
            return
        row, _ = entity(http, hub, "device", wdev)
        expect("deployed Wifi Device", row, w_icon, w_color)
        done = job(http, hub, http.put(f"/hubs/{hub}/wifi-devices/{key}", json={**spec, **appearance(w_icon2, w_color2)}),
                   "update the Wifi Device's icon", timeout=900)
        check("the server keeps the picked icon", ((done or {}).get("result") or {}).get("spec", {}).get("icon") == w_icon2)
        row, _ = entity(http, hub, "device", wdev)
        expect("Wifi Device after the icon update", row, w_icon2, w_color2)
        renamed = {"name": WIFI, "slots": [{"label": "BP One"}, {"label": "BP Two B"}]}
        job(http, hub, http.put(f"/hubs/{hub}/wifi-devices/{key}", json={**renamed, **appearance(w_icon2, w_color2)}),
            "update a slot (same icon)", timeout=900)
        job(http, hub, http.put(f"/hubs/{hub}/wifi-devices/{key}", json=renamed), "update naming no icon", timeout=900)
        row, _ = entity(http, hub, "device", wdev)
        expect("Wifi Device after updates that keep it", row, w_icon2, w_color2)
    finally:
        cleanup(http, hub)
        left = [d["name"] for d in http.get(f"/hubs/{hub}/devices").json() if d["name"] in (DEVICE, WIFI)]
        left += [a["name"] for a in http.get(f"/hubs/{hub}/activities").json() if a["name"].startswith(ACTIVITY)]
        check("scratch entities removed", not left, str(left))
        r = http.delete(f"/hubs/{hub}")
        step("hub removed from the server", status=r.status_code)


def main() -> int:
    server = Server()
    server.start()
    try:
        with httpx.Client(base_url=BASE, timeout=60.0) as http:
            if not wait_for("server up", lambda: http.get("/hubs").status_code == 200, 60):
                return 1
            run(http)
    finally:
        server.stop()
        failed = [c for c in REPORT["checks"] if not c["ok"]]
        out = bench_common.BENCH_DIR / f"bench_334_{HUB}.json"
        out.write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
        print(f"\n{len(REPORT['checks']) - len(failed)}/{len(REPORT['checks'])} checks passed; report {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
