#!/bin/bash
# RubricMaker — import a Supabase Cloud export (from export-cloud.sh) into
# the self-hosted docker-compose stack.
#
# Run this ON THE SERVER, after `docker-compose up -d --build` has finished
# and db_migrate has applied all migrations to a FRESH database.
#
# Usage:
#   ./scripts/import-cloud.sh <export-dir>
#   ./scripts/import-cloud.sh <export-dir> --skip-auth   # if auth was already imported

set -euo pipefail

EXPORT_DIR="${1:-}"
SKIP_AUTH="${2:-}"
[ -d "$EXPORT_DIR" ] || { echo "Usage: $0 <export-dir> [--skip-auth]"; exit 1; }
[ -f "$EXPORT_DIR/auth-data.sql" ] || { echo "Error: $EXPORT_DIR/auth-data.sql not found"; exit 1; }
[ -f "$EXPORT_DIR/public-data.sql" ] || { echo "Error: $EXPORT_DIR/public-data.sql not found"; exit 1; }

echo "RubricMaker — import cloud export from: $EXPORT_DIR"
echo ""
echo "⚠  This loads data into the self-hosted database. Only run this once,"
echo "   right after a fresh migration — re-running will create duplicate rows."
read -rp "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

if [[ "$SKIP_AUTH" == "--skip-auth" ]]; then
  echo "▶  Skipping auth import (--skip-auth)"
else
  echo "▶  Importing auth users..."
  grep -v '^\\restrict\|^\\unrestrict\|transaction_timeout' "$EXPORT_DIR/auth-data.sql" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin postgres
  echo "   ✓ Auth users imported"
fi

echo "▶  Importing application data..."
docker compose exec -T db psql -U supabase_admin postgres -c "DELETE FROM public.site_config;"
grep -v '^\\restrict\|^\\unrestrict\|transaction_timeout' "$EXPORT_DIR/public-data.sql" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin postgres
echo "   ✓ Application data imported"

echo ""
echo "▶  Restarting auth so GoTrue picks up the imported users..."
docker compose restart auth
echo ""
echo "✓ Import complete. Teachers can now sign in on the new instance with"
echo "  the same email they used on Supabase Cloud (a fresh OTP code will be sent)."
