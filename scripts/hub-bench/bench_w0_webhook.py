"""bench_w0: Wifi Commands at an HA-style webhook: which replies the hub accepts (X1S).

Plan: docs/internal/wifi-webhook-transport-plan.md, gate W0 (optional: the
X1S can't do HTTPS, so the webhook transport is X2-only; see bench_w3_https.py).
A stand-in webhook on this machine (webhook_standin.py) answers in one of five
shapes; a sandbox Wifi device's records call it on ``/api/webhook/<id>?slot=..``
and one command is pressed per shape:

    control   the listener's reply: HTTP/1.1 200, "ok", Connection: close
    A         HA's default (the handler returns nothing): empty, keep-alive
    B         body, keep-alive
    C         empty, Connection: close
    D         body, Connection: close (what our webhook handler can send)

A shape that draws --storm-limit deliveries for one press is a storm: the
stand-in switches to ``control`` at once (July: that ended a storm within
~5 s) and the report records how long the storm took to die.

    ha status|off|on    the X1S's HA entry (the hub takes one client)
    selftest            offline: a fake hub request against every shape
    plan                offline: the sandbox device and the request it sends
    capture-ha          one POST to HA's /api/webhook/<unused id>; saves HA's
                        real reply so --ha-capture replays its header lines
    up                  sandbox Wifi device "J Hook" calling this machine on --port
    run                 one short press per shape in --shapes, deliveries counted
    down                remove the sandbox device, then one full remote sync

``up``, ``run`` and ``down`` need --go and the HA entry off (``ha off``); the
X1S is expendable. Windows may ask whether Python may accept connections on
--port: allow it on private networks, or ``run`` sees nothing.

Run from the repo root:
    .venv-bench\\Scripts\\python.exe scripts\\hub-bench\\bench_w0_webhook.py selftest

Reports: scripts/hub-bench/out/bench_w0_<chunk>_<tag>.json. The sandbox ids
persist in out/bench_w0_state.json.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import secrets
import socket
import ssl
import sys
import time
import urllib.parse

from bench_common import BENCH_DIR, save_json, setup_logging
from webhook_standin import (
    SHAPES,
    WebhookStandIn,
    build_response,
    content_length,
    header_lines,
    press_through_shapes,
    print_results,
    wait_quiet,
)

from x1slib import AsyncXProxy, HubConfig, WifiDeviceSpec, WifiSlotSpec  # noqa: E402
from x1slib.blob_decoders import render_wifi_ip_http_text  # noqa: E402

STATE_PATH = BENCH_DIR / "bench_w0_state.json"
SANDBOX_WIFI = "J Hook"
SLOT_LABEL = "J Hook 1"
# The short record of slot 1; the stand-in names every call by its query.
SHORT_COMMAND_ID = 1
# The hub's own request shape for a managed callback (POST, form type, no body).
HUB_CONTENT_TYPE = "application/x-www-form-urlencoded"

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("chunk", choices=["ha", "selftest", "plan", "capture-ha", "up", "run", "down"])
ap.add_argument("args", nargs="*", help="ha: status|off|on")
ap.add_argument("--tag", default=time.strftime("%m%d-%H%M"))
ap.add_argument("--host", default="192.168.2.151", help="the X1S")
ap.add_argument("--ha-entry", default="Sofabaton X1S (", help="title substring of the X1S's HA entry")
ap.add_argument("--no-ha-check", action="store_true", help="skip the HA entry guard (HA unreachable)")
ap.add_argument("--go", action="store_true", help="Marcel's go-ahead for a run that writes to the hub")
ap.add_argument("--port", type=int, default=18123, help="where the stand-in webhook listens")
ap.add_argument("--shapes", default="control,A,B,C,D", help="run: comma-separated, in order")
ap.add_argument("--window", type=float, default=12.0, help="run: seconds deliveries are counted per press")
ap.add_argument("--gap", type=float, default=5.0, help="run: quiet seconds between shapes")
ap.add_argument("--storm-limit", type=int, default=4, help="run: deliveries for one press that count as a storm")
ap.add_argument("--keepalive", type=float, default=75.0, help="idle seconds a keep-alive connection stays open")
ap.add_argument("--ha-capture", default=None, help="JSON from capture-ha: its header lines replace the approximation")
ap.add_argument("--ha-url", default=None, help="capture-ha: HA base URL (default: the bench's HA)")
ARGS = ap.parse_args()

REPORT: dict = {"bench": "bench_w0", "chunk": ARGS.chunk, "args": ARGS.args, "tag": ARGS.tag, "host": ARGS.host,
                "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": [], "problems": []}


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


def step(name: str, /, **fields) -> None:
    REPORT["steps"].append({"step": name, "wall": wallclock(), **fields})
    print(f"[{wallclock()}] {name}: " + ", ".join(f"{k}={v}" for k, v in fields.items()), flush=True)


def problem(text: str) -> None:
    REPORT["problems"].append(text)
    print(f"PROBLEM: {text}", flush=True)


def save(name: str) -> None:
    REPORT["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    print("saved:", save_json(f"bench_w0_{name}_{ARGS.tag}", REPORT), flush=True)


def load_state() -> dict:
    return json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}


def store_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


# -- offline chunks ---------------------------------------------------------------------------------

def local_ip_towards(host: str) -> str:
    """The address this machine uses to reach ``host`` (UDP connect sends nothing)."""

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.connect((host, 9))
        return probe.getsockname()[0]


def webhook_path(hook_id: str, command_index: int, press: str) -> str:
    return f"api/webhook/{hook_id}?slot={command_index}&press={press}"


def hub_request(host: str, port: int, path: str) -> bytes:
    """The request text a managed record makes the hub send (no body)."""

    return render_wifi_ip_http_text(host=host, port=port, method="POST", path=f"/{path.lstrip('/')}",
                                    header="", content_type=HUB_CONTENT_TYPE, body="")


async def _fake_hub_call(port: int, request: bytes) -> dict:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(request)
    await writer.drain()
    head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=2.0)
    body = await asyncio.wait_for(reader.readexactly(content_length(head)), timeout=2.0)
    try:
        extra = await asyncio.wait_for(reader.read(1), timeout=0.5)
        closed = extra == b""
    except asyncio.TimeoutError:
        closed = False
    writer.close()
    with contextlib.suppress(Exception):
        await writer.wait_closed()
    lines = head.decode("latin-1").split("\r\n")
    return {"status_line": lines[0], "header_lines": [line for line in lines[1:] if line], "body": body,
            "server_closed": closed}


async def selftest() -> None:
    stand_in = WebhookStandIn(header_lines(ARGS.ha_capture), keepalive=ARGS.keepalive)
    port = await stand_in.start("127.0.0.1", 0)
    request = hub_request("127.0.0.1", port, webhook_path("w0-selftest", 0, "short"))
    step("request", text=request.decode("ascii"))
    try:
        for name, shape in SHAPES.items():
            stand_in.shape = name
            reply = await _fake_hub_call(port, request)
            declared = next((int(line.split(":", 1)[1]) for line in reply["header_lines"]
                             if line.lower().startswith("content-length")), None)
            checks = {
                "status_200": reply["status_line"] == "HTTP/1.1 200 OK",
                "body": reply["body"] == shape.body,
                "content_length": declared == len(shape.body),
                "close_header": any(line.lower() == "connection: close" for line in reply["header_lines"]) == shape.close,
                "server_closed": reply["server_closed"] == shape.close,
            }
            ok = all(checks.values())
            step(f"shape_{name}", ok=ok, label=shape.label, status=reply["status_line"],
                 headers=reply["header_lines"], body=reply["body"].decode("latin-1"),
                 server_closed=reply["server_closed"], failed=[k for k, v in checks.items() if not v])
            if not ok:
                problem(f"shape {name} does not answer as specified: {checks}")
        await asyncio.sleep(0.2)
        step("stand_in_saw", deliveries=len(stand_in.deliveries),
             paths=sorted({d["request_line"] for d in stand_in.deliveries}))
        if len(stand_in.deliveries) != len(SHAPES):
            problem(f"expected {len(SHAPES)} deliveries, saw {len(stand_in.deliveries)}")
    finally:
        await stand_in.stop()


def plan() -> None:
    me = local_ip_towards(ARGS.host)
    hook_id = "w0-<random at up>"
    request = hub_request(me, ARGS.port, webhook_path(hook_id, 0, "short"))
    step("plan", hub=ARGS.host, this_machine=me, port=ARGS.port, device=SANDBOX_WIFI,
         slots=f"1 named slot ({SLOT_LABEL}), the rest default; every record calls this machine",
         press=f"command {SHORT_COMMAND_ID} (slot 1 short) once per shape",
         shapes=", ".join(f"{k}={v.label}" for k, v in SHAPES.items() if k in ARGS.shapes.split(",")),
         storm_rule=f">= {ARGS.storm_limit} deliveries in {ARGS.window:.0f} s -> switch to control")
    print("\nThe hub will send (slot 1 short):\n" + request.decode("ascii").replace("\r\n", "\\r\\n\n"))
    for name in ARGS.shapes.split(","):
        print(f"\nshape {name} answers:\n" + build_response(name, header_lines(ARGS.ha_capture))
              .decode("latin-1").replace("\r\n", "\\r\\n\n"))


def capture_ha() -> None:
    """One request in the hub's shape to an unused webhook id on the real HA."""

    base = ARGS.ha_url
    if not base:
        import ha_bench  # noqa: PLC0415  reads the bench HA's URL only when needed
        base = ha_bench.BASE_URL
    url = urllib.parse.urlsplit(base)
    port = url.port or (443 if url.scheme == "https" else 80)
    path = f"/api/webhook/w0-capture-{secrets.token_hex(6)}"
    request = render_wifi_ip_http_text(host=url.hostname, port=port, method="POST", path=path,
                                       header="", content_type=HUB_CONTENT_TYPE, body="")
    raw = socket.create_connection((url.hostname, port), timeout=5)
    if url.scheme == "https":
        raw = ssl.create_default_context().wrap_socket(raw, server_hostname=url.hostname)
    with raw:
        raw.sendall(request)
        reply = b""
        started = time.monotonic()
        closed = False
        raw.settimeout(3.0)
        while time.monotonic() - started < 10:
            try:
                chunk = raw.recv(4096)
            except socket.timeout:
                break
            if not chunk:
                closed = True
                break
            reply += chunk
            if b"\r\n\r\n" in reply:
                head, _, body = reply.partition(b"\r\n\r\n")
                if len(body) >= content_length(head + b"\r\n\r\n"):
                    raw.settimeout(1.5)  # keep reading briefly: does HA close?
    head, _, body = reply.partition(b"\r\n\r\n")
    lines = head.decode("latin-1").split("\r\n")
    capture = {"url": f"{url.scheme}://{url.hostname}:{port}{path}", "status_line": lines[0],
               "header_lines": [line for line in lines[1:] if line], "body": body.decode("latin-1"),
               "server_closed": closed, "request": request.decode("ascii")}
    path_out = save_json(f"bench_w0_ha_capture_{ARGS.tag}", capture)
    step("captured", status=capture["status_line"], headers=capture["header_lines"],
         body=capture["body"], server_closed=closed, file=str(path_out))
    print(f"\nreplay it with: --ha-capture {path_out}")


# -- hub chunks -------------------------------------------------------------------------------------

def _ha_ws():
    import ha_bench  # noqa: PLC0415  reads the HA token and URL only when needed
    return ha_bench.HaWs()


def ha_entries(ws) -> list[dict]:
    rows = ws.ok({"type": "config_entries/get", "domain": "sofabaton_x1s"}) or []
    return [row for row in rows if ARGS.ha_entry.lower() in str(row.get("title", "")).lower()]


def ha_command(action: str) -> int:
    ws = _ha_ws()
    entries = ha_entries(ws)
    if len(entries) != 1:
        print(f"need exactly one entry matching {ARGS.ha_entry!r}, found {len(entries)}")
        return 2
    if action in ("off", "on"):
        ws.ok({"type": "config_entries/disable", "entry_id": entries[0]["entry_id"],
               "disabled_by": "user" if action == "off" else None})
        time.sleep(2.0)
    rows = ws.ok({"type": "config_entries/get", "domain": "sofabaton_x1s"}) or []
    for row in rows:
        print(f"  {row.get('title')!r:32} state={row.get('state')} disabled_by={row.get('disabled_by')}")
    if action == "on":
        still_off = [row.get("title") for row in rows if row.get("disabled_by")]
        if still_off:
            print(f"NOT DONE: still disabled: {still_off}")
            return 1
        print("every sofabaton_x1s entry is enabled again")
    return 0


def require_hub_free() -> None:
    if ARGS.no_ha_check:
        return
    try:
        entries = ha_entries(_ha_ws())
    except Exception as err:  # noqa: BLE001 - the guard must explain itself
        sys.exit(f"cannot read the HA entries ({err}); pass --no-ha-check only if HA is really down")
    if len(entries) != 1 or not entries[0].get("disabled_by"):
        sys.exit("the X1S's HA entry must be disabled first: run `ha off`")


def require_go_ahead(what: str) -> None:
    if not ARGS.go:
        sys.exit(f"{what} writes to the X1S: rerun with --go once Marcel agrees")


async def facade_session(label: str, body) -> None:
    log_path = setup_logging(f"bench_w0-{label}-{ARGS.tag}")
    print(f"logging to {log_path}", flush=True)
    cfg = HubConfig(host=ARGS.host, hub_version="X1S", proxy_enabled=False, source="manual")
    proxy = AsyncXProxy.from_config(cfg, diag_dump=True, diag_parse=True)
    async with proxy:
        if not await proxy.wait_connected(timeout=60) or not await proxy.wait_until_ready(timeout=90):
            problem("the hub did not become ready")
            return
        status = await proxy.status()
        if status.mode != "control":
            problem(f"expected control mode, got {status.mode}")
            return
        await body(proxy)


async def up(proxy) -> None:
    if load_state():
        problem("out/bench_w0_state.json already holds a sandbox: `down` first")
        return
    leftovers = [d.name for d in await proxy.devices(refresh=True) if d.name.startswith("J ")]
    if leftovers:
        problem(f"J devices already on the hub: {leftovers}")
        return
    hook_id = f"w0-{secrets.token_hex(6)}"

    def build_path(*, device_id: int, command_index: int, press_type: str = "short") -> str:
        return webhook_path(hook_id, command_index, "long" if str(press_type).lower() == "long" else "short")

    # Bench only: the records carry the webhook path instead of /launch/...
    proxy.sync._build_launch_action_path = build_path
    me = proxy.local_address()
    spec = WifiDeviceSpec(name=SANDBOX_WIFI, slots=(WifiSlotSpec(label=SLOT_LABEL),))
    deployment = await proxy.deploy_wifi_device(spec, host=me, port=ARGS.port)
    state = {"device_id": deployment.device_id, "hook_id": hook_id, "host": me, "port": ARGS.port,
             "created": time.strftime("%Y-%m-%d %H:%M:%S")}
    store_state(state)
    step("up", device_id=deployment.device_id,
         callback=f"http://{me}:{ARGS.port}/{webhook_path(hook_id, 0, 'short')}",
         note="the create ends with one full remote sync (~1 min on the X1S)")


async def run(proxy) -> None:
    state = load_state()
    if not state:
        problem("no sandbox recorded: `up` first")
        return
    shapes = [name.strip() for name in ARGS.shapes.split(",") if name.strip()]
    unknown = [name for name in shapes if name not in SHAPES]
    if unknown:
        problem(f"unknown shapes {unknown}; known: {list(SHAPES)}")
        return
    stand_in = WebhookStandIn(header_lines(ARGS.ha_capture), keepalive=ARGS.keepalive)
    await stand_in.start("0.0.0.0", int(state["port"]))
    step("stand_in_listening", port=state["port"], hook=state["hook_id"],
         headers="captured" if ARGS.ha_capture else "approximated")

    async def press() -> bool:
        return await proxy.send(int(state["device_id"]), SHORT_COMMAND_ID)

    results: list[dict] = []
    try:
        results = await press_through_shapes(stand_in, press, shapes, window=ARGS.window,
                                             storm_limit=ARGS.storm_limit, gap=ARGS.gap, step=step)
    finally:
        stand_in.shape = "control"
        await wait_quiet(stand_in, 5.0, max_s=60.0)
        await stand_in.stop()
        REPORT["results"] = results
        REPORT["deliveries"] = stand_in.deliveries
        REPORT["connections"] = stand_in.connections
    print_results(results)


async def down(proxy) -> None:
    state = load_state()
    if not state:
        problem("no sandbox recorded")
        return
    device_id = int(state["device_id"])
    try:
        await proxy.remove_device(device_id)
        step("removed_device", device_id=device_id)
    except Exception as err:  # noqa: BLE001 - report, then look at what is left
        problem(f"remove_device({device_id}): {err}")
    left = [d.name for d in await proxy.devices(refresh=True) if d.name.startswith("J ")]
    if left:
        problem(f"J devices left: {left}")
    else:
        STATE_PATH.unlink(missing_ok=True)
    # The delete asks for no remote sync; the remote must still lose the device.
    sent = await proxy.run(proxy.sync.resync_remote)
    step("resync_remote", sent=bool(sent))


def main() -> int:
    chunk = ARGS.chunk
    if chunk == "ha":
        return ha_command(ARGS.args[0] if ARGS.args else "status")
    if chunk in ("selftest", "plan", "capture-ha"):
        {"selftest": lambda: asyncio.run(selftest()), "plan": plan, "capture-ha": capture_ha}[chunk]()
        save(chunk)
        return 1 if REPORT["problems"] else 0
    require_go_ahead(chunk)
    require_hub_free()
    try:
        asyncio.run(facade_session(chunk, {"up": up, "run": run, "down": down}[chunk]))
    finally:
        save(chunk)
        print("\nREMINDER: the X1S's HA entry stays disabled until `ha on`.", flush=True)
    return 1 if REPORT["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
