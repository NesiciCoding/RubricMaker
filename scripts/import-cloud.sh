#!/bin/bash
# RubricMaker — import a Supabase Cloud export (from export-cloud.sh) into
# the self-hosted docker-compose stack.
#
# Run this ON THE SERVER, after `docker-compose up -d --build` has finished
# and db_migrate has applied all migrations to a FRESH database.
#
# Usage:
#   ./scripts/import-cloud.sh <export-dir>
#   ./scripts/import-cloud.sh <export-dir> --skip-auth      # if auth was already imported
#   ./scripts/import-cloud.sh <export-dir> --skip-storage   # rows only, no files
#   ./scripts/import-cloud.sh <export-dir> --storage-only   # (re-)upload the files, e.g. after a failure
#   ./scripts/import-cloud.sh <export-dir> --verify-only    # print the row-vs-file check again
#
# Files are uploaded through the Storage HTTP API at $STORAGE_URL (default: SITE_URL from .env,
# else http://localhost:8000) with SERVICE_ROLE_KEY from .env. Uploads use x-upsert, so re-running
# --storage-only is safe. See docs/SELF_HOSTING_OPS.md → "Migrating from Supabase Cloud".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/storage-paths.sh
source "$SCRIPT_DIR/lib/storage-paths.sh"
ENV_FILE="${SCRIPT_DIR}/../.env"

usage() {
  echo "Usage: $0 <export-dir> [--skip-auth] [--skip-storage | --storage-only | --verify-only]"
  exit 1
}

EXPORT_DIR="${1:-}"
[ -d "$EXPORT_DIR" ] || usage
shift

SKIP_AUTH="" SKIP_STORAGE="" STORAGE_ONLY="" VERIFY_ONLY=""
for arg in "$@"; do
  case "$arg" in
    --skip-auth) SKIP_AUTH=1 ;;
    --skip-storage) SKIP_STORAGE=1 ;;
    --storage-only) STORAGE_ONLY=1 ;;
    --verify-only) VERIFY_ONLY=1 ;;
    *) usage ;;
  esac
done
[[ $(( ${SKIP_STORAGE:-0} + ${STORAGE_ONLY:-0} + ${VERIFY_ONLY:-0} )) -le 1 ]] || usage

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

MANIFEST="$EXPORT_DIR/storage-manifest.tsv"
LOAD_ROWS=1
LOAD_FILES=1
[[ -n "$STORAGE_ONLY$VERIFY_ONLY" ]] && LOAD_ROWS=""
[[ -n "$SKIP_STORAGE$VERIFY_ONLY" ]] && LOAD_FILES=""

if [[ -n "$LOAD_ROWS" ]]; then
  if [[ -z "$SKIP_AUTH" ]]; then
    [ -f "$EXPORT_DIR/auth-data.sql" ] || { echo "Error: $EXPORT_DIR/auth-data.sql not found"; exit 1; }
  fi
  [ -f "$EXPORT_DIR/public-data.sql" ] || { echo "Error: $EXPORT_DIR/public-data.sql not found"; exit 1; }
fi
if [[ -n "$LOAD_FILES" && ! -f "$MANIFEST" ]]; then
  if [[ -n "$STORAGE_ONLY" ]]; then
    echo "Error: $MANIFEST not found — re-run export-cloud.sh with the project URL and service_role key."
    exit 1
  fi
  echo "⚠  No storage-manifest.tsv in the export (exported with --skip-storage or an older script)."
  echo "   Rows will be imported, but attachments, essays, recordings, feedback audio and scans will 404."
  LOAD_FILES=""
fi
if [[ -n "$LOAD_FILES" ]]; then
  STORAGE_URL="${STORAGE_URL:-${SITE_URL:-http://localhost:8000}}"
  STORAGE_URL="${STORAGE_URL%/}"
  SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY is not set (expected in .env)}"
fi

psql_db() {
  docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U supabase_admin postgres "$@"
}

# Matches only the Supabase pooler directives and the injected SET line —
# anchored so user data containing these substrings is never dropped.
FILTER_REGEX='^(\\(un)?restrict|SET[[:space:]]+transaction_timeout[[:space:]]*=)'

echo "RubricMaker — import cloud export from: $EXPORT_DIR"
echo ""
if [[ -n "$LOAD_ROWS" ]]; then
  echo "⚠  This loads data into the self-hosted database. Only run this once,"
  echo "   right after a fresh migration — re-running will create duplicate rows."
  read -rp "Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
  echo ""

  if [[ -n "$SKIP_AUTH" ]]; then
    echo "▶  Skipping auth import (--skip-auth)"
  else
    echo "▶  Importing auth users..."
    grep -Ev "$FILTER_REGEX" "$EXPORT_DIR/auth-data.sql" | docker compose exec -T db psql -1 -v ON_ERROR_STOP=1 -U supabase_admin postgres
    echo "   ✓ Auth users imported"
  fi

  echo "▶  Importing application data..."
  {
    printf '%s\n' 'DELETE FROM public.site_config;'
    grep -Ev "$FILTER_REGEX" "$EXPORT_DIR/public-data.sql"
  } | docker compose exec -T db psql -1 -v ON_ERROR_STOP=1 -U supabase_admin postgres
  echo "   ✓ Application data imported"
fi

if [[ -n "$LOAD_FILES" ]]; then
  echo "▶  Uploading storage files to $STORAGE_URL ..."
  UPLOADED=0
  FAILED=0
  while IFS=$'\t' read -r bucket name mime _size; do
    src="$EXPORT_DIR/storage/$bucket/$name"
    if ! is_safe_object "$bucket" "$name" || [[ ! -f "$src" ]]; then
      echo "   ⚠  missing or unexpected file in the export: $bucket/$name"
      FAILED=$((FAILED + 1))
      continue
    fi
    if curl -fsS --retry 3 -o /dev/null -X POST \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Content-Type: ${mime:-application/octet-stream}" -H "x-upsert: true" \
      --data-binary "@$src" \
      "$STORAGE_URL/storage/v1/object/$(urlencode_path "$bucket")/$(urlencode_path "$name")"; then
      UPLOADED=$((UPLOADED + 1))
    else
      echo "   ⚠  upload failed: $bucket/$name"
      FAILED=$((FAILED + 1))
    fi
  done < "$MANIFEST"
  echo "   ✓ $UPLOADED file(s) uploaded, $FAILED failed"
  [[ "$FAILED" -eq 0 ]] || echo "   Fix the cause and re-run with --storage-only (uploads are idempotent)."
fi

# ── Verification: every row that points at a file must find it in storage ────────
echo ""
echo "▶  Verifying files..."
if [[ -f "$MANIFEST" ]]; then
  echo "   Files per bucket (export → this instance):"
  manifest_counts=$(cut -f1 "$MANIFEST" | sort | uniq -c | awk '{print $2 "\t" $1}')
  db_counts=$(psql_db -At -F $'\t' -c "SELECT bucket_id, count(*) FROM storage.objects WHERE name NOT LIKE '%.emptyFolderPlaceholder' GROUP BY 1 ORDER BY 1")
  LC_ALL=C join -t $'\t' -a1 -a2 -e 0 -o 0,1.2,2.2 \
    <(printf '%s\n' "$manifest_counts" | LC_ALL=C sort) <(printf '%s\n' "$db_counts" | LC_ALL=C sort) |
    while IFS=$'\t' read -r b exported present; do
      [[ -n "$b" ]] || continue
      mark="✓"; [[ "$present" -ge "$exported" ]] || mark="✗"
      printf '     %s %-18s %6s → %s\n' "$mark" "$b" "$exported" "$present"
    done
fi

MISSING_SQL="
WITH refs(tbl, bucket, path) AS (
  SELECT 'attachments', 'attachments', storage_path FROM public.attachments WHERE storage_path IS NOT NULL
  UNION ALL SELECT 'export_templates', 'export-templates', storage_path FROM public.export_templates WHERE storage_path IS NOT NULL
  UNION ALL SELECT 'essay_submissions', 'essays', storage_path FROM public.essay_submissions WHERE storage_path IS NOT NULL
  UNION ALL SELECT 'recording_metadata', 'recordings', storage_path FROM public.recording_metadata WHERE storage_path IS NOT NULL
  UNION ALL SELECT 'scan_metadata', 'scans', storage_path FROM public.scan_metadata WHERE storage_path IS NOT NULL
)"
echo "   Rows that reference a file (table: missing / total):"
psql_db -At -F $'\t' -c "$MISSING_SQL
  SELECT r.tbl, count(*) FILTER (WHERE o.id IS NULL), count(*)
  FROM refs r LEFT JOIN storage.objects o ON o.bucket_id = r.bucket AND o.name = r.path
  GROUP BY r.tbl ORDER BY r.tbl" |
  while IFS=$'\t' read -r tbl missing total; do
    mark="✓"; [[ "$missing" == "0" ]] || mark="✗"
    printf '     %s %-20s %s / %s\n' "$mark" "$tbl" "$missing" "$total"
  done
MISSING_TOTAL=$(psql_db -At -c "$MISSING_SQL
  SELECT count(*) FROM refs r LEFT JOIN storage.objects o ON o.bucket_id = r.bucket AND o.name = r.path WHERE o.id IS NULL")
if [[ "$MISSING_TOTAL" == "0" ]]; then
  echo "   ✓ Every file referenced by a row is present."
else
  echo "   ✗ $MISSING_TOTAL row(s) reference a file that is not in storage. First few:"
  psql_db -At -F ' ' -c "$MISSING_SQL
    SELECT r.bucket || '/' || r.path FROM refs r
    LEFT JOIN storage.objects o ON o.bucket_id = r.bucket AND o.name = r.path
    WHERE o.id IS NULL ORDER BY 1 LIMIT 20" | sed 's/^/       /'
  echo "   Re-run with --storage-only after fixing uploads; files that were already missing on"
  echo "   Supabase Cloud cannot be recovered this way."
fi
echo "   (Voice-feedback audio is referenced from inside grade records and is covered by the per-bucket counts above.)"

if [[ -n "$LOAD_ROWS" ]]; then
  echo ""
  echo "▶  Restarting auth so GoTrue picks up the imported users..."
  docker compose restart auth
  echo ""
  echo "✓ Import complete. Teachers can now sign in on the new instance with"
  echo "  the same email they used on Supabase Cloud (a fresh OTP code will be sent)."
fi
