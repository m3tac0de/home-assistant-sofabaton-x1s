"""bench_335: does a hub cap its Wifi Devices? (the X2 refused a sixth on 2026-10-27).

On an X2 that already held five Wifi Devices, an HTTP Wifi Device create
through the server got its head acked and then ``define-ip-command[01]``
refused with STATUS_ACK 0x04; three days earlier the same hub, holding
three, took a fourth. This probe adds scratch Wifi Devices through a real
server until the hub holds six (or one is refused), on an IDLE hub (no
other write first), then deletes every scratch device it made.

Usage (expendable hubs only; the hub's HA entry must be disabled first):
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_335_wifi_cap_probe.py <x1s|x1> [target]

``target`` is the Wifi Device count to reach (default 6). Writes
out/bench_335_<hub>.json and the server log under out/logs/.
"""

from __future__ import annotations

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
HOSTS = {"x1s": "192.168.2.151", "x1": "192.168.2.105"}
HUB = sys.argv[1].lower() if len(sys.argv) > 1 else ""
if HUB not in HOSTS:
    raise SystemExit("usage: bench_335_wifi_cap_probe.py <x1s|x1> [target]")
TARGET = int(sys.argv[2]) if len(sys.argv) > 2 else 6
PREFIX = "Bench Cap "
WIFI_CLASSES = {"wifi_ip", "wifi_mqtt", "wifi_roku", "wifi_hue", "wifi_sonos"}
REPORT: dict = {"hub": HUB, "rows": []}


def note(**row) -> None:
    REPORT["rows"].append(row)
    print(json.dumps(row), flush=True)


def wait_job(http: httpx.Client, hub: str, r: httpx.Response, timeout: float = 900.0) -> dict:
    if r.status_code != 202:
        return {"status": "refused", "http": r.status_code, "body": r.text[:300]}
    job_id = r.json()["job_id"]
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = http.get(f"/hubs/{hub}/jobs/{job_id}").json()
        if job["status"] in ("done", "failed", "cancelled"):
            return job
        time.sleep(0.5)
    return {"status": "timeout"}


def wifi_rows(http: httpx.Client, hub: str) -> list[dict]:
    return [d for d in http.get(f"/hubs/{hub}/devices").json() if d.get("device_class") in WIFI_CLASSES]


def main() -> int:
    data_dir = bench_common.BENCH_DIR / f"bench_335_{HUB}_data"
    if data_dir.exists():
        for f in data_dir.iterdir():
            f.unlink()
    data_dir.mkdir(parents=True, exist_ok=True)
    log = open(bench_common.LOG_DIR / f"bench_335_{HUB}-server.log", "a", encoding="utf-8")
    env = dict(os.environ, PYTHONPATH=str(REPO / "sofabaton-x-server" / "src"), PYTHONUNBUFFERED="1")
    proc = subprocess.Popen([sys.executable, "-m", "sofabaton_server.cli", "--port", str(PORT), "--data-dir", str(data_dir),
                             "--log-level", "debug"], env=env, stdout=log, stderr=subprocess.STDOUT, cwd=str(REPO))
    made: list[str] = []
    try:
        with httpx.Client(base_url=BASE, timeout=60.0) as http:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                try:
                    if http.get("/hubs").status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.5)
            http.post("/hubs", json={"host": HOSTS[HUB]})
            deadline = time.monotonic() + 240
            hub = None
            while time.monotonic() < deadline:
                rows = http.get("/hubs").json()
                if rows and (rows[0].get("status") or {}).get("catalog_ready"):
                    hub = rows[0]["hub_id"]
                    break
                time.sleep(0.5)
            if hub is None:
                note(event="catalog never ready")
                return 1
            existing = wifi_rows(http, hub)
            note(event="before", wifi=[(d["device_id"], d["name"], d["device_class"]) for d in existing])
            n = 0
            while len(wifi_rows(http, hub)) < TARGET:
                n += 1
                name = f"{PREFIX}{n}"
                job = wait_job(http, hub, http.post(f"/hubs/{hub}/wifi-devices", json={"name": name, "slots": [{"label": "Cap"}], "transport": "http"}))
                result = job.get("result") or {}
                if result.get("key"):
                    made.append(result["key"])
                note(event="deploy", name=name, status=job.get("status"), device_id=result.get("device_id"),
                     error=job.get("error"), count_after=len(wifi_rows(http, hub)))
                if job.get("status") != "done":
                    break
            # Cleanup: every scratch record the server knows, then any scratch hub device left.
            for key in made:
                job = wait_job(http, hub, http.delete(f"/hubs/{hub}/wifi-devices/{key}", params={"force": "true"}))
                note(event="remove", key=key, status=job.get("status"))
            for d in http.get(f"/hubs/{hub}/devices").json():
                if str(d.get("name") or "").startswith(PREFIX):
                    job = wait_job(http, hub, http.delete(f"/hubs/{hub}/devices/{d['device_id']}"))
                    note(event="remove leftover device", device_id=d["device_id"], status=job.get("status"))
            job = wait_job(http, hub, http.post(f"/hubs/{hub}/snapshot/refresh"))
            left = [d["name"] for d in http.get(f"/hubs/{hub}/devices").json() if str(d.get("name") or "").startswith(PREFIX)]
            note(event="after", refresh=job.get("status"), scratch_left=left)
            http.delete(f"/hubs/{hub}")
    finally:
        proc.terminate()
        try:
            proc.wait(20)
        except subprocess.TimeoutExpired:
            proc.kill()
        (bench_common.BENCH_DIR / f"bench_335_{HUB}.json").write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
