#!/usr/bin/env python3
"""Apply auto-quarantine proposals for flaky unit tests.

Reads tab-separated lines from stdin:

    <file>\t<id>\t<failed-runs>\t<runs-examined>

(as produced by scripts/ci-quarantine-detect.py --kind unit) and, for each:

1. appends an entry to quarantine-unit.json (id, file, reason, since), and
2. wraps the test's `it('title', ...)` line with the skip marker:

       it('title', () => {...})            →    it.skipIf(isQuarantined('id'))('title', () => {...})

...adding the isQuarantined import to the test file if it isn't there already.
Both edits are idempotent — re-running is a no-op for already-processed tests.

The skip marker is what actually takes the test out of the gating runs
(isQuarantined(id) alone skips nothing; the test file must opt in), and the
guard test (src/__tests__/quarantineUnit.test.ts) enforces the exact one-line
marker shape this script produces. Only ids safe to embed in the marker
(alphanumeric, spaces, underscores, hyphens) are accepted; anything else is
reported and skipped.

    python3 scripts/apply-unit-quarantine.py --dry-run < proposals.tsv
    python3 scripts/apply-unit-quarantine.py < proposals.tsv
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
QUARANTINE = REPO_ROOT / "quarantine-unit.json"
HELPER = "src/test-utils/quarantine"

# Both patterns mirror the contract enforced by
# src/__tests__/quarantineUnit.test.ts — keep the two sides in sync.
# Must match the guard test's ID_PATTERN (regex-safe ids only).
ID_PATTERN = re.compile(r"^[A-Za-z0-9 _-]+$")
# Only src/ test files may be rewritten (same pattern the detector uses).
FILE_PATTERN = re.compile(r"^src/[^\s]+\.test\.(ts|tsx)$")
# it('title' ... — the marker wraps this call. Backreference \3 keeps whichever
# quote style the file uses.
CALL_RE = re.compile(r"^(\s*)(it|test)\(\s*(['\"])([^'\"]+)\3")
MARKER_RE = re.compile(r"skipIf\(\s*isQuarantined\(")


def import_line(test_file: str) -> str:
    """Import statement for isQuarantined, relative to the test file's dir.

    The test file is always under src/ (the guard test enforces that), so the
    depth is the number of directory levels below src/ it sits in. A file
    directly in src/ needs './' — a bare specifier would be resolved as a
    package and the file could not load.
    """
    depth = len(Path(test_file).parent.parts) - 1  # parts below src/
    prefix = ("../" * depth) if depth else "./"
    return f"import {{ isQuarantined }} from '{prefix}test-utils/quarantine';"


def load_entries() -> list[dict]:
    if not QUARANTINE.exists():
        return []
    return json.loads(QUARANTINE.read_text())


def save_entries(entries: list[dict]) -> None:
    QUARANTINE.write_text(json.dumps(entries, indent=2) + "\n")


def add_marker(test_file: str, id_: str, dry_run: bool) -> bool:
    """Wrap it('title', ...) with it.skipIf(isQuarantined('id'))(...).

    Returns True when the marker was added (or already present).
    """
    path = REPO_ROOT / test_file
    lines = path.read_text().splitlines(keepends=True)
    changed = False
    for i, line in enumerate(lines):
        if MARKER_RE.search(line):
            continue  # already wrapped with the quarantine marker (idempotent)
        m = CALL_RE.match(line)
        if not m or m.group(4) != id_:
            continue
        indent, keyword, quote, title = m.groups()
        lines[i] = (
            f"{indent}{keyword}.skipIf(isQuarantined('{id_}'))"
            f"({quote}{title}{quote}{line[m.end():]}"
        )
        changed = True
        break
    if not changed:
        print(f"  ! no it('{id_}') call found in {test_file} — marker not added", file=sys.stderr)
        return False

    # Ensure isQuarantined is imported: reuse an existing helper import if one
    # is there, otherwise insert a fresh import after the last import
    # *statement* — a single import can span several lines, and inserting
    # inside it would break the file.
    helper_import = next(
        (i for i, ln in enumerate(lines) if ln.startswith("import ") and "/test-utils/quarantine" in ln),
        None,
    )
    if helper_import is None:
        insert_at = 0
        in_import = False
        for i, ln in enumerate(lines):
            if ln.startswith("import "):
                in_import = True
            if in_import and ";" in ln:
                in_import = False
                insert_at = i + 1
        lines.insert(insert_at, f"{import_line(test_file)}\n")
    elif "isQuarantined" not in lines[helper_import]:
        lines[helper_import] = lines[helper_import].replace(
            "import {", "import { isQuarantined,"
        )

    if not dry_run:
        path.write_text("".join(lines))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print what would be changed without writing anything",
    )
    args = parser.parse_args()

    entries = load_entries()
    existing_ids = {e.get("id") for e in entries}
    # UTC, so `since` never lands in the future relative to the guard test's
    # UTC comparison on a runner ahead of UTC.
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    proposed = 0

    for line_no, raw in enumerate(sys.stdin, start=1):
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            print(f"  ! line {line_no}: expected '<file>\\t<id>...', got: {line}", file=sys.stderr)
            continue
        file_, id_ = parts[0], parts[1]
        count = parts[2] if len(parts) > 2 else "?"
        total = parts[3] if len(parts) > 3 else "?"

        if id_ in existing_ids:
            print(f"  - {id_} ({file_}): already quarantined, skipping")
            continue
        if not ID_PATTERN.match(id_):
            print(
                f"  ! {id_} ({file_}): id is not regex-safe (only letters, digits, "
                f"spaces, _ and -) — needs a manual quarantine entry",
                file=sys.stderr,
            )
            continue
        if not FILE_PATTERN.match(file_):
            print(
                f"  ! {id_}: {file_} is not a src/ test file — refusing to modify",
                file=sys.stderr,
            )
            continue
        if not Path(REPO_ROOT / file_).exists():
            print(f"  ! {id_}: file {file_} not found — needs a manual quarantine entry", file=sys.stderr)
            continue

        reason = f"auto-detected: failed in {count} of the last {total} CI runs examined"
        entries.append({"id": id_, "file": file_, "reason": reason, "since": today})
        existing_ids.add(id_)
        proposed += 1
        print(f"  + {id_} ({file_}) — {reason}")

        if not add_marker(file_, id_, args.dry_run):
            # Marker couldn't be applied — don't leave a dangling JSON entry.
            entries.pop()
            existing_ids.discard(id_)
            proposed -= 1

    if args.dry_run:
        print(f"\nDRY-RUN: {proposed} proposal(s) — no files were modified")
    else:
        if proposed:
            save_entries(entries)
        print(f"\nApplied {proposed} quarantine proposal(s)")


if __name__ == "__main__":
    main()
