"""RF blob parsing and bit decoding for the RF editor bench (bench_343).

Bench-local, not product code. Layout per docs/internal/rf-bridge-plan.md
section 1 (hypotheses H1-H5): BE16 byte count of the rest, one count byte
(durations after the first word), LE16 inter-frame gap, then LE16
durations in microseconds alternating on/off, starting and ending on.
"""

from __future__ import annotations

from typing import Any


def parse_rf_blob(blob: bytes) -> dict[str, Any]:
    if len(blob) < 7:
        return {"ok": False, "error": f"blob too short ({len(blob)}B)"}
    byte_count = int.from_bytes(blob[0:2], "big")
    count_byte = blob[2]
    gap_us = int.from_bytes(blob[3:5], "little")
    body = blob[5:]
    durations = [int.from_bytes(body[i:i + 2], "little") for i in range(0, len(body) - 1, 2)]
    return {
        "ok": True,
        "length": len(blob),
        "byte_count": byte_count,
        "be16_matches_length": byte_count == len(blob) - 2,
        "count_byte": count_byte,
        "count_matches": count_byte == len(durations),
        "odd_count": len(durations) % 2 == 1,
        "gap_us": gap_us,
        "durations": durations,
    }


def decode_bits(durations: list[int]) -> dict[str, Any]:
    """Short/long clustering, then bits read in both pairings.

    ``pairs_from_0`` pairs (d0,d1), (d2,d3)...; ``pairs_from_1`` pairs
    (d1,d2), (d3,d4)... A bit is 1 when the first element of its pair is
    the long one. Whichever framing the protocol uses, the same signal
    gives the same strings, so comparing both strings is the verdict.
    """

    if len(durations) < 4:
        return {"ok": False}
    lo, hi = min(durations), max(durations)
    threshold = (lo + hi) / 2
    short = [d for d in durations if d < threshold]
    long_ = [d for d in durations if d >= threshold]
    unit = round(sum(short) / len(short)) if short else None

    def read(start: int) -> str:
        bits = []
        for i in range(start, len(durations) - 1, 2):
            a, b = durations[i], durations[i + 1]
            bits.append("1" if a >= threshold > b else "0" if b >= threshold > a else "?")
        return "".join(bits)

    p0, p1 = read(0), read(1)
    return {
        "ok": True,
        "unit_us": unit,
        "long_us": round(sum(long_) / len(long_)) if long_ else None,
        "pairs_from_0": p0,
        "pairs_from_1": p1,
        # The protocol's own pairing reads clean; the other one is mostly "?".
        "best": p0 if p0.count("?") <= p1.count("?") else p1,
    }


def bits_hex(bits: str) -> str:
    clean = bits.replace("?", "")
    if not clean:
        return ""
    return f"{int(clean, 2):0{(len(clean) + 3) // 4}X}"


def compare_blobs(sent: bytes, learned: bytes) -> dict[str, Any]:
    ps, pl = parse_rf_blob(sent), parse_rf_blob(learned)
    out: dict[str, Any] = {"sent": {k: v for k, v in ps.items() if k != "durations"},
                           "learned": {k: v for k, v in pl.items() if k != "durations"}}
    if not (ps.get("ok") and pl.get("ok")):
        out["match"] = False
        return out
    ds, dl = decode_bits(ps["durations"]), decode_bits(pl["durations"])
    out["sent_bits"] = {k: ds.get(k) for k in ("unit_us", "long_us", "best")}
    out["learned_bits"] = {k: dl.get(k) for k in ("unit_us", "long_us", "best")}
    out["sent_hex"] = bits_hex(ds.get("best", "")) if ds.get("ok") else None
    out["learned_hex"] = bits_hex(dl.get("best", "")) if dl.get("ok") else None
    out["match"] = bool(ds.get("ok") and dl.get("ok")) and "?" not in ds["best"] and ds["best"] == dl["best"]
    n = min(len(ps["durations"]), len(pl["durations"]))
    deltas = [pl["durations"][i] - ps["durations"][i] for i in range(n)]
    out["max_abs_delta_us"] = max(map(abs, deltas)) if deltas else None
    out["duration_counts"] = [len(ps["durations"]), len(pl["durations"])]
    out["bytes_equal"] = sent == learned
    return out
