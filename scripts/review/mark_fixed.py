"""Mark code-review findings as fixed in docs/internal/code-review-findings.md.

    python scripts/review/mark_fixed.py <commit> CR-L4b-1 [CR-X6-1 ...]

Sets the Status column of each listed row to ``fixed <commit>``. The ledger
lives in the gitignored docs/internal/, so this only edits the local file.
"""

from __future__ import annotations

import pathlib
import re
import sys

LEDGER = pathlib.Path(__file__).resolve().parents[2] / "docs" / "internal" / "code-review-findings.md"
SPLIT = re.compile(r"(?<!\\)\|")


def main() -> int:
    commit, ids = sys.argv[1], set(sys.argv[2:])
    lines = LEDGER.read_text(encoding="utf-8").split("\n")
    seen: set[str] = set()
    for n, line in enumerate(lines):
        if not line.startswith("| CR-"):
            continue
        parts = [x.strip() for x in SPLIT.split(line)]
        if len(parts) != 12 or parts[1] not in ids:
            continue
        parts[10] = f"fixed {commit}"
        lines[n] = "| " + " | ".join(parts[1:-1]) + " |"
        seen.add(parts[1])
    LEDGER.write_text("\n".join(lines), encoding="utf-8")
    missing = ids - seen
    print(f"marked {sorted(seen)}" + (f"; NOT FOUND {sorted(missing)}" if missing else ""))
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
