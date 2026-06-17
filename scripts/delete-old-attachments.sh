#!/bin/bash
# RubricMaker — delete old attachments (storage files + DB rows)
#
# Removes attachment files and metadata rows that have aged past the owner's
# school retention period (default: 7 years for users not linked to a school).
# Uses the Storage HTTP API — direct SQL deletion is blocked by Supabase.
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

log() { echo "[$(date -Iseconds)] $*"; }

log "Starting attachment cleanup..."

# Fetch overdue attachment rows (id | storage_path) from the DB helper function.
ROWS=$(docker-compose -f "$COMPOSE_FILE" exec -T db \
    psql -U supabase_admin -d postgres -At -F'|' \
    -c "SELECT id, storage_path FROM public.get_overdue_attachments(100);" 2>/dev/null)

if [[ -z "$ROWS" ]]; then
    log "No overdue attachments found."
    exit 0
fi

DELETED_IDS=()

while IFS='|' read -r id path; do
    [[ -z "$id" || -z "$path" ]] && continue

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

# Build a quoted, comma-separated list for the SQL IN clause.
ID_LIST=$(printf "'%s'," "${DELETED_IDS[@]}")
ID_LIST="${ID_LIST%,}"  # strip trailing comma

docker-compose -f "$COMPOSE_FILE" exec -T db \
    psql -U supabase_admin -d postgres -c \
    "DELETE FROM public.attachments WHERE id IN (${ID_LIST});" >/dev/null

log "Done. Deleted ${#DELETED_IDS[@]} attachment(s)."
