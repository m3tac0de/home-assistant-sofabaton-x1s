#!/usr/bin/env python3
"""Refresh, preview and optionally rename an activity through REST.

Uses Python's standard library. Register the hub first and pass its current
hub_id (prefer the MAC form). --server is the server base URL, including any
reverse-proxy prefix but excluding /api/v1. Preview reads the hub; --apply
also writes. A request or job failure stops the example without retrying.
Once access is set up on the server, this example needs a write token even
without --apply (the preview's refresh and plan are POSTs, which count as
writes): set SOFABATON_TOKEN to one made in the control panel (Server
settings > Access).
"""

import argparse
import copy
import json
import os
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


class Client:
    def __init__(self, server: str, token: str | None = None) -> None:
        self.api = server.rstrip("/") + "/api/v1"
        self.token = token if token is not None else os.environ.get("SOFABATON_TOKEN") or None

    def request(self, method: str, path: str, body=None, *, headers=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        auth = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        request = Request(
            self.api + path,
            data=data,
            headers={"Accept": "application/json", "Content-Type": "application/json", **auth, **(headers or {})},
            method=method,
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as err:
            detail = err.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {err.code}: {detail}") from err

    def wait_job(self, hub_path: str, job: dict, *, timeout: float = 900) -> dict:
        job_id = job["job_id"]
        print("Following job:", job_id)
        deadline = time.monotonic() + timeout
        while job["status"] in ("queued", "running"):
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Job {job_id} is still pending; inspect it before another write")
            time.sleep(0.25)
            job = self.request("GET", f"{hub_path}/jobs/{quote(job_id, safe='')}")
        if job["status"] != "done":
            print("Job result:", json.dumps(job.get("result"), indent=2))
            print("Current snapshot:", json.dumps(self.request("GET", hub_path + "/snapshot"), indent=2))
            raise RuntimeError(
                f"Job {job_id} {job['status']}: {job.get('error')}; "
                "reconcile the configuration before retrying"
            )
        return job


def edit(client: Client, args: argparse.Namespace) -> None:
    hub = "/hubs/" + quote(args.hub_id, safe="")
    deadline = time.monotonic() + 30
    while True:
        view = client.request("GET", hub + "/status")
        if not view["enabled"]:
            raise RuntimeError("Hub is disabled; enable it before editing")
        status = view.get("status")
        if status and status.get("firmware_unsupported"):
            raise RuntimeError("Update the hub firmware in the official app before editing")
        if status and status["controllable"] and status["catalog_ready"]:
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("Hub did not become controllable with ready catalogs")
        time.sleep(0.5)

    refresh = client.request("POST", hub + "/snapshot/refresh", {"activity_id": args.activity})
    client.wait_job(hub, refresh)
    snapshot = client.request("GET", hub + "/snapshot")
    entity = next(
        (a for a in snapshot["activities"] if a["device"]["device_id"] == args.activity), None
    )
    if entity is None or not entity["editable"]:
        raise RuntimeError("Activity is unknown or its detail is incomplete")
    edited = copy.deepcopy(entity)
    edited["device"]["name"] = args.name
    activity = f"{hub}/activities/{args.activity}"
    plan = client.request("POST", activity + "/plan", edited)
    print("Plan:", json.dumps(plan, indent=2))
    if not plan["step_count"]:
        print("The activity already has that name")
        return
    if not args.apply:
        print("Preview only. Add --apply to submit the edit")
        return

    # If-Match uses the configuration revision, not the HTTP cache ETag.
    job = client.request(
        "PUT", activity, edited,
        headers={"If-Match": f'"{snapshot["snapshot_id"]}"'},
    )
    done = client.wait_job(hub, job)
    print("Result:", json.dumps(done["result"], indent=2))
    print("Current snapshot:", json.dumps(client.request("GET", hub + "/snapshot"), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://localhost:8480")
    parser.add_argument("--hub-id", required=True, help="Current id of a registered hub")
    parser.add_argument("--activity", type=int, choices=range(101, 256), metavar="ID", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--apply", action="store_true", help="Submit the previewed edit")
    args = parser.parse_args()
    edit(Client(args.server), args)


if __name__ == "__main__":
    main()
