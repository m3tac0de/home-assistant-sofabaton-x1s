"""Sequencer boundary lint for the standalone library package.

The hub services one request at a time and silently drops any A->H frame
that arrives while it is streaming a response burst. Every frame must
therefore leave through one of exactly two paths:

* ``X1Proxy.enqueue_cmd`` -> ``BurstScheduler`` (fire-and-forget catalog
  reads), or
* a raw ``_send_cmd_frame`` / ``_send_family_frame`` call inside an
  ``exchange()`` scope (blocking request/response helpers).

This test walks every lib module's AST and fails, with the exact
file:line, on any raw-send call whose enclosing function is not on the
allowlist below.

The AST cannot verify the ``with self.exchange(...)`` scope reliably
enough (decorated/nested forms), so the allowlist IS the contract:
adding a new raw send requires consciously editing the allowlist, and
review of that edit checks that the new send sits inside an exchange
scope (or is scheduler/definition wiring). The inverse is asserted too:
every allowlisted ``(file, function)`` must still contain a raw send,
so stale entries fail loudly.
"""

from __future__ import annotations

import ast
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)

RAW_SEND_ATTRS = {"_send_cmd_frame", "_send_family_frame"}

# Functions allowed to contain a raw-send *call*. Three flavours:
#   * definition chains (_send_family_frame -> _send_cmd_frame,
#     _send_family_play_frame -> _send_cmd_frame);
#   * the exchange executor itself (_execute_exchange_attempt runs
#     inside execute_exchange's scope);
#   * helpers whose raw send sits inside their own ``exchange()`` scope
#     (the migration table in
#     docs/internal/sequencer-consolidation-plan.md section 4).
# Passing the bound method as a *callback reference* (enqueue_cmd /
# _handle_idle handing ``self._send_cmd_frame`` to the BurstScheduler)
# is not a call and needs no entry here.
ALLOWED: set[tuple[str, str]] = {
    ("device_create.py", "run_create_sequence"),
    ("proxy_ack_waiters.py", "query_device_input_index"),
    ("proxy_ack_waiters.py", "fetch_device_input_entries"),
    ("proxy_ack_waiters.py", "fetch_device_input_record"),
    ("proxy_ack_waiters.py", "fetch_device_key_sort"),
    ("proxy_activity_ops.py", "delete_device"),
    ("proxy_activity_ops.py", "add_device_to_activity"),
    ("proxy_activity_ops.py", "request_favorites_order"),
    ("proxy_activity_ops.py", "command_to_favorite"),
    ("proxy_activity_sync.py", "_sync_step_activity_rename"),
    ("proxy_activity_sync.py", "_sync_step_membership_remove"),
    ("proxy_backup.py", "erase_configuration"),
    ("proxy_exchange.py", "_execute_exchange_attempt"),
    ("proxy_ir_blob.py", "_send_family_play_frame"),
    ("proxy_wifi_device.py", "_send_virtual_ip_wifi_publish_finalize"),
    ("proxy_wifi_device.py", "_apply_wifi_input_configuration"),
    ("x1_proxy.py", "_send_family_frame"),
    ("x1_proxy.py", "set_hub_name"),
    ("x1_proxy.py", "_send_paged_macro_save"),
}


def _raw_send_calls(path: Path) -> list[tuple[str | None, int]]:
    """Return ``(enclosing_function_name, lineno)`` for every raw-send call."""

    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: list[tuple[str | None, int]] = []

    def _visit(node: ast.AST, func: str | None) -> None:
        for child in ast.iter_child_nodes(node):
            child_func = func
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                child_func = child.name
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Attribute)
                and child.func.attr in RAW_SEND_ATTRS
            ):
                found.append((func, child.lineno))
            _visit(child, child_func)

    _visit(tree, None)
    return found


def test_raw_sends_only_in_allowlisted_functions() -> None:
    assert LIB_DIR.is_dir(), f"library package not found at {LIB_DIR}"
    problems: list[str] = []
    seen: set[tuple[str, str]] = set()

    for path in sorted(LIB_DIR.glob("*.py")):
        for func, lineno in _raw_send_calls(path):
            if func is None:
                problems.append(
                    f"{path.name}:{lineno} raw send at module level"
                )
                continue
            key = (path.name, func)
            seen.add(key)
            if key not in ALLOWED:
                problems.append(
                    f"{path.name}:{lineno} raw send in {func}() is not "
                    "allowlisted -- route it through enqueue_cmd or wrap it "
                    "in an exchange() scope and add it to ALLOWED in "
                    "tests/lib/test_sequencer_boundary.py"
                )

    assert not problems, (
        "sequencer boundary violations (every A->H frame must flow through "
        "enqueue_cmd or an exchange() scope):\n" + "\n".join(problems)
    )

    stale = ALLOWED - seen
    assert not stale, (
        "stale sequencer allowlist entries (function no longer contains a "
        "raw send -- remove from ALLOWED):\n"
        + "\n".join(f"{f}:{fn}" for f, fn in sorted(stale))
    )
