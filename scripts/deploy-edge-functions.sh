#!/usr/bin/env bash
# RubricMaker — copy the edge functions from this repository into the official Supabase Docker
# stack (volumes/functions/) and restart the edge runtime.
#
#   sudo bash scripts/deploy-edge-functions.sh [--supabase-dir DIR] [--repo-dir DIR] [--yes] [--force]
#
# What it does, in order:
#   1. Refuses if stack-drift.py reports pending migrations (missing or partial): new function code
#      can depend on schema the database does not have yet. --force skips this check.
#   2. Shows which functions change and asks before touching anything (--yes to skip the prompt).
#   3. Copies volumes/functions to volumes/functions.bak-<timestamp> (the newest 5 are kept).
#   4. Replaces every function directory the repository has (and _shared). Directories that only
#      exist on the server (the stack's own `main` router, for instance) are left alone.
#   5. Restarts the edge-runtime container, then sends an OPTIONS request with the anon key to each
#      function through the gateway on 127.0.0.1:8000. A 500/502/503 or no answer means the worker
#      did not boot; the script then prints the command that restores the backup.
#
# Exit status: 0 deployed (or nothing to do), 1 refused or cancelled, 2 failed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SUPABASE_DIR=""
ASSUME_YES=0
FORCE=0
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
FUNCTIONS_CONTAINER="${FUNCTIONS_CONTAINER:-supabase-edge-functions}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:8000}"
KEEP_BACKUPS=5

while [[ $# -gt 0 ]]; do
    case "$1" in
        --supabase-dir) SUPABASE_DIR="${2:-}"; shift 2 ;;
        --repo-dir) REPO_DIR="${2:-}"; shift 2 ;;
        --yes) ASSUME_YES=1; shift ;;
        --force) FORCE=1; shift ;;
        -h | --help) sed -n '2,/^# Exit status/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown argument: $1 (see --help)" >&2; exit 2 ;;
    esac
done

die() { echo "error: $*" >&2; exit 2; }

if [[ -z "$SUPABASE_DIR" ]]; then
    SUPABASE_DIR="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$DB_CONTAINER" 2>/dev/null || true)"
fi
[[ -n "$SUPABASE_DIR" && -d "$SUPABASE_DIR/volumes/functions" ]] ||
    die "no volumes/functions under '${SUPABASE_DIR:-<not found>}'; pass --supabase-dir"
SRC="$REPO_DIR/supabase/functions"
DST="$SUPABASE_DIR/volumes/functions"
[[ -d "$SRC" ]] || die "$SRC does not exist; pass --repo-dir"

# ── 1. Schema first ──────────────────────────────────────────────────────────────────────────────
if [[ $FORCE -eq 0 ]]; then
    echo "Checking migrations (stack-drift.py)…"
    python3 "$SCRIPT_DIR/stack-drift.py" check --only migrations --supabase-dir "$SUPABASE_DIR" --repo-dir "$REPO_DIR"
    case $? in
        0) ;;
        1) echo; echo "Refusing: the database is missing migrations these functions may need. Apply them first"
           echo "(stack-drift.py apply), or re-run with --force if you have checked the functions don't depend on them."
           exit 1 ;;
        *) die "the migration check failed; fix that, or re-run with --force" ;;
    esac
fi

# ── 2. Plan ──────────────────────────────────────────────────────────────────────────────────────
functions=()
for d in "$SRC"/*/; do functions+=("$(basename "$d")"); done
changed=()
for fn in "${functions[@]}"; do
    if ! diff -rq --exclude='*.test.ts' --exclude='__tests__' "$SRC/$fn" "$DST/$fn" >/dev/null 2>&1; then
        changed+=("$fn")
    fi
done
echo
if [[ ${#changed[@]} -eq 0 ]]; then
    echo "Every deployed function already matches the repository. Nothing to do."
    exit 0
fi
echo "Functions to update in $DST:"
for fn in "${changed[@]}"; do
    if [[ -d "$DST/$fn" ]]; then echo "  ~ $fn"; else echo "  + $fn (new)"; fi
done
others=()
for d in "$DST"/*/; do
    fn="$(basename "$d")"
    [[ " ${functions[*]} " == *" $fn "* ]] || others+=("$fn")
done
[[ ${#others[@]} -gt 0 ]] && echo "Left alone (not in the repository): ${others[*]}"
if [[ $ASSUME_YES -eq 0 ]]; then
    read -r -p "Deploy these and restart $FUNCTIONS_CONTAINER? [y/N] " answer || answer=""
    [[ "$answer" =~ ^[Yy] ]] || { echo "Nothing changed."; exit 1; }
fi

# ── 3. Backup ────────────────────────────────────────────────────────────────────────────────────
BACKUP="$DST.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$DST" "$BACKUP" || die "could not back up $DST"
echo "Backup: $BACKUP"
mapfile -t old_backups < <(ls -1d "$DST".bak-* 2>/dev/null | sort | head -n -"$KEEP_BACKUPS")
for b in "${old_backups[@]}"; do rm -rf -- "$b"; done
restore_hint() {
    echo "To restore the previous functions:" >&2
    echo "  rm -rf '$DST' && cp -a '$BACKUP' '$DST' && docker restart $FUNCTIONS_CONTAINER" >&2
}

# ── 4. Copy ──────────────────────────────────────────────────────────────────────────────────────
for fn in "${changed[@]}"; do
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete --exclude='*.test.ts' --exclude='__tests__' "$SRC/$fn/" "$DST/$fn/" || { restore_hint; die "copying $fn failed"; }
    else
        rm -rf -- "${DST:?}/$fn" && cp -a "$SRC/$fn" "$DST/$fn" &&
            find "$DST/$fn" \( -name '*.test.ts' -o -name '__tests__' \) -prune -exec rm -rf {} + ||
            { restore_hint; die "copying $fn failed"; }
    fi
done
echo "Copied ${#changed[@]} function(s)."

# ── 5. Restart and probe ─────────────────────────────────────────────────────────────────────────
docker restart "$FUNCTIONS_CONTAINER" >/dev/null || { restore_hint; die "could not restart $FUNCTIONS_CONTAINER"; }
for _ in $(seq 1 30); do
    [[ "$(docker inspect -f '{{.State.Running}}' "$FUNCTIONS_CONTAINER" 2>/dev/null)" == "true" ]] && break
    sleep 1
done
sleep "${PROBE_DELAY_SECONDS:-3}"

anon="$(grep -E '^ANON_KEY=' "$SUPABASE_DIR/.env" 2>/dev/null | tail -n1 | sed -E "s/^ANON_KEY=//; s/^['\"]//; s/['\"]$//")"
failed=()
for fn in "${functions[@]}"; do
    [[ "$fn" == _* ]] && continue
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X OPTIONS \
        -H "Authorization: Bearer $anon" -H "apikey: $anon" "$GATEWAY_URL/functions/v1/$fn" || true)"
    case "$code" in
        # The stack's main router answers 500 when it cannot create the function's worker.
        000 | 500 | 502 | 503) failed+=("$fn"); echo "  ✗ $fn: HTTP $code (worker did not boot)" ;;
        *) echo "  ✓ $fn: HTTP $code" ;;
    esac
done
if [[ ${#failed[@]} -gt 0 ]]; then
    echo "Boot failures: ${failed[*]}. Check: docker logs --tail 50 $FUNCTIONS_CONTAINER" >&2
    restore_hint
    exit 2
fi
echo "✓ Deployed. Every function answered."
