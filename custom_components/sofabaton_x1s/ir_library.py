"""Catalog over the HA ``infrared-protocols`` code library.

The pip library behind Home Assistant's Infrared platform ships curated,
per-brand IR code sets (``infrared_protocols.codes.<brand>.<model>``:
``IntEnum`` classes whose members render to protocol commands via
``to_command()``). This module enumerates those code sets and renders each
command into a Sofabaton raw IR blob (via the live-validated
``build_raw_ir_blob_body``), so the frontend can offer a browse / test /
persist flow without any consumer integration installed.

Roadmap and validation trail: docs/internal/ha-infrared-plan.md (IR1).

Design notes:

* The library must never break entry setup or WS registration: every
  public function degrades to an "unavailable" result when the import
  fails, and per-module scan errors skip that module only.
* Only argless code sets are cataloged (every ``to_command`` parameter
  beyond ``self`` has a default). Parameterized encoders (AC/climate)
  are tier-3 territory (interception), not browsable codes.
* The brand directories in the installed wheel are namespace packages
  (no ``__init__.py``), so enumeration walks the package ``__path__``
  on disk rather than ``pkgutil``.
* Repeat policy is an AUTHORING choice for persisted payloads, not a
  protocol necessity: live use of the Samsung Infrared integration
  proved single frames control the TV, and repeats in the HA contract
  are always the sender's concern (already unrolled into
  ``get_raw_timings``). samsung=1 mirrors the vendor cloud's own
  two-frame deploys for robustness at distance/angle; sony=2 is the
  same reasoning for Sony's conventional multi-frame sends. The emitter
  entity applies NO policy - it transmits exactly what it is handed.
"""

from __future__ import annotations

import enum
import inspect
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from importlib import import_module
from pathlib import Path
from typing import Any

from .lib.blob_decoders import build_raw_ir_blob_body

_LOGGER = logging.getLogger(__name__)

#: Per-brand repeat_count passed to ``to_command`` when AUTHORING
#: persisted payloads (robustness choice mirroring vendor-cloud deploys;
#: single frames are sufficient per live Samsung Infrared use - see the
#: module docstring and plan section 10).
REPEAT_POLICY: dict[str, int] = {
    "samsung": 1,
    "sony": 2,
}
DEFAULT_REPEAT_COUNT = 0

#: Brand keys whose display label is not a simple title-case of the key.
_BRAND_LABELS: dict[str, str] = {
    "lg": "LG",
    "tcl": "TCL",
    "jvc": "JVC",
    "nec": "NEC",
    "general_electric": "General Electric",
}

#: Uppercase-preserved tokens inside prettified labels.
_ACRONYMS = {"tv", "hdmi", "usb", "av", "ir", "led", "osd", "3d", "dvd", "vcr", "psx"}


def _prettify(token: str) -> str:
    """``VOLUME_UP`` -> ``Volume up``, ``aquos_tv`` -> ``Aquos TV``."""

    words = [w for w in token.replace("-", "_").split("_") if w]
    out: list[str] = []
    for i, word in enumerate(words):
        lower = word.lower()
        if lower in _ACRONYMS:
            out.append(lower.upper())
        elif i == 0:
            out.append(lower.capitalize())
        else:
            out.append(lower)
    return " ".join(out) or token


def brand_label(brand_key: str) -> str:
    label = _BRAND_LABELS.get(brand_key)
    if label is not None:
        return label
    return " ".join(w.capitalize() for w in brand_key.split("_"))


@dataclass(frozen=True)
class CodeSet:
    """One browsable code set: a brand + device-type + enum class."""

    brand: str
    device_type: str
    code_class: type[enum.IntEnum] = field(repr=False)

    @property
    def command_count(self) -> int:
        return len(list(self.code_class))


def _to_command_is_argless(code_class: type) -> bool:
    to_command = getattr(code_class, "to_command", None)
    if not callable(to_command):
        return False
    try:
        signature = inspect.signature(to_command)
    except (TypeError, ValueError):
        return False
    return all(
        p.default is not inspect.Parameter.empty
        or p.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)
        for name, p in signature.parameters.items()
        if name != "self"
    )


def _code_sets_in_module(brand: str, device_type: str, module: Any) -> list[CodeSet]:
    found: list[CodeSet] = []
    for name in dir(module):
        obj = getattr(module, name)
        if (
            isinstance(obj, type)
            and issubclass(obj, enum.Enum)
            and name.endswith("Code")
            # Only where the class is defined, not re-exports (shared
            # `models.py` helpers would otherwise duplicate a code set).
            and obj.__module__ == module.__name__
            and len(list(obj)) > 0
            and _to_command_is_argless(obj)
        ):
            found.append(CodeSet(brand=brand, device_type=device_type, code_class=obj))
    return found


def _iter_code_sets() -> list[CodeSet]:
    """Walk ``infrared_protocols.codes`` and collect browsable code sets.

    Raises whatever the top-level import raises; per-module errors are
    logged and skipped. Kept as a seam for tests to monkeypatch.
    """

    codes_pkg = import_module("infrared_protocols.codes")
    sets: list[CodeSet] = []
    seen: set[str] = set()
    # ``codes`` is a PEP 420 namespace package, so ``__path__`` may span
    # several installed distributions; walk them all. When two roots ship
    # the same dotted module, import resolution picks one winner - the
    # ``seen`` guard keeps the catalog from listing it twice.
    for root in codes_pkg.__path__:
        root_path = Path(root)
        for module_file in sorted(root_path.rglob("*.py")):
            relative = module_file.relative_to(root_path)
            parts = [*relative.parts[:-1], relative.stem]
            if any(part.startswith("_") for part in parts) or len(parts) < 2:
                continue
            brand, device_type = parts[0], ".".join(parts[1:])
            dotted = "infrared_protocols.codes." + ".".join(parts)
            if dotted in seen:
                continue
            seen.add(dotted)
            try:
                module = import_module(dotted)
            except Exception:  # noqa: BLE001 - one bad module must not sink the catalog
                _LOGGER.warning("ir_library: failed to import %s; skipping", dotted, exc_info=True)
                continue
            sets.extend(_code_sets_in_module(brand, device_type, module))
    return sets


@lru_cache(maxsize=1)
def _scan() -> tuple[CodeSet, ...] | None:
    """Cached scan; ``None`` means the library is not importable."""

    try:
        return tuple(_iter_code_sets())
    except Exception:  # noqa: BLE001 - degrade to an empty catalog, never break setup
        _LOGGER.warning(
            "ir_library: infrared-protocols is not available; IR library catalog disabled",
            exc_info=True,
        )
        return None


def reset_cache() -> None:
    """Drop the scan cache (tests, or after a dependency change)."""

    _scan.cache_clear()


def repeat_count_for(brand: str) -> int:
    return REPEAT_POLICY.get(brand, DEFAULT_REPEAT_COUNT)


def catalog() -> dict[str, Any]:
    """The browsable catalog: brands -> device types -> command counts."""

    sets = _scan()
    if sets is None:
        return {"available": False, "brands": []}
    brands: dict[str, list[CodeSet]] = {}
    for code_set in sets:
        brands.setdefault(code_set.brand, []).append(code_set)
    return {
        "available": True,
        "brands": [
            {
                "key": brand,
                "label": brand_label(brand),
                "device_types": [
                    {
                        "key": cs.device_type,
                        "label": _prettify(cs.device_type),
                        "command_count": cs.command_count,
                    }
                    for cs in sorted(entries, key=lambda cs: cs.device_type)
                ],
            }
            for brand, entries in sorted(brands.items())
        ],
    }


def commands(brand: str, device_type: str) -> list[dict[str, Any]]:
    """Rendered commands for one code set: label + playable payload hex.

    Raises ``LookupError`` for an unknown brand/device_type and
    ``RuntimeError`` when the library is unavailable. Individual commands
    that fail to render (unexpected encoder behavior, zero carrier) are
    skipped with a log line rather than failing the whole list.
    """

    sets = _scan()
    if sets is None:
        raise RuntimeError("infrared-protocols is not available")
    code_set = next(
        (cs for cs in sets if cs.brand == brand and cs.device_type == device_type),
        None,
    )
    if code_set is None:
        raise LookupError(f"unknown IR library code set: {brand}/{device_type}")

    repeat_count = repeat_count_for(brand)
    rendered: list[dict[str, Any]] = []
    for member in code_set.code_class:
        try:
            command = member.to_command(repeat_count=repeat_count)
            carrier_hz = int(command.modulation)
            blob = build_raw_ir_blob_body(
                [int(t) for t in command.get_raw_timings()], carrier_hz
            )
        except Exception:  # noqa: BLE001 - skip unrenderable members, keep the rest
            _LOGGER.warning(
                "ir_library: failed to render %s/%s %s; skipping",
                brand,
                device_type,
                member.name,
                exc_info=True,
            )
            continue
        rendered.append(
            {
                "key": member.name,
                "label": _prettify(member.name),
                "payload_hex": blob.hex(),
                "carrier_hz": carrier_hz,
            }
        )
    return rendered
