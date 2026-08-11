#!/usr/bin/env python3
"""Render the flaky-test quarantine report as markdown.

Reads e2e/quarantine.json (flaky e2e specs) and quarantine-unit.json (flaky
vitest tests) and prints a dated markdown summary: what is quarantined, since
when, for how long, and why. Used by the weekly Quarantine Check workflow to
maintain a single report issue; runnable locally:

    python3 scripts/flaky-report.py
"""

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_list(name: str) -> list[dict]:
    path = ROOT / name
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return data if isinstance(data, list) else []


def age_days(since: str | None) -> str:
    if not since:
        return "unknown"
    try:
        return f"{max(0, (date.today() - date.fromisoformat(since)).days)}d"
    except ValueError:
        return "unknown"


def render_table(rows: list[tuple[str, str, str]]) -> str:
    if not rows:
        return "_none_"
    lines = ["| Quarantined | Since | Age | Reason |", "|---|---|---|---|"]
    for name, since, reason in rows:
        lines.append(f"| {name} | {since or '—'} | {age_days(since)} | {reason} |")
    return "\n".join(lines)


def main() -> None:
    today = date.today()
    e2e = load_list("e2e/quarantine.json")
    unit = load_list("quarantine-unit.json")

    lines = [
        "# Flaky test quarantine report",
        "",
        f"_As of {today.isoformat()} — updated weekly by the Quarantine Check workflow._",
        "",
        "Quarantined tests are skipped in CI (see CLAUDE.md → Testing) and are "
        "re-tested weekly; they are unquarantined automatically once they pass "
        "three consecutive clean runs.",
        "",
    ]

    lines.append("## E2E specs (`e2e/quarantine.json`)")
    lines.append("")
    lines.append(render_table([(e.get("spec", "?"), e.get("since"), e.get("reason", "")) for e in e2e]))
    lines.append("")

    lines.append("## Unit tests (`quarantine-unit.json`)")
    lines.append("")
    lines.append(
        render_table(
            [(f"{e.get('id', '?')} · {e.get('file', '?')}", e.get("since"), e.get("reason", "")) for e in unit]
        )
    )
    lines.append("")

    total = len(e2e) + len(unit)
    lines.append(f"---")
    lines.append(f"**{total} item(s) quarantined.**" if total else "**Nothing quarantined — all green.**")
    lines.append("")

    print("\n".join(lines))


if __name__ == "__main__":
    main()
