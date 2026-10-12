#!/bin/bash
# RubricMaker — restore a backup created by backup.sh
#
# Usage:  ./scripts/restore.sh backups/20260515_120000
#
# ⚠  This OVERWRITES all current data.
#
# The target stack must already be migrated (`docker compose up -d` runs db_migrate) to at least
# the migrations the backup was taken at; the restore refuses otherwise. The database part runs in
# a single transaction with ON_ERROR_STOP: it either replaces every row or changes nothing.
# Tables, GRANTs, RLS policies, triggers and the realtime publication are left as the migrations
# created them, so the API keeps working after a restore.
#
# DB_EXEC overrides how psql reaches the database (default: the compose `db` service, via
# `docker compose` or the older `docker-compose`). STORAGE_VOLUME overrides the uploads volume.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/compose.sh
source "$SCRIPT_DIR/lib/compose.sh"

BACKUP_DIR="${1:-}"
if [[ -z "${DB_EXEC:-}" ]]; then
    require_compose
    DB_EXEC="$COMPOSE exec -T db"
fi

if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 <backup-dir>"
    echo "Example: $0 backups/20260515_120000"
    exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: backup directory not found: $BACKUP_DIR"
    exit 1
fi

if [ "$(cat "$BACKUP_DIR/FORMAT" 2>/dev/null)" != "2" ] || [ ! -f "$BACKUP_DIR/data.sql" ] || [ ! -f "$BACKUP_DIR/migrations.txt" ]; then
    echo "Error: $BACKUP_DIR is not a backup this script can restore."
    echo "Backups made before format 2 (a single database.sql) dropped all GRANTs and cannot be"
    echo "replayed onto a running stack. See docs/SELF_HOSTING_OPS.md → Backup and Restore."
    exit 1
fi

# The database rows include storage.objects metadata; loading them without the files would leave
# references to uploads that no longer exist, so an incomplete backup is refused up front.
if [ ! -f "$BACKUP_DIR/storage.tar.gz" ]; then
    echo "Error: $BACKUP_DIR is missing storage.tar.gz (the uploaded files). Nothing was changed."
    exit 1
fi

psql_db() {
    $DB_EXEC psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"
}

# ── Schema version check ──────────────────────────────────────────────────────
applied=$(psql_db -tA -c "SELECT name FROM public._migrations ORDER BY name" < /dev/null)
missing=$(comm -23 <(sort "$BACKUP_DIR/migrations.txt") <(echo "$applied" | sort))
if [ -n "$missing" ]; then
    echo "Error: this stack is missing migrations the backup was taken with:"
    echo "$missing" | sed 's/^/  - /'
    echo "Update the app and run 'docker compose up -d db_migrate' first."
    exit 1
fi

echo "RubricMaker restore from: $BACKUP_DIR"
echo ""
read -rp "This will overwrite all current data. Continue? [y/N] " confirm || confirm=""
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

# ── Storage, staged ───────────────────────────────────────────────────────────
# The archive is unpacked next to the live files first, so a corrupt archive fails here — before
# the database is touched — and the live uploads are only replaced once it has unpacked cleanly.
STAGING=.restore-staging
storage_sh() {
    docker run --rm -v "$STORAGE_VOLUME":/data "$@"
}
cleanup_staging() {
    storage_sh alpine rm -rf "/data/$STAGING" >/dev/null 2>&1 || true
}
trap cleanup_staging ERR

echo "▶  Unpacking uploaded files..."
storage_sh -i alpine sh -c "set -e; rm -rf /data/$STAGING; mkdir /data/$STAGING; tar xzf - -C /data/$STAGING; test -d /data/$STAGING/data" \
    < "$BACKUP_DIR/storage.tar.gz"
echo "   ✓ Archive unpacked"

# ── Database ──────────────────────────────────────────────────────────────────
echo "▶  Restoring database..."
{
    cat <<'SQL'
DO $$
DECLARE
  tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
  FROM pg_tables
  WHERE schemaname IN ('public', 'auth', 'storage')
    AND (schemaname, tablename) NOT IN (('public', '_migrations'), ('auth', 'schema_migrations'), ('storage', 'migrations'));
  EXECUTE 'TRUNCATE ' || tables || ' CASCADE';
END $$;
SQL
    cat "$BACKUP_DIR/data.sql"
    echo "NOTIFY pgrst, 'reload schema';"
} | psql_db --single-transaction -q -o /dev/null
echo "   ✓ Database restored"

# ── Storage, swap in ──────────────────────────────────────────────────────────
echo "▶  Restoring uploaded files..."
storage_sh alpine sh -c "set -e; find /data -mindepth 1 -maxdepth 1 ! -name $STAGING -exec rm -rf {} +; find /data/$STAGING/data -mindepth 1 -maxdepth 1 -exec mv {} /data/ \\;; rm -rf /data/$STAGING"
trap - ERR
echo "   ✓ Storage restored"

echo ""
echo "✓ Restore complete. Restart the app if it was running:"
echo "  docker compose restart app"
