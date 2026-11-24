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
# `docker compose` or the older `docker-compose`). STORAGE_VOLUME overrides the uploads named
# volume; STORAGE_DIR instead points at a bind-mount path (the official Supabase self-hosting
# stack's ./volumes/storage) and takes priority when both are set. Either way the source must
# already exist — the run aborts rather than archiving an empty one. MIGRATIONS_TABLE/
# MIGRATIONS_COLUMN override the auto-detected migrations bookkeeping table (public._migrations
# or, on a stack migrated with the Supabase CLI, supabase_migrations.schema_migrations).

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

# Refuse to archive a source that does not exist: `docker run -v` would create an empty named
# volume on the fly, and the backup would look complete while holding none of the uploaded files.
if ! storage_source_exists; then
    storage_source_missing_message
    exit 1
fi

mkdir -p "$OUT"

echo "RubricMaker backup — $TIMESTAMP"
echo ""

# ── Database ──────────────────────────────────────────────────────────────────
echo "▶  Dumping database..."
read -r MIGRATIONS_TABLE_RESOLVED MIGRATIONS_COLUMN_RESOLVED <<< "$(migrations_source "$DB_EXEC")"
# Migration bookkeeping stays with the stack; restore.sh compares it instead of loading it.
# --schema restricts the dump to public/auth/storage, so supabase_migrations.schema_migrations
# (used on a stack migrated with the Supabase CLI) is already out of scope without excluding it.
$DB_EXEC pg_dump -U supabase_admin --data-only --disable-triggers \
    --schema=public --schema=auth --schema=storage \
    --exclude-table=public._migrations \
    --exclude-table=auth.schema_migrations \
    --exclude-table=storage.migrations \
    postgres > "$OUT/data.sql"
$DB_EXEC psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA \
    -c "SELECT $MIGRATIONS_COLUMN_RESOLVED FROM $MIGRATIONS_TABLE_RESOLVED ORDER BY $MIGRATIONS_COLUMN_RESOLVED" > "$OUT/migrations.txt"
echo "2" > "$OUT/FORMAT"
echo "   ✓ data.sql ($(du -sh "$OUT/data.sql" | cut -f1)), $(wc -l < "$OUT/migrations.txt" | tr -d ' ') migrations recorded"

# ── Storage (uploaded attachments and DOCX templates) ─────────────────────────
echo "▶  Archiving uploaded files..."
docker run --rm \
    -v "$STORAGE_SRC":/data:ro \
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
