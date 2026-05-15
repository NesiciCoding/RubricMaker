#!/bin/bash
# RubricMaker — restore a backup created by backup.sh
#
# Usage:  ./scripts/restore.sh backups/20260515_120000
#
# ⚠  This OVERWRITES current data. Stop the stack first if restoring to a
#    fresh machine; for in-place restores the app can stay running.

set -euo pipefail

BACKUP_DIR="${1:-}"

if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 <backup-dir>"
    echo "Example: $0 backups/20260515_120000"
    exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: backup directory not found: $BACKUP_DIR"
    exit 1
fi

echo "RubricMaker restore from: $BACKUP_DIR"
echo ""
read -rp "This will overwrite all current data. Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

# ── Database ──────────────────────────────────────────────────────────────────
if [ -f "$BACKUP_DIR/database.sql" ]; then
    echo "▶  Restoring database..."
    # Drop and recreate public schema, then restore
    docker-compose exec -T db psql -U supabase_admin postgres \
        -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    docker-compose exec -T db \
        psql -U supabase_admin postgres \
        < "$BACKUP_DIR/database.sql"
    echo "   ✓ Database restored"
else
    echo "   ⚠  No database.sql found, skipping"
fi

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
