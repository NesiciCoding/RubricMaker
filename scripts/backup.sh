#!/bin/bash
# RubricMaker — backup database and uploaded files
#
# Usage:
#   ./scripts/backup.sh              → saves to ./backups/YYYYMMDD_HHMMSS/
#   ./scripts/backup.sh /path/to/dir → saves to the given directory
#
# Restoring a backup:
#   ./scripts/restore.sh backups/20260515_120000
#
# The database part is data only (rows of the public, auth and storage schemas). Tables, GRANTs,
# RLS policies, triggers and the realtime publication come from the migrations the target stack
# runs (db_migrate), so a restore never has to recreate them — see restore.sh.
#
# DB_EXEC overrides how pg_dump/psql reach the database (default: the compose `db` service, via
# `docker compose` or the older `docker-compose`). STORAGE_VOLUME overrides the uploads volume,
# which must already exist — the run aborts rather than archiving an empty one.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/compose.sh
source "$SCRIPT_DIR/lib/compose.sh"
# shellcheck source=lib/offsite.sh
source "$SCRIPT_DIR/lib/offsite.sh"

BACKUP_ROOT="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_ROOT/$TIMESTAMP"
if [[ -z "${DB_EXEC:-}" ]]; then
    require_compose
    DB_EXEC="$(db_exec_default)"
fi

# Refuse to archive a volume that does not exist: `docker run -v` would create an empty one with
# that name, and the backup would look complete while holding none of the uploaded files.
if ! docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
    echo "Error: uploads volume '$STORAGE_VOLUME' does not exist."
    echo "       It is named <compose project>_storage-data, so start the stack (docker compose up -d)"
    echo "       or set COMPOSE_PROJECT_NAME/STORAGE_VOLUME to the project it actually runs as."
    echo "       See docs/SELF_HOSTING_OPS.md → Backup and Restore."
    exit 1
fi

mkdir -p "$OUT"

echo "RubricMaker backup — $TIMESTAMP"
echo ""

# ── Database ──────────────────────────────────────────────────────────────────
echo "▶  Dumping database..."
# Migration bookkeeping stays with the stack; restore.sh compares it instead of loading it.
$DB_EXEC pg_dump -U supabase_admin --data-only --disable-triggers \
    --schema=public --schema=auth --schema=storage \
    --exclude-table=public._migrations \
    --exclude-table=auth.schema_migrations \
    --exclude-table=storage.migrations \
    postgres > "$OUT/data.sql"
$DB_EXEC psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA \
    -c "SELECT name FROM public._migrations ORDER BY name" > "$OUT/migrations.txt"
echo "2" > "$OUT/FORMAT"
echo "   ✓ data.sql ($(du -sh "$OUT/data.sql" | cut -f1)), $(wc -l < "$OUT/migrations.txt" | tr -d ' ') migrations recorded"

# ── Storage (uploaded attachments and DOCX templates) ─────────────────────────
echo "▶  Archiving uploaded files..."
docker run --rm \
    -v "$STORAGE_VOLUME":/data:ro \
    alpine \
    tar czf - -C / data \
    > "$OUT/storage.tar.gz"
echo "   ✓ storage.tar.gz ($(du -sh "$OUT/storage.tar.gz" | cut -f1))"

# restore.sh and offsite-backup.sh refuse a backup whose files no longer match these.
write_checksums "$OUT"

echo ""
echo "✓ Backup complete → $OUT"
echo ""
echo "To restore:  ./scripts/restore.sh $OUT"
echo "Off-site:    ./scripts/offsite-backup.sh push $OUT"
