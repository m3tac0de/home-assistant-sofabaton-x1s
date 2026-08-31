"""Intercepted-IR bookkeeping for the emitter entity (IR5).

Every command a consumer integration sends through the hub's infrared
emitter is recorded here: the raw timings, the hub-ready payload hex,
and the facts the command object itself carries. The intercept sensor
surfaces the result so users can persist working commands through the
existing payload editor's Test/Save flow - this is the only capture
path for state-dependent codes (AC climate frames are generated per
state change and exist nowhere else).

Deliberately dependency-free and interpretation-free: the HA infrared
contract hands the emitter a command object with ``modulation`` and
``get_raw_timings()`` and nothing else, so the record claims nothing
more - the label is the command's own class name plus a payload digest
(stable per code, so identical sends read identically), and the repr is
included only when the class defines one. No lookup against the
``infrared-protocols`` code sets: that would label curated enum sends
nicely and silently degrade for parameterized (AC), third-party, and
Pronto commands, pretending to metadata the contract does not provide.

Roadmap: docs/internal/ha-infrared-plan.md (IR5, re-scope 1a).
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

MAX_EMISSIONS = 20


def describe_command(command: Any, blob: bytes) -> str:
    """Factual label: the command's class name + a short payload digest.

    The digest distinguishes different codes of the same protocol class
    and is stable across sends of the same code.
    """

    digest = hashlib.sha1(blob).hexdigest()[:8]
    return f"{type(command).__name__} ({digest})"


def build_emission_record(
    *, command: Any, timings: list[int], carrier_hz: int, blob: bytes
) -> dict[str, Any]:
    """The ring-buffer entry for one emitter send."""

    return {
        "label": describe_command(command, blob),
        "command_repr": repr(command)
        if type(command).__repr__ is not object.__repr__
        else type(command).__name__,
        "carrier_hz": int(carrier_hz),
        "timing_count": len(timings),
        "payload_hex": blob.hex(),
        "when": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": 1,
    }
