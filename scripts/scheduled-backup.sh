#!/bin/bash
# RubricMaker — the nightly backup job: back up, ship off-site, prune local copies, report.
#
# Usage:  ./scripts/scheduled-backup.sh [backup-root]     (default ./backups)
#
# Runs backup.sh, uploads the result with offsite-backup.sh (encrypted, verified), keeps the
# LOCAL_KEEP (default 7) newest local backups and, only when every step succeeded, pings
# BACKUP_HEARTBEAT_URL. Any failure exits non-zero and skips the ping, so a dead-man's-switch
# monitor on that URL alerts when backups stop. Configure .env.backup first.
#
# Example crontab entry (03:15 every night):
#   15 3 * * * cd /path/to/rubricmaker && ./scripts/scheduled-backup.sh >> /var/log/rubricmaker-backup.log 2>&1 || logger -t rubricmaker-backup 'nightly backup FAILED - see /var/log/rubricmaker-backup.log'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/compose.sh
source "$SCRIPT_DIR/lib/compose.sh"
# shellcheck source=lib/offsite.sh
source "$SCRIPT_DIR/lib/offsite.sh"

BACKUP_ROOT="${1:-./backups}"

load_backup_env
# Checked before the dump so a misconfigured server fails fast instead of after a long backup.
require_offsite_config
LOCAL_KEEP="${LOCAL_KEEP:-7}"
[[ "$LOCAL_KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "Error: LOCAL_KEEP must be a whole number of at least 1." >&2; exit 1; }

before_names=()
for dir in "$BACKUP_ROOT"/*/; do
    name="$(basename "$dir")"
    is_backup_name "$name" && before_names+=("$name")
done

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) scheduled backup ==="
"$SCRIPT_DIR/backup.sh" "$BACKUP_ROOT"

# Diff against the pre-run listing rather than taking the last glob match — a
# pre-existing directory named later than "now" would otherwise outrank the
# backup this run just created.
latest=""
for dir in "$BACKUP_ROOT"/*/; do
    name="$(basename "$dir")"
    is_backup_name "$name" || continue
    if ! printf '%s\n' "${before_names[@]:-}" | grep -qxF "$name"; then
        latest="$name"
    fi
done
[[ -n "$latest" ]] || { echo "Error: backup.sh reported success but no new backup directory was found in $BACKUP_ROOT." >&2; exit 1; }

"$SCRIPT_DIR/offsite-backup.sh" push "$BACKUP_ROOT/$latest"

# The new backup is always kept, for the same reason: by name it may not be the newest.
other_names=()
for dir in "$BACKUP_ROOT"/*/; do
    name="$(basename "$dir")"
    [[ "$name" != "$latest" ]] && is_backup_name "$name" && other_names+=("$name")
done
count=${#other_names[@]}
keep_others=$((LOCAL_KEEP - 1))
if ((count > keep_others)); then
    for old in "${other_names[@]:0:count-keep_others}"; do
        rm -rf -- "${BACKUP_ROOT:?}/$old"
        echo "   ✓ removed local backup $old (kept the newest $LOCAL_KEEP)"
    done
fi

ping_heartbeat "${BACKUP_HEARTBEAT_URL:-}"
echo "✓ Scheduled backup $latest complete"
