#!/bin/bash
# RubricMaker — backup database and uploaded files
#
# Usage:
#   ./scripts/backup.sh              → saves to ./backups/YYYYMMDD_HHMMSS/
#   ./scripts/backup.sh /path/to/dir → saves to the given directory
#
# Restoring a backup:
#   ./scripts/restore.sh backups/20260515_120000

set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_ROOT/$TIMESTAMP"

mkdir -p "$OUT"

echo "RubricMaker backup — $TIMESTAMP"
echo ""

# ── Database ──────────────────────────────────────────────────────────────────
echo "▶  Dumping database..."
docker-compose exec -T db \
    pg_dump -U supabase_admin --no-owner --no-acl postgres \
    > "$OUT/database.sql"
echo "   ✓ database.sql ($(du -sh "$OUT/database.sql" | cut -f1))"

# ── Storage (uploaded attachments and DOCX templates) ─────────────────────────
echo "▶  Archiving uploaded files..."
docker run --rm \
    -v rubricmaker_storage-data:/data:ro \
    alpine \
    tar czf - -C / data \
    > "$OUT/storage.tar.gz"
echo "   ✓ storage.tar.gz ($(du -sh "$OUT/storage.tar.gz" | cut -f1))"

echo ""
echo "✓ Backup complete → $OUT"
echo ""
echo "To restore:  ./scripts/restore.sh $OUT"
