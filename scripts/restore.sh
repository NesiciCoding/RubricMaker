#!/bin/bash
# RubricMaker — restore a backup created by backup.sh
#
# Usage:  ./scripts/restore.sh backups/20260515_120000
#
# ⚠  This OVERWRITES all current data.
#
# The target stack must already be migrated (`docker-compose up -d` runs db_migrate) to at least
# the migrations the backup was taken at; the restore refuses otherwise. The database part runs in
# a single transaction with ON_ERROR_STOP: it either replaces every row or changes nothing.
# Tables, GRANTs, RLS policies, triggers and the realtime publication are left as the migrations
# created them, so the API keeps working after a restore.
#
# DB_EXEC overrides how psql reaches the database (default: the compose `db` service).

set -euo pipefail

BACKUP_DIR="${1:-}"
DB_EXEC="${DB_EXEC:-docker-compose exec -T db}"

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

psql_db() {
    $DB_EXEC psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"
}

# ── Schema version check ──────────────────────────────────────────────────────
applied=$(psql_db -tA -c "SELECT name FROM public._migrations ORDER BY name" < /dev/null)
missing=$(comm -23 <(sort "$BACKUP_DIR/migrations.txt") <(echo "$applied" | sort))
if [ -n "$missing" ]; then
    echo "Error: this stack is missing migrations the backup was taken with:"
    echo "$missing" | sed 's/^/  - /'
    echo "Update the app and run 'docker-compose up -d db_migrate' first."
    exit 1
fi

echo "RubricMaker restore from: $BACKUP_DIR"
echo ""
read -rp "This will overwrite all current data. Continue? [y/N] " confirm || confirm=""
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

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

# ── Storage ───────────────────────────────────────────────────────────────────
if [ -f "$BACKUP_DIR/storage.tar.gz" ]; then
    echo "▶  Restoring uploaded files..."
    docker run --rm \
        -v rubricmaker_storage-data:/data \
        -i alpine \
        sh -c "rm -rf /data/* && tar xzf - -C /" \
        < "$BACKUP_DIR/storage.tar.gz"
    echo "   ✓ Storage restored"
else
    echo "   ⚠  No storage.tar.gz found, skipping"
fi

echo ""
echo "✓ Restore complete. Restart the app if it was running:"
echo "  docker-compose restart app"
