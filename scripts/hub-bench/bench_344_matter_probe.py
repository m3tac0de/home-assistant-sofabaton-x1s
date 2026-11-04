"""bench_344: does this hub's firmware answer the Matter reads? Read-only.

One request at a time, each waiting for its reply or a timeout, with a quiet gap
after it:

    REQ_DEVICES          is device 51 in the normal list?
    0x0072               the Matter device row, or an ack when not linked
    0x025C [51, 0xFF]    the key list of device 51
    0x0081               pairing data

A browse for Matter mDNS records runs throughout, so a record that appears after
a read shows up as new. The 0x0081 reply is a credential: this script prints only
its shape, and no frame logging runs, so nothing stores it.

The hub takes one client, so its HA entry is off for the run:

    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\ha_entry.py disable "Sofabaton X2 ("
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_344_matter_probe.py 192.168.2.123 X2
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\ha_entry.py enable "Sofabaton X2 ("

To pair by hand, `--save-pairing <file>` does only the 0x0081 read and writes the
code to that file, still printing nothing of it. Keep the file under out/, which
git ignores:

    bench_344_matter_probe.py 192.168.2.123 X2 --save-pairing scripts\\hub-bench\\out\\x2-matter-pairing.txt
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

from bench_common import X1Proxy
from zeroconf import IPVersion, ServiceBrowser, ServiceListener, Zeroconf

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
SAVE_PATH = Path(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[3] == "--save-pairing" else None
MATTER_DEVICE = 51
MDNS_TYPES = ("_matterc._udp.local.", "_matter._tcp.local.")
REPLY_WAIT = 8.0
QUIET = 2.0
GAP = 3.0
HOLD_AFTER_PAIRING_READ = 30.0

# No library logging at all: its wire dumps would carry the pairing data.
logging.disable(logging.CRITICAL)
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

started = time.monotonic()
frames_seen: list[tuple[float, int, bytes]] = []


def stamp() -> str:
    return f"{time.monotonic() - started:6.1f}s"


class MdnsWatch(ServiceListener):
    def __init__(self) -> None:
        self.seen: set[tuple[str, str]] = set()
        self.report_new = False

    def _note(self, zc, type_, name) -> None:
        if (type_, name) in self.seen:
            return
        self.seen.add((type_, name))
        if not self.report_new:
            return
        info = zc.get_service_info(type_, name, timeout=3000)
        addrs = info.parsed_addresses() if info else []
        vendor = (info.properties.get(b"VP") if info else None) or b""
        print(f"[{stamp()}] NEW mDNS {type_} addrs={addrs} VP={vendor.decode(errors='replace')}", flush=True)

    def add_service(self, zc, type_, name) -> None:
        self._note(zc, type_, name)

    def update_service(self, zc, type_, name) -> None:
        self._note(zc, type_, name)

    def remove_service(self, zc, type_, name) -> None:
        pass


def wait_for_reply(since: int, *, wait: float = REPLY_WAIT) -> list[tuple[float, int, bytes]]:
    """Return the frames after index `since`: first frame + QUIET, or `wait` with none."""
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline:
        if len(frames_seen) > since:
            if time.monotonic() - frames_seen[-1][0] >= QUIET:
                break
        time.sleep(0.1)
    return frames_seen[since:]


def wait_until_quiet(limit: float = 45.0) -> None:
    deadline = time.monotonic() + limit
    while time.monotonic() < deadline:
        if not frames_seen or time.monotonic() - frames_seen[-1][0] >= GAP:
            return
        time.sleep(0.1)


BASE38 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
TEST_PASSCODES = {20202021, 20202024, 112233}
VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def decode_setup_payload(text: str) -> dict | None:
    """Decode a Matter MT: payload, or None. The caller must not print the secret fields."""
    at = text.find("MT:")
    if at < 0:
        return None
    body = text[at + 3:]
    if len(body) != 19 or any(c not in BASE38 for c in body):
        return None
    raw = b""
    for start, count, size in ((0, 5, 3), (5, 5, 3), (10, 5, 3), (15, 4, 2)):
        value = 0
        for char in reversed(body[start:start + count]):
            value = value * 38 + BASE38.index(char)
        raw += value.to_bytes(size, "little")
    bits = int.from_bytes(raw, "little")

    def take(width: int) -> int:
        nonlocal bits
        value = bits & ((1 << width) - 1)
        bits >>= width
        return value

    return {
        "prefix_bytes": at,
        "version": take(3),
        "vendor_id": take(16),
        "product_id": take(16),
        "flow": take(2),
        "discovery": take(8),
        "discriminator": take(12),
        "passcode": take(27),
    }


def manual_code_facts(code: str) -> tuple[bool, int | None]:
    """Return (check digit valid, passcode) for an 11-digit manual code."""
    digits = [c for c in code if c.isdigit()]
    if len(digits) != 11:
        return False, None
    check = 0
    for position, digit in enumerate(reversed(digits)):
        check = VERHOEFF_D[check][VERHOEFF_P[position % 8][int(digit)]]
    chunk2 = int("".join(digits[1:6]))
    chunk3 = int("".join(digits[6:10]))
    return check == 0, (chunk2 & 0x3FFF) | (chunk3 << 14)


def pairing_shape(payload: bytes) -> str:
    """Describe a pairing reply without printing the passcode, discriminator or code."""
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return f"{len(payload)} bytes, not UTF-8"
    qr, sep, code = text.partition("\r")
    parts = [f"{len(payload)} bytes, UTF-8, has CR={bool(sep)}, first part {len(qr)} chars"]
    fields = decode_setup_payload(qr)
    if fields is None:
        parts.append(f"no MT: payload found, first byte 0x{payload[0]:02X}")
    else:
        flow = {0: "standard", 1: "user intent", 2: "custom"}.get(fields["flow"], "reserved")
        discovery = fields["discovery"]
        parts += [
            f"MT: at offset {fields['prefix_bytes']}, prefix bytes {payload[:fields['prefix_bytes']].hex(' ') or 'none'}",
            f"version {fields['version']}",
            f"vendor {fields['vendor_id']} (0x{fields['vendor_id']:04X})",
            f"product {fields['product_id']} (0x{fields['product_id']:04X})",
            f"flow {fields['flow']} ({flow})",
            f"discovery 0x{discovery:02X} (SoftAP={bool(discovery & 1)}, BLE={bool(discovery & 2)}, "
            f"on-network={bool(discovery & 4)})",
            f"test passcode={fields['passcode'] in TEST_PASSCODES}",
            f"test discriminator={fields['discriminator'] == 3840}",
        ]
    check_ok, manual_passcode = manual_code_facts(code)
    digits = sum(c.isdigit() for c in code)
    parts.append(f"second part {len(code)} chars with {digits} digits, check digit valid={check_ok}")
    if fields is not None and manual_passcode is not None:
        parts.append(f"same passcode in both={fields['passcode'] == manual_passcode}")
    return "\n    ".join(parts)


def save_pairing(replies: list[tuple[float, int, bytes]]) -> None:
    """Write the pairing data for a person to use. None of it goes to stdout."""
    for _when, opcode, body in replies:
        if opcode & 0xFF != 0x81:
            continue
        qr, _sep, code = body.decode("utf-8").partition("\r")
        digits = "".join(c for c in code if c.isdigit())
        if decode_setup_payload(qr) is None or not manual_code_facts(code)[0]:
            sys.exit("the pairing reply did not decode; nothing saved")
        SAVE_PATH.write_text(
            f"X2 Matter pairing data, {HOST}, read {time.strftime('%Y-%m-%d %H:%M')}. Treat it like a password.\n\n"
            f"Manual code: {digits[:4]}-{digits[4:7]}-{digits[7:]}\n"
            f"QR text:     {qr[qr.find('MT:'):]}\n",
            encoding="utf-8",
        )
        print(f"saved to {SAVE_PATH}", flush=True)
        return
    sys.exit("no pairing reply; nothing saved")


def probe(proxy: X1Proxy, label: str, opcode: int, payload: bytes = b"", *, secret: bool = False) -> list:
    wait_until_quiet()
    since = len(frames_seen)
    print(f"[{stamp()}] {label}: sending 0x{opcode:04X} {payload.hex(' ')}", flush=True)
    if not proxy.enqueue_cmd(opcode, payload):
        print("  not sent: the engine refused it", flush=True)
        return []
    replies = wait_for_reply(since)
    if not replies:
        print(f"  no reply in {REPLY_WAIT:.0f} s", flush=True)
    for _when, reply_op, body in replies:
        if secret and len(body) > 4:
            print(f"  reply 0x{reply_op:04X}: {pairing_shape(body)}", flush=True)
        else:
            shown = body[:48].hex(" ") + (" ..." if len(body) > 48 else "")
            print(f"  reply 0x{reply_op:04X} ({len(body)} bytes): {shown}", flush=True)
    return replies


proxy = X1Proxy(HOST, hub_version=HUB_VERSION, proxy_enabled=False, diag_dump=False, diag_parse=False)
_original_handle = proxy._handle_hub_frames


def _tap(frames) -> None:
    for opcode, _raw, payload, _scid, _ecid in frames:
        frames_seen.append((time.monotonic(), opcode, bytes(payload)))
    _original_handle(frames)


proxy._handle_hub_frames = _tap

watch = MdnsWatch()
zc = Zeroconf(ip_version=IPVersion.All)
browsers = [ServiceBrowser(zc, t, watch) for t in MDNS_TYPES]
try:
    proxy.start()
    deadline = time.monotonic() + 60.0
    while not proxy.can_issue_commands():
        if time.monotonic() > deadline:
            raise RuntimeError(f"hub {HOST} not controllable within 60 s")
        time.sleep(0.5)
    print(f"[{stamp()}] connected", flush=True)
    wait_until_quiet()
    if SAVE_PATH is not None:
        save_pairing(probe(proxy, "pairing data", 0x0081, secret=True))
        sys.exit(0)
    connect_ops = sorted({op for _w, op, _b in frames_seen})
    print(f"[{stamp()}] connect burst: {len(frames_seen)} frames, opcodes {[f'0x{op:04X}' for op in connect_ops]}", flush=True)
    print(f"[{stamp()}] mDNS baseline: {len(watch.seen)} records", flush=True)
    watch.report_new = True

    print(f"[{stamp()}] REQ_DEVICES", flush=True)
    proxy.request_devices()
    list_deadline = time.monotonic() + 25.0
    while time.monotonic() < list_deadline:
        if proxy.get_devices(force_refresh=False)[1]:
            break
        time.sleep(0.5)
    devices = dict(proxy.state.devices or {})
    print(f"  {len(devices)} devices, ids {sorted(int(d) for d in devices)}", flush=True)
    print(f"  device {MATTER_DEVICE} in the list: {MATTER_DEVICE in {int(d) for d in devices}}", flush=True)
    wait_until_quiet()

    probe(proxy, "Matter device row", 0x0072)
    probe(proxy, f"key list of device {MATTER_DEVICE}", 0x025C, bytes([MATTER_DEVICE, 0xFF]))
    probe(proxy, "pairing data", 0x0081, secret=True)

    print(f"[{stamp()}] watching mDNS for {HOLD_AFTER_PAIRING_READ:.0f} s", flush=True)
    since = len(frames_seen)
    time.sleep(HOLD_AFTER_PAIRING_READ)
    late = sorted({op for _w, op, _b in frames_seen[since:]})
    print(f"[{stamp()}] done; late frames {[f'0x{op:04X}' for op in late]}", flush=True)
finally:
    zc.close()
    proxy.stop()
    print("disconnected", flush=True)
