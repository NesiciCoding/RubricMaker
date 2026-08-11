#!/usr/bin/env python3
"""Detect tests that fail repeatedly across recent CI runs.

Downloads the JUnit report artifact (the `playwright-results` artifact for e2e
specs, `unit-results` for unit tests) from the most recent runs of the CI
workflow and counts in how many distinct runs each test failed.

For e2e specs (--kind e2e, the default) it prints, one per line:

    <spec-file> <failed-runs> <runs-examined>

...for every spec that failed in at least --min-failures distinct runs and is
not already listed in e2e/quarantine.json. Specs are printed most-flaky first.

For unit tests (--kind unit) it prints, one per line (tab-separated, since
test ids may contain spaces):

    <file>\t<id>\t<failed-runs>\t<runs-examined>

The id is the test's own title (the last `describe > ...` segment of the JUnit
name), which is what quarantine-unit.json entries key on and what
`vitest run <file> -t <id>` matches. Only ids that are safe to embed in the
it.skipIf(isQuarantined('id')) marker are proposed (alphanumeric, spaces,
underscores, hyphens — titles with quotes or regex metacharacters are skipped,
as the guard test rejects them).

Requires the `gh` CLI and GH_TOKEN (both preinstalled/present on GitHub-hosted
runners). Intended for the Quarantine Check workflow, but runnable locally:

    GH_TOKEN=... python3 scripts/ci-quarantine-detect.py --repo owner/repo
    GH_TOKEN=... python3 scripts/ci-quarantine-detect.py --repo owner/repo --kind unit
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Unit-test ids are embedded in it.skipIf(isQuarantined('id')) and passed to
# `vitest run -t <id>` (a regexp), so they must be regex-safe — the guard test
# enforces exactly this pattern.
UNIT_ID_PATTERN = re.compile(r"^[A-Za-z0-9 _-]+$")

KINDS = {
    "e2e": {
        "artifact": "playwright-results",
        "quarantine": REPO_ROOT / "e2e" / "quarantine.json",
    },
    "unit": {
        "artifact": "unit-results",
        "quarantine": REPO_ROOT / "quarantine-unit.json",
    },
}


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


def download_junit(run_id: int, dest: Path, artifact: str) -> bool:
    result = subprocess.run(
        ["gh", "run", "download", str(run_id), "-n", artifact, "-D", str(dest)],
        capture_output=True,
        text=True,
        env=dict(os.environ, GH_TOKEN=os.environ["GH_TOKEN"]),
    )
    return result.returncode == 0


def failing_e2e_specs(xml_path: Path) -> set[str]:
    """Return the spec files (classnames) that have at least one failed test."""
    tree = ET.parse(xml_path)
    specs = set()
    for case in tree.iter("testcase"):
        if case.find("failure") is not None:
            classname = case.get("classname", "")
            if classname.endswith(".spec.ts"):
                specs.add(classname)
    return specs


def failing_unit_tests(xml_path: Path) -> set[tuple[str, str]]:
    """Return (file, id) pairs for unit tests with at least one failure.

    The id is the test's own title (the last `describe > ...` segment of the
    JUnit name). Tests whose titles can't be safely embedded in the
    it.skipIf(isQuarantined('id')) marker are not returned — those need a
    manual quarantine entry.
    """
    tree = ET.parse(xml_path)
    failed: set[tuple[str, str]] = set()
    for case in tree.iter("testcase"):
        if case.find("failure") is None:
            continue
        classname = case.get("classname", "")
        if not re.match(r"^src/.+\.test\.(ts|tsx)$", classname):
            continue
        name = case.get("name", "")
        # JUnit names are `describe > test` chains; the leaf is the it() title.
        id_ = name.rsplit(" > ", 1)[-1]
        if not UNIT_ID_PATTERN.match(id_) or any(c in id_ for c in "'\"\\"):
            continue
        failed.add((classname, id_))
    return failed


def quarantined_ids(kind: str) -> set[str]:
    path = KINDS[kind]["quarantine"]
    if not path.exists():
        return set()
    entries = json.loads(path.read_text())
    if kind == "e2e":
        return {e.get("spec") for e in entries if isinstance(e, dict) and e.get("spec")}
    return {e.get("id") for e in entries if isinstance(e, dict) and e.get("id")}


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/repository")
    parser.add_argument("--kind", choices=sorted(KINDS), default="e2e", help="which quarantine list to scan for")
    parser.add_argument("--window", type=int, default=15, help="most recent CI runs to examine")
    parser.add_argument("--min-failures", type=int, default=3, help="distinct failed runs required to flag a test")
    parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.2,
        help="flag only if failures are also >= this fraction of examined runs "
        "(a test failing 3 of 15 runs is weaker evidence than 3 of 6)",
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

    artifact = KINDS[args.kind]["artifact"]
    quarantined = quarantined_ids(args.kind)

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    # Measure flakiness on the trunk only: without the branch filter, a single
    # feature branch with a genuinely broken test could produce three failing
    # runs and trigger an auto-quarantine PR against main.
    runs = json.loads(
        gh([f"repos/{args.repo}/actions/runs?workflow=ci.yml&branch=main&per_page={args.window}"])
    )["workflow_runs"]
    runs = [
        r
        for r in runs
        if r.get("event") in ("push", "pull_request", "schedule")
        and r.get("conclusion") in ("success", "failure")
        and parse_iso(r["created_at"]) >= cutoff
    ]
    runs.sort(key=lambda r: r["id"])

    examined = 0
    failures: dict = {}
    for run in runs:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            if not download_junit(run["id"], tmp_path, artifact):
                continue  # artifact missing or expired — nothing to learn from this run
            xml_files = sorted(tmp_path.rglob("results.xml"))
            if not xml_files:
                continue
            examined += 1
            failed_in_run: set = set()
            for xml in xml_files:
                # PR runs' artifacts are fork-controlled; cap the size before
                # parsing to blunt entity-expansion attacks (no defusedxml dep).
                if xml.stat().st_size > 5_000_000:
                    continue
                try:
                    if args.kind == "e2e":
                        failed_in_run |= failing_e2e_specs(xml)
                    else:
                        failed_in_run |= failing_unit_tests(xml)
                except ET.ParseError:
                    continue
            for item in failed_in_run:
                failures[item] = failures.get(item, 0) + 1

    # Two thresholds must both be met: an absolute floor (distinct failed runs)
    # and a relative one (fraction of the runs actually examined). The relative
    # floor stops a test that failed 3 of 15 runs from being treated like one
    # that failed 3 of 6 — the latter is far stronger evidence of a problem.
    ratio_floor = math.ceil(examined * args.min_ratio) if examined else 0
    # For e2e, `item` is the spec name; for unit, `item` is a (file, id) tuple
    # and the id is what quarantine-unit.json keys on.
    def already_quarantined(item) -> bool:
        return (item in quarantined) if args.kind == "e2e" else (item[1] in quarantined)
    flagged = sorted(
        (
            (item, count)
            for item, count in failures.items()
            if count >= args.min_failures and count >= ratio_floor and not already_quarantined(item)
        ),
        key=lambda entry: (-entry[1], str(entry[0])),
    )
    if args.kind == "e2e":
        for spec, count in flagged:
            print(f"{spec} {count} {examined}")
    else:
        for (file_, id_), count in flagged:
            print(f"{file_}\t{id_}\t{count}\t{examined}")

    summary = (
        f"# examined {examined} CI runs (relative floor {ratio_floor} = {args.min_ratio:.0%}); "
        f"{len(flagged)} {args.kind} test(s) flagged "
        f"(thresholds: >= {args.min_failures} distinct failed runs)"
    )
    if args.dry_run:
        summary += "; DRY-RUN: no quarantine changes made"
    print(summary, file=sys.stderr)


if __name__ == "__main__":
    main()
