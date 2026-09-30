"""The cards' WS messages must fit the handlers' schemas (CR-X2-7).

HA validates every WS message against the handler's voluptuous schema and
answers invalid_format for a key the schema does not list, or for a
missing Required key. conftest keeps the schema on the handler
(``_ws_schema``), so this guard reads both sides: every
``type: "sofabaton_x1s/..."`` object literal in the tools card and the
remote card, and every registered handler's schema. A rename on either
side then fails here instead of as a silent no-op on a live HA.
"""

from __future__ import annotations

import re
from pathlib import Path

import importlib
from custom_components.sofabaton_x1s.const import DOMAIN

# The package's __init__ module itself: a test module collected earlier may
# have installed a bare stub for the package (tests._stub_packages), whose
# namespace holds no handlers.
integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ROOTS = (
    ROOT / "custom_components" / "sofabaton_x1s" / "www" / "src",
    ROOT / "remote-card" / "src",
)

# Commands with no frontend caller, and why (update consciously, L-X1).
NO_FRONTEND_CALLER: dict[str, str] = {
    "sofabaton_x1s/ir_library/catalog": "L-K2: the dormant IR catalog, IR browser parked",
    "sofabaton_x1s/ir_library/commands": "L-K2: the dormant IR catalog, IR browser parked",
    "sofabaton_x1s/activity/sync_plan": "bench and debug API since the review dialog went (CR-X2-3)",
    "sofabaton_x1s/device/sync_plan": "bench and debug API since the review dialog went (CR-X2-3)",
}

_TYPE_RE = re.compile(r"""type\s*:\s*["'](sofabaton_x1s/[a-z0-9_/]+)["']""")
_KEY_RE = re.compile(r"""([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*([:,}])""")
_INNER_KEY_RE = re.compile(r"""[{,]\s*([A-Za-z_$][\w$]*)\s*[:,}]""")
_CLOSE = {"{": "}", "(": ")", "[": "]"}


def _skip_string(text: str, i: int) -> int:
    """Index just past the string or template literal that starts at i."""
    quote = text[i]
    i += 1
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if quote == "`" and text.startswith("${", i):
            i = _skip_group(text, i + 1)
            continue
        if ch == quote:
            return i + 1
        i += 1
    raise ValueError("unterminated string")


def _skip_group(text: str, i: int) -> int:
    """Index just past the bracket group that opens at i."""
    stack = [_CLOSE[text[i]]]
    i += 1
    while stack:
        ch = text[i]
        if ch in "\"'`":
            i = _skip_string(text, i)
            continue
        if text.startswith("//", i):
            i = text.index("\n", i)
            continue
        if ch in _CLOSE:
            stack.append(_CLOSE[ch])
        elif ch == stack[-1]:
            stack.pop()
        i += 1
    return i


def _object_start(text: str, type_index: int) -> int:
    """The '{' that opens the object literal holding the type key."""
    depth = 0
    for i in range(type_index - 1, -1, -1):
        ch = text[i]
        if ch in "})]":
            depth += 1
        elif ch in "{([":
            if depth == 0:
                assert ch == "{", "the type key is not inside an object literal"
                return i
            depth -= 1
    raise ValueError("no enclosing object literal")


def _object_keys(text: str, start: int) -> tuple[set[str], set[str]]:
    """(keys always sent, keys a spread may add) of the literal at start."""
    end = _skip_group(text, start) - 1
    always: set[str] = set()
    maybe: set[str] = set()
    i = start + 1
    while i < end:
        while i < end and (text[i].isspace() or text[i] == ","):
            i += 1
        if i >= end:
            break
        entry_start = i
        # the entry runs to the next top-level comma
        while i < end and text[i] != ",":
            if text[i] in "\"'`":
                i = _skip_string(text, i)
            elif text[i] in _CLOSE:
                i = _skip_group(text, i)
            else:
                i += 1
        entry = text[entry_start:i]
        if entry.startswith("..."):
            maybe.update(_INNER_KEY_RE.findall(entry))
            continue
        match = _KEY_RE.match(entry + "}")
        assert match, f"unparsed entry: {entry!r}"
        always.add(match.group(1).strip("\"'"))
    return always, maybe


def _frontend_calls() -> list[tuple[str, str, set[str], set[str]]]:
    calls = []
    for root in FRONTEND_ROOTS:
        for path in sorted(root.rglob("*.ts")):
            text = path.read_text(encoding="utf-8")
            for match in _TYPE_RE.finditer(text):
                start = _object_start(text, match.start())
                always, maybe = _object_keys(text, start)
                line = text.count("\n", 0, match.start()) + 1
                where = f"{path.relative_to(ROOT).as_posix()}:{line}"
                calls.append((where, match.group(1), always, maybe))
    return calls


def _schemas() -> dict[str, tuple[set[str], set[str]]]:
    schemas: dict[str, tuple[set[str], set[str]]] = {}
    for name, handler in vars(integration).items():
        schema = getattr(handler, "_ws_schema", None)
        if not name.startswith("_ws_") or schema is None:
            continue
        required = {str(key) for key in schema if getattr(key, "required", False)}
        optional = {str(key) for key in schema if not getattr(key, "required", False)}
        command = schema["type"]
        assert command not in schemas, f"{command} is registered twice"
        schemas[command] = (required - {"type"}, optional)
    return schemas


def test_the_scan_finds_both_sides() -> None:
    schemas = _schemas()
    calls = _frontend_calls()
    assert len(schemas) >= 40, "handler scan is stale"
    assert len(calls) >= 50, "frontend scan is stale"
    assert all(command.startswith(f"{DOMAIN}/") for command in schemas)


def test_every_frontend_message_fits_its_schema() -> None:
    schemas = _schemas()
    problems = []
    for where, command, always, maybe in _frontend_calls():
        if command not in schemas:
            problems.append(f"{where}: {command} has no handler")
            continue
        required, optional = schemas[command]
        allowed = required | optional | {"type"}
        extra = sorted((always | maybe) - allowed)
        if extra:
            problems.append(f"{where}: {command} sends keys the schema rejects: {extra}")
        missing = sorted(required - always)
        if missing:
            problems.append(f"{where}: {command} omits required keys: {missing}")
    assert not problems, "\n".join(problems)


def test_every_command_has_a_frontend_caller_or_a_reason() -> None:
    called = {command for _where, command, _always, _maybe in _frontend_calls()}
    uncalled = sorted(set(_schemas()) - called - set(NO_FRONTEND_CALLER))
    assert not uncalled, f"WS commands without a frontend caller: {uncalled}"
    stale = sorted(set(NO_FRONTEND_CALLER) & called)
    assert not stale, f"allowlisted but called: {stale}"


def test_the_literal_parser_reads_shorthand_spreads_and_nesting() -> None:
    text = """x({ type: "sofabaton_x1s/a", entry_id, nested: { inner: 1 }, list: [1, { no: 2 }],
      label: `a,${b ? "}" : "{"}`, ...(flag ? { device_ids: ids } : {}) })"""
    start = _object_start(text, text.index("type"))
    assert _object_keys(text, start) == ({"type", "entry_id", "nested", "list", "label"}, {"device_ids"})
