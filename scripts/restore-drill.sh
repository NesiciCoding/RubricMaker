#!/bin/bash
# RubricMaker — restore drill: prove the latest backup actually restores.
#
# Usage:
#   ./scripts/restore-drill.sh                    → drill the newest off-site backup
#   ./scripts/restore-drill.sh backups/<stamp>    → drill a local backup instead
#
# Starts a throwaway copy of the database and storage services as a separate Compose project
# (RESTORE_DRILL_PROJECT, default rubricmaker-drill: its own volumes, no published ports, the live
# stack is never touched), migrates it, restores the backup into it with restore.sh, then checks
# that every table holds exactly the rows the dump contains and that every uploaded file came back.
# The scratch project is removed afterwards (RESTORE_DRILL_KEEP=1 leaves it running to inspect).
#
# On success it prints how long the restore took (the measured part of the RTO) and pings
# RESTORE_DRILL_HEARTBEAT_URL if set. It needs free disk for one more copy of the database and
# uploads. Schedule it monthly, e.g. at 04:30 on the 1st:
#   30 4 1 * * cd /path/to/rubricmaker && ./scripts/restore-drill.sh >> /var/log/rubricmaker-drill.log 2>&1 || logger -t rubricmaker-drill 'restore drill FAILED - see /var/log/rubricmaker-drill.log'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/compose.sh
source "$SCRIPT_DIR/lib/compose.sh"
# shellcheck source=lib/offsite.sh
source "$SCRIPT_DIR/lib/offsite.sh"

load_backup_env
require_compose

DRILL_PROJECT="${RESTORE_DRILL_PROJECT:-rubricmaker-drill}"
LIVE_PROJECT="$(resolve_compose_project)"
if [[ ! "$DRILL_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    echo "Error: RESTORE_DRILL_PROJECT must be a Compose project name (lowercase letters, digits, - and _)." >&2
    exit 1
fi
if [[ "$DRILL_PROJECT" == "$LIVE_PROJECT" ]]; then
    echo "Error: RESTORE_DRILL_PROJECT is the live project ($LIVE_PROJECT); the drill would overwrite it." >&2
    exit 1
fi
# A -p already in COMPOSE would fight the drill's own -p over which project gets restored.
if compose_project_from_flags >/dev/null; then
    echo "Error: COMPOSE must not set a project (-p/--project-name) for the drill; use RESTORE_DRILL_PROJECT." >&2
    exit 1
fi

read -r -a DRILL_COMPOSE <<< "$COMPOSE"
DRILL_COMPOSE+=(-p "$DRILL_PROJECT")
DRILL_VOLUME="${DRILL_PROJECT}_storage-data"
# Set explicitly for every step: a DB_EXEC or STORAGE_VOLUME exported for the live stack must never
# reach the restore below.
DRILL_DB_EXEC="$(COMPOSE="${DRILL_COMPOSE[*]}" db_exec_default)"
# Fixed rather than configurable: it is deleted on every run.
WORKDIR="./backups/.restore-drill"

teardown() {
    if [[ "${RESTORE_DRILL_KEEP:-0}" == 1 ]]; then
        echo "RESTORE_DRILL_KEEP=1: leaving the '$DRILL_PROJECT' project up. Remove it with:"
        echo "  ${DRILL_COMPOSE[*]} down -v"
    else
        "${DRILL_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
    fi
    rm -rf -- "${WORKDIR:?}"
}

started=$(date +%s)
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) restore drill (project $DRILL_PROJECT) ==="

# A drill that crashed earlier may have left its scratch project behind.
"${DRILL_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
rm -rf -- "${WORKDIR:?}"
trap teardown EXIT

if [[ -n "${1:-}" ]]; then
    BACKUP_DIR="$1"
    [[ -d "$BACKUP_DIR" ]] || { echo "Error: backup directory not found: $BACKUP_DIR" >&2; exit 1; }
else
    require_offsite_config
    mkdir -p "$WORKDIR"
    "$SCRIPT_DIR/offsite-backup.sh" pull latest "$WORKDIR"
    BACKUP_DIR="$(find "$WORKDIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi
echo "Backup under test: $BACKUP_DIR"
# Checked before anything starts; restore.sh repeats it but only after the scratch stack is up.
if [[ -f "$BACKUP_DIR/SHA256SUMS" ]]; then verify_checksums "$BACKUP_DIR"; fi

expected="$(dump_row_counts "$BACKUP_DIR/data.sql")"
[[ -n "$expected" ]] || { echo "Error: $BACKUP_DIR/data.sql contains no table data." >&2; exit 1; }
expected_files="$(tar tvzf "$BACKUP_DIR/storage.tar.gz" | grep -c '^-' || true)"

echo "▶  Starting the scratch stack and running migrations..."
"${DRILL_COMPOSE[@]}" up -d db_migrate
migrate_id="$("${DRILL_COMPOSE[@]}" ps -aq db_migrate)"
if [[ "$(docker wait "$migrate_id")" != 0 ]]; then
    "${DRILL_COMPOSE[@]}" logs --tail 50 db_migrate >&2 || true
    echo "Error: migrations failed on the scratch stack." >&2
    exit 1
fi

echo "▶  Restoring into the scratch stack..."
restore_started=$(date +%s)
COMPOSE="${DRILL_COMPOSE[*]}" DB_EXEC="$DRILL_DB_EXEC" STORAGE_VOLUME="$DRILL_VOLUME" \
    "$SCRIPT_DIR/restore.sh" --yes "$BACKUP_DIR"
restore_seconds=$(($(date +%s) - restore_started))

echo "▶  Checking the restored data..."
count_sql="$(printf '%s\n' "$expected" | awk -F'\t' '{ printf "%sSELECT %s, count(*) FROM %s", (NR > 1 ? " UNION ALL " : ""), "'\''" $1 "'\''", $1 }')"
actual="$($DRILL_DB_EXEC psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA -F $'\t' -c "$count_sql" | sort)"
if [[ "$actual" != "$expected" ]]; then
    echo "Error: restored row counts differ from the backup (< backup, > restored):" >&2
    diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") >&2 || true
    exit 1
fi
actual_files="$(docker run --rm -v "$DRILL_VOLUME":/data:ro alpine find /data -type f | wc -l | tr -d ' ')"
if [[ "$actual_files" != "$expected_files" ]]; then
    echo "Error: the backup holds $expected_files uploaded files but $actual_files were restored." >&2
    exit 1
fi

tables=$(printf '%s\n' "$expected" | wc -l | tr -d ' ')
rows=$(printf '%s\n' "$expected" | awk -F'\t' '{ s += $2 } END { print s + 0 }')
echo "   ✓ $tables tables, $rows rows and $expected_files files match the backup"
echo ""
echo "✓ Restore drill passed for $(basename "$BACKUP_DIR"): restore took ${restore_seconds}s, whole drill $(($(date +%s) - started))s"
ping_heartbeat "${RESTORE_DRILL_HEARTBEAT_URL:-}"
