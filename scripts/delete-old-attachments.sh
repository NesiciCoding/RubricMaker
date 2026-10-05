#!/bin/bash
# RubricMaker — delete old attachments (storage files + DB rows)
#
# Removes attachment files and metadata rows that have aged past the owner's
# school retention period (default: 7 years for users not linked to a school).
# Uses the Storage HTTP API — direct SQL deletion is blocked by Supabase.
#
# Attachment ids and storage paths are chosen by whoever uploaded the file, so they are never trusted:
# only rows whose id is a plain name and whose path is "<owner uuid>/<plain name>" are selected, and the
# same check runs again in bash before anything is put into a URL or SQL statement. Overdue rows that
# fail the check are removed from the database only, without touching storage.
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
BUCKET="attachments"

NAME_RE='^[A-Za-z0-9_-]{1,64}$'
UUID_RE='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
PATH_RE="^${UUID_RE}/[A-Za-z0-9_-]{1,64}\$"
VALID_SQL="id ~ '${NAME_RE}' AND storage_path ~ '${PATH_RE}' AND split_part(storage_path, '/', 1) = owner_id::text"

log() { echo "[$(date -Iseconds)] $*"; }

psql_exec() {
    docker-compose -f "$COMPOSE_FILE" exec -T db psql -U supabase_admin -d postgres "$@"
}

log "Starting attachment cleanup..."

# Overdue rows that fail validation cannot be addressed safely in storage: drop the DB row only.
psql_exec -c "DELETE FROM public.attachments WHERE id IN (SELECT id FROM public.get_overdue_attachments(100) WHERE NOT (${VALID_SQL}));" >/dev/null

# Fetch overdue attachment rows (id | storage_path | owner) from the DB helper function.
ROWS=$(psql_exec -At -F'|' \
    -c "SELECT id, storage_path, owner_id FROM public.get_overdue_attachments(100) WHERE ${VALID_SQL};" 2>/dev/null)

if [[ -z "$ROWS" ]]; then
    log "No overdue attachments found."
    exit 0
fi

DELETED_IDS=()

while IFS='|' read -r id path owner; do
    [[ -z "$id" || -z "$path" ]] && continue

    if [[ ! "$id" =~ $NAME_RE || ! "$path" =~ $PATH_RE || "${path%%/*}" != "$owner" ]]; then
        log "Warning: skipping a row that failed validation"
        continue
    fi

    # Delete the file via the Storage HTTP API.
    # Errors are logged but do not stop processing — a missing file is harmless
    # and we still want to clean up the DB row.
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X DELETE \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        "${STORAGE_URL}/storage/v1/object/${BUCKET}/${path}")

    if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "404" ]]; then
        # 404 means already gone — treat as success and clean up the DB row.
        DELETED_IDS+=("$id")
    else
        log "Warning: storage DELETE returned HTTP ${HTTP_STATUS} for path '${path}'"
    fi
done <<< "$ROWS"

if [[ ${#DELETED_IDS[@]} -eq 0 ]]; then
    log "No files successfully deleted."
    exit 0
fi

# Build a quoted, comma-separated list for the SQL IN clause. Every id passed NAME_RE above.
ID_LIST=$(printf "'%s'," "${DELETED_IDS[@]}")
ID_LIST="${ID_LIST%,}"  # strip trailing comma

psql_exec -c "DELETE FROM public.attachments WHERE id IN (${ID_LIST});" >/dev/null

log "Done. Deleted ${#DELETED_IDS[@]} attachment(s)."
