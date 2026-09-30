"""List the open code-review findings for a fix batch, with their details.

    python scripts/review/batch_findings.py lib/models.py lib/hub_logging.py ...
    python scripts/review/batch_findings.py --ids CR-L1-1 CR-L1-2

Reads the ledger (docs/internal/code-review-findings.md) for status and
disposition, and the per-tier detail files in docs/internal/code-review-r2/
for scenario and suggested fix. Local tooling for the R5 fix phase.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
LEDGER = ROOT / "docs" / "internal" / "code-review-findings.md"
DETAILS = sorted((ROOT / "docs" / "internal" / "code-review-r2").glob("*-details.md"))
SPLIT = re.compile(r"(?<!\\)\|")


def ledger_rows() -> list[dict]:
    rows = []
    for line in LEDGER.read_text(encoding="utf-8").split("\n"):
        if not line.startswith("| CR-"):
            continue
        p = [x.strip() for x in SPLIT.split(line)]
        if len(p) != 12:
            continue
        if p[1].startswith("CR-R1"):
            rows.append(dict(id=p[1], where=p[3], sev=p[5], title=p[6], proof=p[7], disp=p[9], status=p[10]))
        else:
            rows.append(dict(id=p[1], where=p[2], sev=p[4], title=p[7], proof=p[6], disp=p[9], status=p[10]))
    return rows


def details() -> dict[str, str]:
    out: dict[str, str] = {}
    for path in DETAILS:
        text = path.read_text(encoding="utf-8")
        for block in re.split(r"\n(?=## CR-)", text):
            m = re.match(r"## (CR-[A-Za-z0-9]+-\d+):", block)
            if m:
                out[m.group(1)] = block
    return out


def main() -> None:
    args = sys.argv[1:]
    by_id = args and args[0] == "--ids"
    wanted = args[1:] if by_id else args
    det = details()
    for row in ledger_rows():
        if row["status"] not in ("open", "parked") and not by_id:
            continue
        hit = row["id"] in wanted if by_id else any(w in row["where"] for w in wanted)
        if not hit:
            continue
        print("=" * 100)
        print(f"{row['id']} [{row['sev']}] {row['status']} | {row['disp']}")
        print(f"  where: {row['where']}")
        print(f"  {row['title'][:600]}")
        block = det.get(row["id"])
        if block:
            fix = re.search(r"\*\*Suggested fix\.\*\* (.*)", block)
            scen = re.search(r"\*\*Scenario\.\*\* (.*)", block)
            if scen:
                print(f"  SCENARIO: {scen.group(1)[:900]}")
            if fix:
                print(f"  FIX: {fix.group(1)[:900]}")


if __name__ == "__main__":
    main()
