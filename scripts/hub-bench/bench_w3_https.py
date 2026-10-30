"""bench_w3: X2 Wifi commands as 0x21 records: plain HTTP, TLS, certificates (W2/W3).

Plan: docs/internal/wifi-webhook-transport-plan.md, gates W2-W4. The X2 can
store a Wifi command as a URL record (code type 0x21) on an ordinary Wifi
device (head class 0x1C, as the vendor app writes it). This bench creates a
sandbox Wifi device, overwrites command 1 (slot 1 short) with a 0x21 record
for one mode, and presses it:

    http      W2:  http://<this machine>:--port/api/webhook/<id>?..      stand-in, plain
    https     W3a: https://<this machine>:--tls-port/api/webhook/<id>?.. stand-in, self-signed
    real-ha   W3b: <--ha-url>/api/webhook/<id>?..                        your HA, its own cert

In the stand-in modes one press goes out per reply shape (webhook_standin.py:
control, A = HA's default, B, C, D), with the storm kill switch. A refused
certificate shows up as a TLS handshake failure on the stand-in; the SNI name
the hub sends is recorded. ``real-ha`` presses once and counts HA's
"unregistered webhook" log lines for the id (via the Z: share); HA answers
that id in shape A, so ``real-ha`` refuses until an ``https`` run showed
shape A without a storm (--accept-storm-risk overrides: HA has no kill switch).

    ha status|off|on    the X2's HA entry (the hub takes one client)
    cert                offline: self-signed cert for this machine's address
    selftest            offline: stand-in over HTTP and TLS, a lenient and a
                        certificate-checking client, SNI, the 0x21 records
    plan --mode M       offline: the URL and record bytes for a mode
    up                  sandbox Wifi device "J Https", then one full sync (~5 min)
    run --mode M        point command 1 at mode M (0x21 overwrite + read-back), press
    down                remove the sandbox device, then one full sync (~5 min)

``up``, ``run`` and ``down`` need --go and the X2's HA entry off. The X2 is
production: the sandbox device is the only thing written. Windows may ask
whether Python may accept connections: allow it on private networks.

Run from the repo root:
    .venv-bench\\Scripts\\python.exe scripts\\hub-bench\\bench_w3_https.py selftest

Reports: scripts/hub-bench/out/bench_w3_<chunk>_<tag>.json; sandbox ids and
per-mode results persist in out/bench_w3_state.json.
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
import tempfile
import time
import urllib.parse
from pathlib import Path

from bench_common import BENCH_DIR, save_json, setup_logging
from webhook_standin import (
    SHAPES,
    WebhookStandIn,
    content_length,
    header_lines,
    make_self_signed,
    press_through_shapes,
    print_results,
    server_tls_context,
    wait_quiet,
)

from x1slib import AsyncXProxy, HubConfig, WifiDeviceSpec, WifiSlotSpec  # noqa: E402
from x1slib.blob_decoders import parse_wifi_https_blob_body, render_wifi_https_blob_body  # noqa: E402

STATE_PATH = BENCH_DIR / "bench_w3_state.json"
CERT_PATH = BENCH_DIR / "bench_w3_selfsigned.crt"
KEY_PATH = BENCH_DIR / "bench_w3_selfsigned.key"
SANDBOX_WIFI = "J Https"
SLOT_LABEL = "J Https 1"
COMMAND_ID = 1  # slot 1 short
CODE_TYPE_URL_RECORD = 0x21
MODES = ("http", "https", "real-ha")

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("chunk", choices=["ha", "cert", "selftest", "plan", "up", "run", "down"])
ap.add_argument("args", nargs="*", help="ha: status|off|on")
ap.add_argument("--mode", choices=MODES, default=None, help="plan/run: where command 1 points")
ap.add_argument("--tag", default=time.strftime("%m%d-%H%M"))
ap.add_argument("--host", default="192.168.2.123", help="the X2")
ap.add_argument("--ha-entry", default="Sofabaton X2 (", help="title substring of the X2's HA entry")
ap.add_argument("--no-ha-check", action="store_true", help="skip the HA entry guard (HA unreachable)")
ap.add_argument("--go", action="store_true", help="Marcel's go-ahead for a run that writes to the hub")
ap.add_argument("--port", type=int, default=18123, help="http mode: the stand-in's port")
ap.add_argument("--tls-port", type=int, default=18443, help="https mode: the stand-in's port")
ap.add_argument("--ha-url", default=None, help="real-ha: HA's https base URL (default: the bench HA's)")
ap.add_argument("--ha-log", default=None, help="real-ha: HA's log file (default: the Z: share)")
ap.add_argument("--accept-storm-risk", action="store_true", help="real-ha without a storm-free https shape A")
ap.add_argument("--shapes", default="control,A,B,C,D", help="stand-in modes: comma-separated, in order")
ap.add_argument("--window", type=float, default=12.0, help="seconds deliveries are counted per press")
ap.add_argument("--gap", type=float, default=5.0, help="quiet seconds between shapes")
ap.add_argument("--storm-limit", type=int, default=4, help="deliveries for one press that count as a storm")
ap.add_argument("--keepalive", type=float, default=75.0, help="idle seconds a keep-alive connection stays open")
ap.add_argument("--ha-capture", default=None, help="JSON from bench_w0 capture-ha: HA's real header lines")
ARGS = ap.parse_args()

REPORT: dict = {"bench": "bench_w3", "chunk": ARGS.chunk, "mode": ARGS.mode, "args": ARGS.args, "tag": ARGS.tag,
                "host": ARGS.host, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": [], "problems": []}


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
    print("saved:", save_json(f"bench_w3_{name}_{ARGS.tag}", REPORT), flush=True)


def load_state() -> dict:
    return json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}


def store_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


# -- URLs and records -----------------------------------------------------------------------------

def local_ip_towards(host: str) -> str:
    """The address this machine uses to reach ``host`` (UDP connect sends nothing)."""

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.connect((host, 9))
        return probe.getsockname()[0]


def ha_base_url() -> str:
    base = ARGS.ha_url
    if not base:
        import ha_bench  # noqa: PLC0415  reads the bench HA's URL only when needed
        base = ha_bench.BASE_URL
    return base.rstrip("/")


def mode_url(mode: str, me: str, hook_id: str) -> str:
    query = f"api/webhook/{hook_id}?slot=0&press=short"
    if mode == "http":
        return f"http://{me}:{ARGS.port}/{query}"
    if mode == "https":
        return f"https://{me}:{ARGS.tls_port}/{query}"
    return f"{ha_base_url()}/{query}"


def url_record(url: str) -> bytes:
    """The 0x21 request region command 1 gets: a JSON POST, like a webhook call."""

    body = json.dumps({"slot": 0, "press": "short", "bench": "w3"}, separators=(",", ":"))
    return render_wifi_https_blob_body(url=url, method="POST", headers=[("Content-Type", "application/json")],
                                       body=body)


def https_request_like_a_client(url: str, record: bytes) -> bytes:
    """What an HTTP client would send for ``record`` (selftest only; the hub's
    real request is what the stand-in records)."""

    fields = parse_wifi_https_blob_body(record)
    parts = urllib.parse.urlsplit(url)
    target = parts.path + (f"?{parts.query}" if parts.query else "")
    body = fields["body"].encode("utf-8")
    lines = [f"{fields['method']} {target} HTTP/1.1", f"Host: {parts.netloc}"]
    lines += [f"{key}: {value}" for key, value in fields["headers"]]
    lines.append(f"Content-Length: {len(body)}")
    return ("\r\n".join(lines) + "\r\n\r\n").encode("utf-8") + body


# -- offline chunks -------------------------------------------------------------------------------

def cert() -> None:
    me = local_ip_towards(ARGS.host)
    crt, key = make_self_signed(BENCH_DIR, me)
    step("cert", ip=me, crt=str(crt), key=str(key), note="regenerate when this machine's address changes")


async def _client_call(port: int, request: bytes, *, tls: ssl.SSLContext | None, sni: str | None) -> dict:
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", port, ssl=tls,
                                                       server_hostname=sni if tls else None)
    except (ssl.SSLError, ConnectionError, OSError) as err:
        return {"error": f"{type(err).__name__}: {err}"}
    writer.write(request)
    await writer.drain()
    head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=3.0)
    body = await asyncio.wait_for(reader.readexactly(content_length(head)), timeout=3.0)
    writer.close()
    with contextlib.suppress(Exception):
        await writer.wait_closed()
    return {"status_line": head.split(b"\r\n", 1)[0].decode("latin-1"), "body": body.decode("latin-1")}


async def selftest() -> None:
    # 1. Records: every mode renders and parses back.
    hook = "w3-selftest"
    for mode in ("http", "https"):
        url = mode_url(mode, "192.0.2.10", hook)
        record = url_record(url)
        fields = parse_wifi_https_blob_body(record)
        ok = fields["url"] == url and fields["method"] == "POST" and fields["trailer_hex"] == ""
        step(f"record_{mode}", ok=ok, bytes=len(record), url=url, hex=record.hex(" ")[:96] + " ...")
        if not ok:
            problem(f"the {mode} record does not parse back: {fields}")

    with tempfile.TemporaryDirectory() as tmp:
        crt, key = make_self_signed(Path(tmp), "127.0.0.1")
        lines = header_lines(ARGS.ha_capture)

        # 2. Plain HTTP stand-in: one request.
        plain = WebhookStandIn(lines, keepalive=ARGS.keepalive)
        port = await plain.start("127.0.0.1", 0)
        url = f"http://127.0.0.1:{port}/api/webhook/{hook}?slot=0&press=short"
        reply = await _client_call(port, https_request_like_a_client(url, url_record(url)), tls=None, sni=None)
        await asyncio.sleep(0.2)
        ok = reply.get("status_line") == "HTTP/1.1 200 OK" and len(plain.deliveries) == 1
        step("http_stand_in", ok=ok, reply=reply, body_seen=plain.deliveries[0]["body"] if plain.deliveries else None)
        if not ok:
            problem(f"plain stand-in: {reply}")
        await plain.stop()

        # 3. TLS stand-in with the self-signed cert.
        secure = WebhookStandIn(lines, keepalive=ARGS.keepalive, tls=server_tls_context(crt, key))
        tls_port = await secure.start("127.0.0.1", 0)
        url = f"https://127.0.0.1:{tls_port}/api/webhook/{hook}?slot=0&press=short"
        request = https_request_like_a_client(url, url_record(url))

        lenient = ssl.create_default_context()
        lenient.check_hostname = False
        lenient.verify_mode = ssl.CERT_NONE
        for shape in ("control", "A"):
            secure.shape = shape
            reply = await _client_call(tls_port, request, tls=lenient, sni="ha.example")
            await asyncio.sleep(0.2)
            conn = secure.connections[-1]
            ok = (reply.get("status_line") == "HTTP/1.1 200 OK" and conn.get("tls_version")
                  and conn.get("sni") == "ha.example")
            step(f"tls_lenient_{shape}", ok=bool(ok), reply=reply, tls=conn.get("tls_version"),
                 cipher=conn.get("tls_cipher"), sni=conn.get("sni"))
            if not ok:
                problem(f"TLS stand-in, lenient client, shape {shape}: {reply} {conn}")
        secure.close_all("selftest")
        await asyncio.sleep(0.2)

        # 4. A client that checks certificates refuses the self-signed one; the
        #    stand-in must record that as a failed handshake.
        strict = ssl.create_default_context()
        before = len(secure.connections)
        reply = await _client_call(tls_port, request, tls=strict, sni="127.0.0.1")
        await asyncio.sleep(0.5)
        new = secure.connections[before:]
        ok = "error" in reply and any(conn.get("closed_by") == "tls_failed" for conn in new)
        step("tls_strict_client", ok=ok, client_error=reply.get("error"),
             stand_in_saw=[conn.get("tls_error") for conn in new])
        if not ok:
            problem(f"a certificate-checking client was not seen as a failed handshake: {reply} {new}")
        await secure.stop()


def plan() -> None:
    mode = ARGS.mode or "https"
    me = local_ip_towards(ARGS.host)
    hook = "w3-<random at up>"
    url = mode_url(mode, me, hook)
    record = url_record(url)
    step("plan", mode=mode, hub=ARGS.host, this_machine=me, url=url, record_bytes=len(record),
         device=SANDBOX_WIFI, command=f"{COMMAND_ID} (slot 1 short), overwritten as code type 0x21",
         shapes=ARGS.shapes if mode != "real-ha" else "one press; HA answers in shape A",
         storm_rule=f">= {ARGS.storm_limit} deliveries in {ARGS.window:.0f} s -> switch to control"
         if mode != "real-ha" else "no kill switch on HA: gated on a storm-free https shape A")
    print("\nrecord (request region, before the record checksum):")
    for offset in range(0, len(record), 32):
        print("  " + record[offset:offset + 32].hex(" "))
    print(json.dumps(parse_wifi_https_blob_body(record), indent=2))
    if mode == "https" and not CERT_PATH.exists():
        print("\nno certificate yet: run `cert` first")


# -- hub chunks -----------------------------------------------------------------------------------

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
        sys.exit("the X2's HA entry must be disabled first: run `ha off`")


def require_go_ahead(what: str) -> None:
    if not ARGS.go:
        sys.exit(f"{what} writes to the X2: rerun with --go once Marcel agrees")


def require_run_preconditions() -> None:
    if ARGS.chunk != "run":
        return
    if ARGS.mode is None:
        sys.exit("run needs --mode http|https|real-ha")
    if ARGS.mode == "https" and not (CERT_PATH.exists() and KEY_PATH.exists()):
        sys.exit("no certificate: run `cert` first")
    if ARGS.mode == "real-ha":
        if not ha_base_url().lower().startswith("https://"):
            sys.exit(f"real-ha is the HTTPS gate; {ha_base_url()} is not https (pass --ha-url)")
        shape_a = ((load_state().get("results") or {}).get("https") or {}).get("A")
        if not ARGS.accept_storm_risk and (shape_a is None or shape_a.get("storm") is not False):
            sys.exit("real-ha waits for an `https` run where shape A (HA's reply) drew no storm; "
                     f"recorded: {shape_a}. --accept-storm-risk overrides (HA has no kill switch)")


async def facade_session(label: str, body) -> None:
    log_path = setup_logging(f"bench_w3-{label}-{ARGS.tag}")
    print(f"logging to {log_path}", flush=True)
    cfg = HubConfig(host=ARGS.host, hub_version="X2", proxy_enabled=False, source="manual")
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
        problem("out/bench_w3_state.json already holds a sandbox: `down` first")
        return
    leftovers = [d.name for d in await proxy.devices(refresh=True) if d.name.startswith("J ")]
    if leftovers:
        problem(f"J devices already on the hub: {leftovers}")
        return
    me = proxy.local_address()
    spec = WifiDeviceSpec(name=SANDBOX_WIFI, slots=(WifiSlotSpec(label=SLOT_LABEL),))
    # The records start as ordinary 0x1C ones; `run` overwrites command 1.
    deployment = await proxy.deploy_wifi_device(spec, host=me, port=ARGS.port)
    state = {"device_id": deployment.device_id, "hook_id": f"w3-{secrets.token_hex(6)}", "this_machine": me,
             "created": time.strftime("%Y-%m-%d %H:%M:%S"), "pointed": None, "results": {}}
    store_state(state)
    step("up", device_id=deployment.device_id, note="the create ends with one full remote sync (~5 min on the X2)")


async def point(proxy, state: dict, mode: str) -> bool:
    """Overwrite command 1 with the mode's 0x21 record and read it back."""

    device_id = int(state["device_id"])
    url = mode_url(mode, state["this_machine"], state["hook_id"])
    if (state.get("pointed") or {}).get("url") == url:
        step("point", mode=mode, url=url, note="already pointed")
        return True
    await proxy.commands(device_id)  # caches labels + record metadata for the overwrite
    meta = (proxy.sync.state.command_metadata.get(device_id & 0xFF) or {}).get(COMMAND_ID)
    if not isinstance(meta, dict):
        problem(f"no record metadata for {device_id}/{COMMAND_ID}")
        return False
    record = url_record(url)
    result = await proxy.run(
        proxy.sync.overwrite_command_payload, device_id=device_id, command_id=COMMAND_ID, command_name=SLOT_LABEL,
        library_type=CODE_TYPE_URL_RECORD, library_data=record, button_code=int(meta.get("button_code", 0)),
    )
    step("overwrite", mode=mode, url=url, was_type=f"0x{int(meta.get('library_type', 0)):02X}",
         result=result and result.get("status"), pages=result and result.get("page_count"))
    if not result or result.get("status") != "success":
        problem("the hub refused the 0x21 overwrite")
        return False
    stored = await proxy.read_payload(device_id, COMMAND_ID)
    blob = getattr(stored, "blob", b"") or b""
    try:
        fields = parse_wifi_https_blob_body(blob)
    except ValueError as err:
        problem(f"read-back does not parse as a 0x21 record ({err}): {blob.hex(' ')[:200]}")
        return False
    step("read_back", url=fields["url"], method=fields["method"], headers=fields["headers"], body=fields["body"],
         trailer=fields["trailer_hex"], matches=fields["url"] == url)
    if fields["url"] != url:
        problem("the stored URL differs from the written one")
        return False
    state["pointed"] = {"mode": mode, "url": url, "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    store_state(state)
    return True


async def run_stand_in(proxy, state: dict, mode: str) -> None:
    shapes = [name.strip() for name in ARGS.shapes.split(",") if name.strip()]
    unknown = [name for name in shapes if name not in SHAPES]
    if unknown:
        problem(f"unknown shapes {unknown}; known: {list(SHAPES)}")
        return
    tls = server_tls_context(CERT_PATH, KEY_PATH) if mode == "https" else None
    stand_in = WebhookStandIn(header_lines(ARGS.ha_capture), keepalive=ARGS.keepalive, tls=tls)
    port = ARGS.tls_port if mode == "https" else ARGS.port
    await stand_in.start("0.0.0.0", port)
    step("stand_in_listening", mode=mode, port=port, tls=bool(tls))

    async def press() -> bool:
        return await proxy.send(int(state["device_id"]), COMMAND_ID)

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
        REPORT["sni_seen"] = stand_in.sni_seen
    print_results(results)
    if tls is not None:
        versions = sorted({c.get("tls_version") for c in stand_in.connections if c.get("tls_version")})
        failures = [c["tls_error"] for c in stand_in.connections if c.get("tls_error")]
        step("tls_summary", versions=versions, sni=sorted({s["server_name"] for s in stand_in.sni_seen
                                                            if s["server_name"]}), failed_handshakes=len(failures),
             first_failure=failures[0] if failures else None)
    state.setdefault("results", {})[mode] = {row["shape"]: {"storm": row["storm"], "deliveries": row["deliveries"]}
                                             for row in results}
    store_state(state)


def _log_lines_since(path: Path, offset: int, needle: str) -> list[str]:
    """HA's one line per request for an unknown id (logged at INFO: the
    ``homeassistant.components.webhook`` logger must be at info or lower)."""

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        handle.seek(offset)
        return [line.rstrip() for line in handle
                if needle in line and "Received message for unregistered webhook" in line]


async def run_real_ha(proxy, state: dict) -> None:
    log_path = Path(ARGS.ha_log) if ARGS.ha_log else None
    if log_path is None:
        import ha_bench  # noqa: PLC0415
        log_path = Path(ha_bench.HA_LOG)
    start_size = log_path.stat().st_size if log_path.exists() else None
    step("ha_log", path=str(log_path), readable=start_size is not None)
    sent = await proxy.send(int(state["device_id"]), COMMAND_ID)
    step("press", mode="real-ha", sent=sent, url=state["pointed"]["url"])
    await asyncio.sleep(ARGS.window)
    hits: list[str] = []
    if start_size is not None:
        hits = await asyncio.to_thread(_log_lines_since, log_path, start_size, state["hook_id"])
    step("result", mode="real-ha", ha_log_hits=len(hits) if start_size is not None else "unknown",
         first=hits[0] if hits else None, storm=len(hits) >= ARGS.storm_limit)
    REPORT["ha_log_hits"] = hits
    if len(hits) >= ARGS.storm_limit:
        problem("HA is being stormed: delete the sandbox (`down --go`) or power-cycle the X2")
    state.setdefault("results", {})["real-ha"] = {"ha_log_hits": len(hits)}
    store_state(state)


async def run(proxy) -> None:
    state = load_state()
    if not state:
        problem("no sandbox recorded: `up` first")
        return
    if not await point(proxy, state, ARGS.mode):
        return
    if ARGS.mode == "real-ha":
        await run_real_ha(proxy, state)
    else:
        await run_stand_in(proxy, state, ARGS.mode)


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
        REPORT["final_state"] = state
        STATE_PATH.unlink(missing_ok=True)
    # The delete asks for no remote sync; the remotes must still lose the device.
    sent = await proxy.run(proxy.sync.resync_remote)
    step("resync_remote", sent=bool(sent), note="full sync of every remote is running now (~5 min)")


def main() -> int:
    chunk = ARGS.chunk
    if chunk == "ha":
        return ha_command(ARGS.args[0] if ARGS.args else "status")
    if chunk in ("cert", "selftest", "plan"):
        {"cert": cert, "selftest": lambda: asyncio.run(selftest()), "plan": plan}[chunk]()
        save(chunk if chunk != "plan" else f"plan-{ARGS.mode or 'https'}")
        return 1 if REPORT["problems"] else 0
    require_go_ahead(chunk)
    require_run_preconditions()
    require_hub_free()
    try:
        asyncio.run(facade_session(chunk, {"up": up, "run": run, "down": down}[chunk]))
    finally:
        save(chunk if chunk != "run" else f"run-{ARGS.mode}")
        print("\nREMINDER: the X2's HA entry stays disabled until `ha on`.", flush=True)
    return 1 if REPORT["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
