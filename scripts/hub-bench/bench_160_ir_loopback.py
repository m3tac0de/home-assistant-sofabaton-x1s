"""IR7 loopback bench: emit on one hub, learn on the other, compare.

Two hubs facing each other turn every IR conversion path into a
measurable round trip: a source signal (library code, Pronto hex, UC
HEX, raw timings, or a stored blob) is rendered to the Sofabaton raw
blob layout, played one-shot on the EMITTER hub, captured by the
LEARNER hub's IR learn mode, and the learned blob is parsed back into
``(timings, carrier)``. The script then reports:

  - timing alignment: per-word deltas, mark/space bias, missing words
  - carrier: requested vs learned (three quantizers sit in between:
    Pronto word, hub carrier timer, learner measurement)
  - learned-blob shape: pulse/repeat block lengths and the sign byte
  - semantic decode of BOTH sequences via IrpTransmogrifier (the
    IrScrutinizer install's decoder) - protocol + parameters must agree;
    this is the pass/fail, timing deltas are diagnostics
  - the learned signal re-rendered as Pronto hex

Wire discipline (live finding 2026-09-01): ANY traffic on the learner's
connection ends its learn window, so the learner's ir_learn_command()
holds the exchange in a thread while the emitter plays from its own
connection to its own hub. Only hub-initiated pushes on the learner
(e.g. a remote press) can still interrupt; the report says so.

Usage:
  bench_160_ir_loopback.py <emit_ip> <emit_ver> <learn_ip> <learn_ver> <tag> <mode> <source...> [opts]

Modes:
  samsung POWER                  SamsungTVCode member (codes.samsung.tv)
  lib <dotted.EnumClass> MEMBER  any infrared-protocols code enum, e.g.
                                 infrared_protocols.codes.sony.tv.SonyTVCode POWER
  libsweep <dotted.EnumClass>    every member of the enum, one loop each
  pronto <file|"hex words">      learned-format (0000) Pronto hex
  uc <file|"HEX;...">            Unfolded Circle HEX code (ir_uc_hex converter)
  timings <file> <carrier_hz>    comma/whitespace-separated us (mark first)
  blob <file>                    stored raw blob hex (e.g. bench_159 fetch), played as-is
  descriptor "P:..." [expect]    X2 descriptive payload (render_ir_descriptive_blob_body);
                                 optional expected decode key "Proto{D=1,F=2}" -
                                 the verdict compares the learner's decode to it
  descrsweep <file>              one descriptor per line, optionally "| expected";
                                 '#' comments; the X2 must be the emitter. Two
                                 extra line forms make mixed sequences possible:
                                 "stored:<dev_id>:<key> | expected" fires a STORED
                                 hub command (send_command, the remote's path),
                                 "raw: | expected" plays the raw NEC reset frame.
  none                           no emission: learn only (operator presses a remote)
  ha <domain.service> <entity>   emit through Home Assistant instead of the emitter
                                 hub (e.g. button.press button.samsung_tv_x1_info);
                                 pass "-" for <emit_ip>/<emit_ver>. With
                                 --ha-intercept <sensor> the intercept sensor's
                                 recorded payload becomes the "sent" sequence, so
                                 the loop validates emitter entity + intercept
                                 sensor against the learner's photons.

Options:
  --repeat N        repeat_count for library/UC renders (default 0; enums whose
                    to_command() has no repeat parameter silently ignore it)
  --frames N        send the rendered frame N times back to back, separated by
                    --gap (default 1; the Sony-repeat probe, independent of the
                    encoder's own repeat support)
  --gap US          trailing gap when the sequence ends on a mark
                    (default RAW_IR_DEFAULT_TRAILING_GAP_US); --gap none sends
                    the odd-count body unpadded (acceptance probe)
  --times N         run the loop N times per source (jitter, default 1)
  --lead S          seconds between arming the learner and playing (default 1.5)
  --learn-timeout S learn window per loop (default 20; hub exits at ~60)
  --tol-us US       per-word tolerance for the timing verdict (default 150)
  --tol-pct P       or relative tolerance, whichever is larger (default 10)
  --ha-intercept E  (ha mode) intercept sensor entity to read the sent payload from
  --rearm-on-failed re-arm the learner after an IR_LEARN_FAILED push (undecodable
                    energy such as the X2 parser-reset blips) so the frame that
                    follows within the window is still captured
  --no-decode       skip IrpTransmogrifier
  --irp-home DIR    IrScrutinizer install dir (default: Program Files (x86)
                    or the IRSCRUTINIZER_HOME environment variable)

Requires ``infrared-protocols`` in the bench venv for samsung/lib/uc modes.
Artifacts: out/ir-loopback-<tag>.json (+ per-loop frame logs).
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import os
import re
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from bench_common import REPO, connect, save_json, setup_logging

# bench_common registers the standalone library as ``x1slib`` (component dir
# stays off sys.path so its platform modules cannot shadow stdlib ``select``).
from x1slib.blob_decoders import (  # noqa: E402
    RAW_IR_DEFAULT_TRAILING_GAP_US,
    build_raw_ir_blob_body,
    parse_pronto_hex,
    parse_raw_ir_blob_body,
    render_ir_descriptive_blob_body,
    render_pronto_hex,
)

# ---------------------------------------------------------------------------
# args
# ---------------------------------------------------------------------------

if len(sys.argv) < 7:
    raise SystemExit(__doc__)

EMIT_HOST, EMIT_VER, LEARN_HOST, LEARN_VER, TAG, MODE = sys.argv[1:7]
rest = sys.argv[7:]

OPTS_WITH_VALUE = {
    "--repeat", "--frames", "--gap", "--times", "--lead", "--learn-timeout",
    "--tol-us", "--tol-pct", "--irp-home", "--ha-intercept", "--ack-timeout",
    "--canary",
}
FLAGS = {"--no-decode", "--reset-raw", "--rearm-on-failed"}
opts: dict[str, Any] = {}
positional: list[str] = []
_i = 0
while _i < len(rest):
    tok = rest[_i]
    if tok in OPTS_WITH_VALUE:
        opts[tok] = rest[_i + 1]
        _i += 2
    elif tok in FLAGS:
        opts[tok] = True
        _i += 1
    else:
        positional.append(tok)
        _i += 1

REPEAT = int(opts.get("--repeat", 0))
FRAMES = max(1, int(opts.get("--frames", 1)))
GAP_RAW = str(opts.get("--gap", RAW_IR_DEFAULT_TRAILING_GAP_US))
GAP_NONE = GAP_RAW == "none"  # odd-count acceptance probe: send the mark-terminated body unpadded
GAP_US = RAW_IR_DEFAULT_TRAILING_GAP_US if GAP_NONE else int(GAP_RAW)
TIMES = int(opts.get("--times", 1))
LEAD_S = float(opts.get("--lead", 1.5))
LEARN_TIMEOUT = float(opts.get("--learn-timeout", 20))
TOL_US = int(opts.get("--tol-us", 150))
TOL_PCT = float(opts.get("--tol-pct", 10))
DECODE = not opts.get("--no-decode")
REARM_ON_FAILED = bool(opts.get("--rearm-on-failed"))  # re-arm after an IR_LEARN_FAILED push
IRP_HOME = Path(
    str(
        opts.get("--irp-home")
        or os.environ.get("IRSCRUTINIZER_HOME")
        or r"C:\Program Files (x86)\IrScrutinizer"
    )
)

HA_INTERCEPT = opts.get("--ha-intercept")
ACK_TIMEOUT = float(opts.get("--ack-timeout", 1.0))  # play_ir_blob chunk-ack wait
# X2 descriptor parser keeps field state across plays and a bad string can
# wedge it (stale S/F on every later string); a raw-blob play clears it
# (live finding 2026-09-03). --reset-raw plays a raw NEC frame (no learn)
# before each source; --canary "P:..." learns a known-good descriptor after
# each source and reports whether the source left the parser wedged.
RESET_RAW = bool(opts.get("--reset-raw"))
CANARY = opts.get("--canary")
CANARY_EXPECT = "NECx-f16{D=7,F=96,S=7}" if CANARY == "P:NECx R:38400 D:7 S:7 F:96" else None

log_path = setup_logging(f"ir-loopback-{TAG}")
print(f"logging to {log_path}")


# --- Home Assistant REST (ha mode) ---------------------------------------------


def _ha_request(path: str, payload: dict[str, Any] | None = None) -> Any:
    import ssl
    import urllib.request

    scripts = REPO / "scripts"
    cfg = json.loads((scripts / ".ha-config.json").read_text(encoding="utf-8"))
    token = (scripts / ".ha-token").read_text(encoding="utf-8").strip()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        cfg["base_url"] + path,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return json.load(resp)


def ha_call_service(service: str, data: dict[str, Any]) -> Any:
    domain, _, name = service.partition(".")
    return _ha_request(f"/api/services/{domain}/{name}", data)


def ha_intercept_payload(entity_id: str) -> tuple[str | None, dict[str, Any]]:
    state = _ha_request(f"/api/states/{entity_id}")
    attrs = state.get("attributes") or {}
    return attrs.get("payload_hex"), {"state": state.get("state"), **attrs}

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _load_uc_hex_module():
    """Load ir_uc_hex.py standalone (dependency-free, lazy infrared-protocols)."""
    path = REPO / "custom_components" / "sofabaton_x1s" / "ir_uc_hex.py"
    spec = importlib.util.spec_from_file_location("bench_ir_uc_hex", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module  # dataclasses resolve annotations via sys.modules
    spec.loader.exec_module(module)
    return module


def _read_source_text(token: str) -> str:
    path = Path(token)
    if path.is_file():
        return path.read_text(encoding="utf-8").strip()
    return token.strip()


def _enum_class(dotted: str):
    module_name, _, class_name = dotted.rpartition(".")
    return getattr(importlib.import_module(module_name), class_name)


def _command_signal(cmd: Any) -> tuple[list[int], int]:
    return [abs(int(t)) for t in cmd.get_raw_timings()], int(cmd.modulation)


class Source:
    """One thing to emit: label, unsigned timings (mark first), carrier, blob."""

    def __init__(
        self,
        label: str,
        timings: list[int] | None,
        carrier: int | None,
        blob: bytes | None = None,
        meta: dict[str, Any] | None = None,
    ):
        self.label = label
        self.meta = meta or {}
        if timings is not None and FRAMES > 1:
            frame = list(timings)
            if len(frame) % 2:
                frame.append(GAP_US)
            timings = frame * FRAMES
            self.meta["frames"] = FRAMES
        self.timings = timings
        self.carrier = carrier
        if blob is None and timings is not None and carrier is not None:
            if GAP_NONE and len(timings) % 2:
                body = bytearray()
                body += (4 * len(timings)).to_bytes(2, "big")
                body += b"\x00\x00\x00\x00"
                body += carrier.to_bytes(2, "big")
                for value in timings:
                    body += abs(int(value)).to_bytes(4, "big")
                body += b"\x00\x00\x00\x00"
                blob = bytes(body)
                self.meta["unpadded_odd_count"] = len(timings)
            else:
                blob = build_raw_ir_blob_body(timings, carrier, trailing_gap_us=GAP_US)
        self.blob = blob
        if blob is not None and timings is None and "descriptor" not in self.meta:
            # blob mode: recover the on-air sequence from the blob itself
            try:
                self.timings, self.carrier = parse_raw_ir_blob_body(blob)
            except ValueError as exc:
                self.meta["blob_parse_error"] = str(exc)

    @property
    def sent_words(self) -> list[int] | None:
        """The exact word list inside the blob (padding included)."""
        if self.blob is None or "descriptor" in self.meta:
            return None
        try:
            return parse_raw_ir_blob_body(self.blob)[0]
        except ValueError:
            return self.timings


def build_sources() -> list[Source]:
    if MODE == "none":
        return [Source("no emission (operator stimulus)", None, None)]
    if MODE in ("descriptor", "descrsweep"):
        lines: list[tuple[str, str | None]] = []
        if MODE == "descriptor":
            lines.append((positional[0].strip(), positional[1].strip() if len(positional) > 1 else None))
        else:
            for raw in Path(positional[0]).read_text(encoding="utf-8").splitlines():
                raw = raw.split("#", 1)[0].strip()
                if not raw:
                    continue
                desc, _, expect = raw.partition("|")
                lines.append((desc.strip(), expect.strip() or None))
        out = []
        for desc, expect in lines:
            if desc.startswith("stored:"):
                _, dev, key = desc.split(":")
                out.append(Source(desc, None, None,
                                  meta={"stored": (int(dev, 0), int(key, 0)), "expected": expect}))
                continue
            if desc.startswith("blobhex:"):
                blob = bytes.fromhex(re.sub(r"[^0-9a-fA-F]", "", desc[len("blobhex:"):]))
                out.append(Source(f"blob {blob.hex(' ')}", None, None, blob=blob,
                                  meta={"expected": expect, "probe": True}))
                continue
            if desc.startswith("raw:"):
                raw = [9000, 4500, 560, 560, 560, 1690, 560, 1690, 560, 560, 560, 40000]
                src = Source("raw NEC fragment", raw, 38000, meta={"expected": expect})
                out.append(src)
                continue
            if not desc.startswith("P:"):
                raise SystemExit(f"descriptor must start with P: -> {desc!r}")
            blob = render_ir_descriptive_blob_body(desc)
            carrier = None
            m = re.search(r"\bR:(\d+)", desc)
            if m:
                carrier = int(m.group(1))
            src = Source(desc, None, None, blob=blob,
                         meta={"descriptor": desc, "expected": expect})
            src.carrier = carrier  # nominal carrier for the content decode
            out.append(src)
        return out
    if MODE == "ha":
        # ha <domain.service> <entity_id|json-data> [expected]: a JSON object
        # is passed as the service data verbatim (e.g. a play_ir_blob call
        # with entry_id + blob); anything else is an entity_id.
        target = positional[1]
        data = json.loads(target) if target.startswith("{") else {"entity_id": target}
        expected = positional[2] if len(positional) > 2 else None
        return [Source(f"ha {positional[0]} {target[:60]}", None, None,
                       meta={"service": positional[0], "data": data, "expected": expected})]
    if MODE == "samsung":
        from infrared_protocols.codes.samsung.tv import SamsungTVCode

        code = SamsungTVCode[positional[0]]
        t, c = _command_signal(code.to_command(repeat_count=REPEAT))
        return [Source(f"samsung {code.name}", t, c, meta={"repeat": REPEAT})]
    if MODE in ("lib", "libsweep"):
        enum_cls = _enum_class(positional[0])
        members = [enum_cls[positional[1]]] if MODE == "lib" else list(enum_cls)
        out = []
        for member in members:
            try:
                cmd = member.to_command(repeat_count=REPEAT)
            except TypeError:
                cmd = member.to_command()
            t, c = _command_signal(cmd)
            out.append(
                Source(
                    f"{enum_cls.__name__}.{member.name}",
                    t,
                    c,
                    meta={"repeat": REPEAT, "command": repr(cmd)},
                )
            )
        return out
    if MODE == "pronto":
        text = _read_source_text(positional[0])
        t, c = parse_pronto_hex(text)
        return [Source("pronto", t, c, meta={"pronto_in": text})]
    if MODE == "uc":
        uc = _load_uc_hex_module()
        text = _read_source_text(positional[0])
        converted = uc.convert_uc_hex(text)
        meta = {k: v for k, v in converted.items() if k != "timings_us"}
        meta["uc_in"] = text
        return [
            Source(
                f"uc {converted['protocol_name']}",
                list(converted["timings_us"]),
                int(converted["carrier_hz"]),
                meta=meta,
            )
        ]
    if MODE == "timings":
        text = _read_source_text(positional[0])
        values = [abs(int(v)) for v in text.replace(",", " ").split()]
        return [Source("timings", values, int(positional[1]))]
    if MODE == "blob":
        text = _read_source_text(positional[0])
        blob = bytes.fromhex(re.sub(r"[^0-9a-fA-F]", "", text))
        return [Source(f"blob {positional[0]}", None, None, blob=blob)]
    raise SystemExit(f"unknown mode: {MODE}")


# --- learned blob -----------------------------------------------------------


def parse_learned_blob(blob: bytes) -> dict[str, Any]:
    """Dissect the learned layout (live finding 2026-09-01).

    [0:2] pulse-block byte length, [2:4] repeat-block byte length,
    [4] sign (0 pulse only, 1 pulse+repeat, 2 pulse+flip), [5:8] carrier
    Hz (3 bytes), then BE32 durations, 4-zero terminator. For a
    single-frame capture this coincides with the raw emit layout, which
    is why parse_raw_ir_blob_body() accepts it; we cross-check that.
    """
    info: dict[str, Any] = {
        "pulse_bytes": int.from_bytes(blob[0:2], "big"),
        "repeat_bytes": int.from_bytes(blob[2:4], "big"),
        "sign": blob[4],
        "carrier_hz": int.from_bytes(blob[5:8], "big"),
        "length": len(blob),
    }
    words: list[int] = []
    pos = 8
    while pos + 4 <= len(blob):
        w = int.from_bytes(blob[pos : pos + 4], "big")
        pos += 4
        if w == 0:
            break
        words.append(w)
    info["words"] = words
    n_pulse = info["pulse_bytes"] // 4
    info["pulse_block"] = words[:n_pulse]
    info["repeat_block"] = words[n_pulse:]
    info["declared_matches"] = (info["pulse_bytes"] + info["repeat_bytes"]) == 4 * len(words)
    try:
        raw_t, raw_c = parse_raw_ir_blob_body(blob)
        info["raw_parser"] = {
            "ok": True,
            "carrier_hz": raw_c,
            "count": len(raw_t),
            "same_words": raw_t == words,
        }
    except ValueError as exc:
        info["raw_parser"] = {"ok": False, "error": str(exc)}
    return info


# --- comparison -------------------------------------------------------------


def compare(sent: list[int], learned: list[int]) -> dict[str, Any]:
    """Word-wise alignment, trailing gap excluded from the verdict."""
    n = min(len(sent), len(learned))
    body = n - 1 if n > 1 else n  # last word of the shorter is a gap
    deltas = [learned[k] - sent[k] for k in range(body)]
    marks = deltas[0::2]
    spaces = deltas[1::2]
    within = []
    for k in range(body):
        tol = max(TOL_US, sent[k] * TOL_PCT / 100)
        within.append(abs(deltas[k]) <= tol)

    def stat(xs: list[int]) -> dict[str, Any]:
        return {
            "n": len(xs),
            "mean": round(statistics.fmean(xs), 1) if xs else None,
            "max_abs": max((abs(x) for x in xs), default=None),
        }

    return {
        "sent_count": len(sent),
        "learned_count": len(learned),
        "compared": body,
        "count_match": len(sent) == len(learned),
        "mark_bias_us": stat(marks),
        "space_bias_us": stat(spaces),
        "out_of_tolerance": [k for k, ok in enumerate(within) if not ok],
        "timing_pass": all(within) and len(sent) == len(learned),
        "sent_gap": sent[-1] if sent else None,
        "learned_gap": learned[-1] if learned else None,
        "deltas": deltas,
    }


# --- IrpTransmogrifier --------------------------------------------------------

_DECODE_RE = re.compile(r"^\s*(?P<proto>[\w\-]+):\s*\{(?P<params>[^}]*)\}")


def irp_decode(words: list[int], carrier_hz: int) -> dict[str, Any]:
    java = IRP_HOME / "jre-x86-windows" / "bin" / "java.exe"
    jar = IRP_HOME / "IrScrutinizer.jar"
    if not (java.is_file() and jar.is_file()):
        return {"available": False, "reason": f"no IrScrutinizer at {IRP_HOME}"}
    seq = list(words)
    if len(seq) % 2:
        seq.append(GAP_US)
    cmd = [
        str(java),
        "-cp",
        str(jar),
        "org.harctoolbox.irp.IrpTransmogrifier",
        "decode",
        "-f",
        str(carrier_hz),
        *map(str, seq),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": True, "error": str(exc)}
    decodes = []
    for line in proc.stdout.splitlines():
        m = _DECODE_RE.match(line)
        if m:
            params = dict(
                kv.strip().split("=", 1)
                for kv in m.group("params").split(",")
                if "=" in kv
            )
            decodes.append({"protocol": m.group("proto"), "params": params})
    return {
        "available": True,
        "decodes": decodes,
        "raw": proc.stdout.strip() or proc.stderr.strip(),
    }


def decode_key(d: dict[str, Any]) -> str | None:
    ds = d.get("decodes") or []
    if not ds:
        return None
    first = ds[0]
    params = ",".join(f"{k}={v}" for k, v in sorted(first["params"].items()))
    return f"{first['protocol']}{{{params}}}"


# ---------------------------------------------------------------------------
# the loop
# ---------------------------------------------------------------------------


def run_loop(emitter: Any, learner: Any, source: Source, idx: int) -> dict[str, Any]:
    result: dict[str, Any] = {
        "loop": idx,
        "label": source.label,
        "requested_carrier_hz": source.carrier,
        "sent_words": source.sent_words,
        "blob_hex": source.blob.hex(" ") if source.blob else None,
        "meta": source.meta,
    }
    box: dict[str, Any] = {}

    def learn() -> None:
        t0 = time.monotonic()
        rearms = 0
        while True:
            remaining = LEARN_TIMEOUT - (time.monotonic() - t0)
            if remaining <= 0.5:
                box["result"] = {"state": "timed_out", "timeout_s": LEARN_TIMEOUT}
                break
            res = learner.ir_learn_command(timeout=remaining)
            if (
                REARM_ON_FAILED
                and res
                and res.get("state") == "interrupted"
                and "IR_LEARN_FAILED" in str(res.get("interrupted_by"))
                and rearms < 5
            ):
                rearms += 1  # undecodable energy (e.g. the X2 reset blips): listen again
                continue
            box["result"] = res
            break
        box["rearms"] = rearms
        box["seconds"] = round(time.monotonic() - t0, 3)

    def do_ha_call() -> None:
        t0 = time.monotonic()
        try:
            ha_call_service(source.meta["service"], source.meta["data"])
            ok = True
        except Exception as exc:  # noqa: BLE001 - bench diagnostics
            ok = False
            result["ha_error"] = str(exc)
        result["play"] = {"ok": ok, "seconds": round(time.monotonic() - t0, 3), "via": "ha"}
        print(f"  ha call: {'OK' if ok else 'FAILED ' + result.get('ha_error', '')} "
              f"in {result['play']['seconds']:.3f}s")

    th = threading.Thread(target=learn, name="learner", daemon=True)
    ha_thread: threading.Thread | None = None
    if MODE == "ha" and LEAD_S < 0:
        # Negative lead: issue the HA call first and arm the learner -LEAD_S
        # seconds later (e.g. between the X2 reset blips and the descriptor).
        ha_thread = threading.Thread(target=do_ha_call, name="ha-call", daemon=True)
        ha_thread.start()
        time.sleep(-LEAD_S)
        th.start()
    else:
        th.start()
        time.sleep(LEAD_S)

    if source.meta.get("stored") and emitter is not None:
        dev, key = source.meta["stored"]
        t0 = time.monotonic()
        ok = emitter.send_command(dev, key)
        result["play"] = {"ok": bool(ok), "seconds": round(time.monotonic() - t0, 3), "via": "stored"}
        print(f"  stored command dev {dev} key {key}: {'queued' if ok else 'REFUSED'}")
    elif source.blob is not None and emitter is not None:
        t0 = time.monotonic()
        ok = emitter.play_ir_blob(source.blob, ack_timeout=ACK_TIMEOUT)
        result["play"] = {"ok": bool(ok), "seconds": round(time.monotonic() - t0, 3)}
        print(f"  play: {'ACKED' if ok else 'REJECTED'} in {result['play']['seconds']:.3f}s")
    elif MODE == "ha":
        before = ha_intercept_payload(HA_INTERCEPT)[0] if HA_INTERCEPT else None
        if ha_thread is not None:
            ha_thread.join()
        else:
            do_ha_call()
        if HA_INTERCEPT:
            time.sleep(1.0)
            payload_hex, attrs = ha_intercept_payload(HA_INTERCEPT)
            result["intercept"] = attrs
            if payload_hex and payload_hex != before:
                try:
                    blob = bytes.fromhex(payload_hex)
                    source.timings, source.carrier = parse_raw_ir_blob_body(blob)
                    source.blob = blob
                    result["sent_words"] = source.sent_words
                    result["requested_carrier_hz"] = source.carrier
                    result["blob_hex"] = blob.hex(" ")
                    print(f"  intercept: {attrs.get('state')} -> {len(source.timings)} words, "
                          f"carrier {source.carrier} Hz")
                except ValueError as exc:
                    print(f"  intercept payload unparseable: {exc}")
            else:
                print(f"  intercept: no new record (state {attrs.get('state')})")
    else:
        print(f"  no emission; operator: press the remote now (window {LEARN_TIMEOUT:.0f}s)")

    th.join(LEARN_TIMEOUT + 10)
    learn_result = box.get("result")
    result["learn"] = learn_result
    result["learn_seconds"] = box.get("seconds")
    result["learn_rearms"] = box.get("rearms", 0)
    if box.get("rearms"):
        print(f"  learner re-armed {box['rearms']}x after undecodable energy")
    if not learn_result or learn_result.get("state") != "learned":
        state = (learn_result or {}).get("state", "no-result")
        extra = (learn_result or {}).get("interrupted_by", "")
        print(f"  learn: {state} {extra}".rstrip())
        return result

    payload_hex = learn_result.get("payload_hex")
    if not payload_hex:
        print("  learn: capture received but blob extraction failed")
        return result
    blob = bytes.fromhex(payload_hex)
    learned = parse_learned_blob(blob)
    result["learned"] = learned
    print(
        f"  learned: {len(learned['words'])} words, carrier {learned['carrier_hz']} Hz, "
        f"sign {learned['sign']}, pulse {learned['pulse_bytes']}B repeat {learned['repeat_bytes']}B"
        f"{'' if learned['declared_matches'] else ' (DECLARED LENGTH MISMATCH)'}"
    )
    if not learned["raw_parser"].get("ok") or not learned["raw_parser"].get("same_words"):
        print(f"  raw parser disagrees: {learned['raw_parser']}")

    learned_words = learned["pulse_block"] or learned["words"]
    if learned["carrier_hz"]:
        result["learned_pronto"] = render_pronto_hex(learned_words, learned["carrier_hz"])

    sent = source.sent_words
    if sent:
        cmp = compare(sent, learned_words)
        result["compare"] = cmp
        if source.carrier:
            result["carrier_delta_hz"] = learned["carrier_hz"] - source.carrier
            result["carrier_delta_pct"] = round(
                100 * result["carrier_delta_hz"] / source.carrier, 2
            )
        verdict = (
            "PASS"
            if cmp["timing_pass"]
            else "out of tolerance at " + str(cmp["out_of_tolerance"][:8])
            + ("" if cmp["count_match"] else " (COUNT MISMATCH)")
        )
        print(
            f"  timings: sent {cmp['sent_count']} / learned {cmp['learned_count']}, "
            f"mark bias {cmp['mark_bias_us']['mean']} us (max {cmp['mark_bias_us']['max_abs']}), "
            f"space bias {cmp['space_bias_us']['mean']} us (max {cmp['space_bias_us']['max_abs']}), "
            f"{verdict}"
        )
        print(
            f"  carrier: requested {source.carrier} -> learned {learned['carrier_hz']} "
            f"({result.get('carrier_delta_pct', '?')}%)"
        )

    if DECODE:
        # Content verdict: decode BOTH sequences at the requested carrier so
        # emitter/learner carrier drift (reported separately above) cannot
        # mask or fake a timing-content match. The learned sequence is also
        # decoded at its measured carrier for the record.
        nominal = source.carrier or learned["carrier_hz"] or 38000
        dl = irp_decode(learned_words, nominal)
        result["decode_learned"] = dl
        if learned["carrier_hz"] and learned["carrier_hz"] != nominal:
            result["decode_learned_at_measured"] = irp_decode(
                learned_words, learned["carrier_hz"]
            )
        if not dl.get("available"):
            print(f"  decoder unavailable: {dl.get('reason')}")
        elif sent and source.carrier:
            ds = irp_decode(sent, source.carrier)
            result["decode_sent"] = ds
            ks, kl = decode_key(ds), decode_key(dl)
            if ks is None and kl is None:
                # the decoder refuses both (e.g. NEC at a 33 kHz carrier):
                # no content verdict either way, not a mismatch
                verdict = "UNDECODABLE"
            else:
                result["decode_match"] = ks is not None and ks == kl
                verdict = "MATCH" if result["decode_match"] else "MISMATCH"
            print(f"  decode: sent {ks or '(none)'} | learned {kl or '(none)'} -> {verdict}")
        elif source.meta.get("expected"):
            kl = decode_key(dl)
            result["expected"] = source.meta["expected"]
            result["decode_match"] = kl is not None and kl == source.meta["expected"]
            print(
                f"  decode: expected {source.meta['expected']} | learned {kl or '(none)'} -> "
                f"{'MATCH' if result['decode_match'] else 'MISMATCH'}"
                + (f"  [all: {'; '.join(d['protocol'] + str(d['params']) for d in dl.get('decodes') or [])}]"
                   if not result['decode_match'] and dl.get('decodes') else "")
            )
        else:
            print(f"  decode: learned {decode_key(dl) or '(none)'}  "
                  f"[all: {'; '.join(d['protocol'] + str(d['params']) for d in dl.get('decodes') or [])}]")
    return result


sources = build_sources()
print(f"emitter {EMIT_HOST} ({EMIT_VER})  learner {LEARN_HOST} ({LEARN_VER})")
print(
    f"{len(sources)} source(s) x {TIMES} loop(s); "
    f"learn window {LEARN_TIMEOUT:.0f}s, lead {LEAD_S}s"
)

artifacts: dict[str, Any] = {
    "emitter": {"host": EMIT_HOST, "version": EMIT_VER},
    "learner": {"host": LEARN_HOST, "version": LEARN_VER},
    "mode": MODE,
    "args": rest,
    "gap_us": GAP_US,
    "tolerance": {"us": TOL_US, "pct": TOL_PCT},
    "loops": [],
}

emitter = learner = None
try:
    if MODE not in ("none", "ha"):
        emitter = connect(EMIT_HOST, EMIT_VER)
    learner = connect(LEARN_HOST, LEARN_VER)
    for source in sources:
        print(
            f"\n== {source.label}: {len(source.timings or [])} timings, "
            f"carrier {source.carrier} Hz"
        )
        for n in range(TIMES):
            if n:
                time.sleep(1.0)
            if RESET_RAW and emitter is not None:
                reset_blob = build_raw_ir_blob_body([9000, 4500, 560, 560, 560, 1690, 560], 38000)
                ok = emitter.play_ir_blob(reset_blob, ack_timeout=ACK_TIMEOUT)
                print(f"  reset-raw: {'ACKED' if ok else 'REJECTED'}")
                time.sleep(0.8)
            print(f" loop {n + 1}/{TIMES}")
            artifacts["loops"].append(run_loop(emitter, learner, source, n + 1))
            if CANARY and emitter is not None:
                time.sleep(0.8)
                canary = Source(f"canary {CANARY}", None, None,
                                blob=render_ir_descriptive_blob_body(CANARY),
                                meta={"descriptor": CANARY, "expected": CANARY_EXPECT,
                                      "canary_for": source.label})
                m = re.search(r"\bR:(\d+)", CANARY)
                canary.carrier = int(m.group(1)) if m else None
                print("  canary:")
                res = run_loop(emitter, learner, canary, n + 1)
                res["canary_for"] = source.label
                artifacts["loops"].append(res)
                if CANARY_EXPECT:
                    wedged = not res.get("decode_match")
                    artifacts["loops"][-2]["left_parser_wedged"] = wedged
                    print(f"  parser after '{source.label}': {'WEDGED' if wedged else 'clean'}")
finally:
    out = save_json(f"ir-loopback-{TAG}", artifacts)
    for p in (emitter, learner):
        if p is not None:
            p.stop()
    print(f"\nsaved {out}")

# summary + exit code
loops = artifacts["loops"]
learned_n = sum(1 for lp in loops if lp.get("learned"))
timing_ok = sum(1 for lp in loops if lp.get("compare", {}).get("timing_pass"))
decode_n = sum(1 for lp in loops if "decode_match" in lp)
decode_ok = sum(1 for lp in loops if lp.get("decode_match"))
print(
    f"summary: {learned_n}/{len(loops)} learned, {timing_ok} within tolerance, "
    f"{decode_ok}/{decode_n} decode matches"
)
failed = learned_n < len(loops) or (decode_n and decode_ok < decode_n)
sys.exit(1 if failed else 0)
