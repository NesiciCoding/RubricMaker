#!/bin/bash
# RubricMaker — delete old attachments and scans (storage files + DB rows)
#
# Removes attachment files and metadata rows that have aged past the owner's
# school retention period (default: 7 years for users not linked to a school),
# and handwriting scans older than the current academic year.
# Uses the Storage HTTP API — direct SQL deletion is blocked by Supabase.
#
# Ids and storage paths are chosen by whoever uploaded the file, so they are never trusted:
# only rows whose id is a plain name and whose path is "<owner uuid>/<plain name>" are selected, and the
# same check runs again in bash before anything is put into a URL or SQL statement. Overdue rows that
# fail the check are left untouched and reported, so an operator can look at them.
#
# Usage (run from the project root):
#   ./scripts/delete-old-attachments.sh
#
# Schedule with crontab to run at 02:00 every night:
#   0 2 * * *  cd /path/to/rubricmaker && ./scripts/delete-old-attachments.sh \
#                >> /var/log/rubricmaker-cleanup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
fi

STORAGE_URL="${SITE_URL:-http://localhost:8000}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY is not set in .env}"

NAME_RE='^[A-Za-z0-9_-]{1,64}$'
UUID_RE='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
PATH_RE="^${UUID_RE}/[A-Za-z0-9_-]{1,64}(\\.[A-Za-z0-9]{1,10})?\$"
VALID_SQL="id ~ '${NAME_RE}' AND storage_path ~ '${PATH_RE}' AND lower(split_part(storage_path, '/', 1)) = owner_id::text"
# Rows with no stored file (text-only scans): only the metadata row is deleted.
NO_FILE_SQL="storage_path IS NULL AND id ~ '${NAME_RE}'"

log() { echo "[$(date -Iseconds)] $*"; }

psql_exec() {
    docker-compose -f "$COMPOSE_FILE" exec -T db psql -U supabase_admin -d postgres "$@"
}

BATCH_SIZE=100
# Every prior-year scan becomes overdue on the same night, so batches repeat until the backlog is gone.
# The cap only bounds a run that keeps finding full batches.
MAX_ROUNDS=200

# purge_batch <overdue-fn> <bucket> <table>
# Deletes up to BATCH_SIZE overdue files via the Storage HTTP API, then their metadata rows, plus up to
# BATCH_SIZE overdue rows that have no file. Sets BATCH_DELETED, and BATCH_FULL=1 when either query
# returned a full batch (so more rows may be waiting).
purge_batch() {
    local fn="$1" bucket="$2" table="$3"
    BATCH_DELETED=0
    BATCH_FULL=0

    # Fetch overdue rows (id | storage_path | owner) from the DB helper function.
    local rows no_file_rows
    rows=$(psql_exec -At -F'|' \
        -c "SELECT id, storage_path, owner_id FROM public.${fn}(100000) WHERE ${VALID_SQL} LIMIT ${BATCH_SIZE};" 2>/dev/null)
    no_file_rows=$(psql_exec -At -c "SELECT id FROM public.${fn}(100000) WHERE ${NO_FILE_SQL} LIMIT ${BATCH_SIZE};" 2>/dev/null)

    if [[ $(printf '%s' "$rows" | grep -c . || true) -ge $BATCH_SIZE \
        || $(printf '%s' "$no_file_rows" | grep -c . || true) -ge $BATCH_SIZE ]]; then
        BATCH_FULL=1
    fi

    if [[ -z "$rows" && -z "$no_file_rows" ]]; then
        return 0
    fi

    local deleted_ids=() id path owner http_status
    while IFS= read -r id; do
        [[ -z "$id" ]] && continue
        if [[ ! "$id" =~ $NAME_RE ]]; then
            log "Warning: skipping a row that failed validation"
            continue
        fi
        deleted_ids+=("$id")
    done <<< "$no_file_rows"

    while IFS='|' read -r id path owner; do
        [[ -z "$id" || -z "$path" ]] && continue

        if [[ ! "$id" =~ $NAME_RE || ! "$path" =~ $PATH_RE || "$(printf '%s' "${path%%/*}" | tr 'A-F' 'a-f')" != "$owner" ]]; then
            log "Warning: skipping a row that failed validation"
            continue
        fi

        # Delete the file via the Storage HTTP API.
        # Errors are logged but do not stop processing — a missing file is harmless
        # and we still want to clean up the DB row.
        http_status=$(curl -s -o /dev/null -w "%{http_code}" \
            -X DELETE \
            -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
            "${STORAGE_URL}/storage/v1/object/${bucket}/${path}")

        if [[ "$http_status" == "200" || "$http_status" == "404" ]]; then
            # 404 means already gone — treat as success and clean up the DB row.
            deleted_ids+=("$id")
        else
            log "Warning: storage DELETE returned HTTP ${http_status} for path '${path}'"
        fi
    done <<< "$rows"

    if [[ ${#deleted_ids[@]} -eq 0 ]]; then
        return 0
    fi

    # Build a quoted, comma-separated list for the SQL IN clause. Every id passed NAME_RE above.
    local id_list
    id_list=$(printf "'%s'," "${deleted_ids[@]}")
    id_list="${id_list%,}"  # strip trailing comma

    psql_exec -c "DELETE FROM public.${table} WHERE id IN (${id_list});" >/dev/null
    BATCH_DELETED=${#deleted_ids[@]}
}

# purge <label> <overdue-fn> <bucket> <table>
purge() {
    local label="$1" fn="$2" bucket="$3" table="$4"
    log "Starting ${label} cleanup..."

    # Candidates are filtered before the batch limit, so rows that fail validation cannot crowd out the rest.
    local skipped
    skipped=$(psql_exec -At -c "SELECT count(*) FROM public.${fn}(100000) WHERE NOT (coalesce(${VALID_SQL}, false) OR ${NO_FILE_SQL});" 2>/dev/null || true)
    if [[ -n "$skipped" && "$skipped" != "0" ]]; then
        log "Warning: ${skipped} overdue ${label} row(s) have an unexpected id or storage path and were left in place"
    fi

    local round total=0
    for (( round = 1; round <= MAX_ROUNDS; round++ )); do
        purge_batch "$fn" "$bucket" "$table"
        total=$((total + BATCH_DELETED))
        # A round without progress (e.g. every storage DELETE failed) would fetch the same rows again.
        if [[ $BATCH_FULL -eq 0 || $BATCH_DELETED -eq 0 ]]; then
            break
        fi
    done

    if [[ $total -eq 0 ]]; then
        log "No overdue ${label} deleted."
    else
        log "Done. Deleted ${total} ${label} row(s)."
    fi
}

purge "attachment" get_overdue_attachments attachments attachments
# Handwriting scans: one-academic-year cap (get_overdue_scans, migrations 074/082).
purge "scan" get_overdue_scans scans scan_metadata
