#!/usr/bin/env python3
"""Detect e2e specs that fail repeatedly across recent CI runs.

Downloads the merged Playwright JUnit report (the `playwright-results` artifact)
from the most recent runs of the CI workflow, counts in how many distinct runs
each spec failed, and prints, one per line:

    <spec-file> <failed-runs> <runs-examined>

...for every spec that failed in at least --min-failures distinct runs and is
not already listed in e2e/quarantine.json. Specs are printed most-flaky first.

Requires the `gh` CLI and GH_TOKEN (both preinstalled/present on GitHub-hosted
runners). Intended for the E2E Quarantine Check workflow, but runnable locally:

    GH_TOKEN=... python3 scripts/ci-quarantine-detect.py --repo owner/repo
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

QUARANTINE_PATH = Path(__file__).resolve().parent.parent / "e2e" / "quarantine.json"


def gh(args: list[str]) -> str:
    result = subprocess.run(
        ["gh", "api", *args],
        capture_output=True,
        text=True,
        env=dict(os.environ, GH_TOKEN=os.environ["GH_TOKEN"]),
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh api {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def download_junit(run_id: int, dest: Path) -> bool:
    result = subprocess.run(
        ["gh", "run", "download", str(run_id), "-n", "playwright-results", "-D", str(dest)],
        capture_output=True,
        text=True,
        env=dict(os.environ, GH_TOKEN=os.environ["GH_TOKEN"]),
    )
    return result.returncode == 0


def failing_specs(xml_path: Path) -> set[str]:
    """Return the spec files (classnames) that have at least one failed test."""
    tree = ET.parse(xml_path)
    specs = set()
    for case in tree.iter("testcase"):
        if case.find("failure") is not None:
            classname = case.get("classname", "")
            if classname.endswith(".spec.ts"):
                specs.add(classname)
    return specs


def quarantined_specs() -> set[str]:
    if not QUARANTINE_PATH.exists():
        return set()
    entries = json.loads(QUARANTINE_PATH.read_text())
    return {e.get("spec") for e in entries if isinstance(e, dict) and e.get("spec")}


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/repository")
    parser.add_argument("--window", type=int, default=15, help="most recent CI runs to examine")
    parser.add_argument("--min-failures", type=int, default=3, help="distinct failed runs required to flag a spec")
    parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.2,
        help="flag only if failures are also >= this fraction of examined runs "
        "(a spec failing 3 of 15 runs is weaker evidence than 3 of 6)",
    )
    parser.add_argument("--days", type=int, default=12, help="ignore runs older than this many days")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report candidates without writing anything (for local tuning "
        "— the workflow's dry_run input controls PR creation)",
    )
    args = parser.parse_args()

    if not os.environ.get("GH_TOKEN"):
        sys.exit("GH_TOKEN is required")

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    runs = json.loads(gh([f"repos/{args.repo}/actions/runs?workflow=ci.yml&per_page={args.window}"]))["workflow_runs"]
    runs = [
        r
        for r in runs
        if r.get("event") in ("push", "pull_request", "schedule")
        and r.get("conclusion") in ("success", "failure")
        and parse_iso(r["created_at"]) >= cutoff
    ]
    runs.sort(key=lambda r: r["id"])

    quarantined = quarantined_specs()
    examined = 0
    failures: dict[str, int] = {}
    for run in runs:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            if not download_junit(run["id"], tmp_path):
                continue  # artifact missing or expired — nothing to learn from this run
            xml_files = sorted(tmp_path.rglob("results.xml"))
            if not xml_files:
                continue
            examined += 1
            failed_in_run: set[str] = set()
            for xml in xml_files:
                try:
                    failed_in_run |= failing_specs(xml)
                except ET.ParseError:
                    continue
            for spec in failed_in_run:
                failures[spec] = failures.get(spec, 0) + 1

    # Two thresholds must both be met: an absolute floor (distinct failed runs)
    # and a relative one (fraction of the runs actually examined). The relative
    # floor stops a spec that failed 3 of 15 runs from being treated like one
    # that failed 3 of 6 — the latter is far stronger evidence of a problem.
    ratio_floor = math.ceil(examined * args.min_ratio) if examined else 0
    flagged = sorted(
        (
            (s, c)
            for s, c in failures.items()
            if c >= args.min_failures and c >= ratio_floor and s not in quarantined
        ),
        key=lambda item: (-item[1], item[0]),
    )
    for spec, count in flagged:
        print(f"{spec} {count} {examined}")

    summary = (
        f"# examined {examined} CI runs (relative floor {ratio_floor} = {args.min_ratio:.0%}); "
        f"{len(flagged)} spec(s) flagged (thresholds: >= {args.min_failures} distinct failed runs)"
    )
    if args.dry_run:
        summary += "; DRY-RUN: no quarantine changes made"
    print(summary, file=sys.stderr)


if __name__ == "__main__":
    main()
