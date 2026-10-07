#!/bin/bash
# RubricMaker — export data from Supabase Cloud for migration to self-hosted
#
# Run this on your laptop (needs `pg_dump` from the Postgres client tools,
# matching or newer than the cloud project's Postgres 17).
#
# 1. Supabase Dashboard → Project Settings → Database → Connection string
#    → pick "Session pooler" (works from IPv4-only networks, unlike the
#    direct connection which is IPv6-only on most projects) → copy the URI.
#    It looks like:
#      postgresql://postgres.tpzownbqzaruedbvesoi:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres
# 2. ./scripts/export-cloud.sh
#    and paste the URI (with your real password substituted in) when asked.
# 3. For the files (attachments, essays, recordings, feedback audio, scans, …) it also asks for
#    the project URL and the service_role key (Dashboard → Project Settings → API). Leave the URL
#    empty, or pass --skip-storage, to export database rows only — the files then 404 after import.
#
# Produces ./cloud-export/<timestamp>/{auth-data.sql, public-data.sql, storage-manifest.tsv, storage/}.
# Copy that folder to the self-hosted server and run scripts/import-cloud.sh.
# See docs/SELF_HOSTING_OPS.md → "Migrating from Supabase Cloud".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/storage-paths.sh
source "$SCRIPT_DIR/lib/storage-paths.sh"

SKIP_STORAGE=""
case "${1:-}" in
    "") ;;
    --skip-storage) SKIP_STORAGE=1 ;;
    *) echo "Usage: $0 [--skip-storage]"; exit 1 ;;
esac

for tool in pg_dump psql curl; do
    command -v "$tool" >/dev/null 2>&1 || {
        echo "$tool not found. Install the Postgres client tools (e.g. 'brew install libpq') and curl." >&2
        exit 1
    }
done

read -rsp "Connection string (postgresql://postgres.xxxx:password@...pooler.supabase.com:5432/postgres): " DB_URL
echo ""
[ -n "$DB_URL" ] || { echo "No connection string entered, aborting."; exit 1; }

PROJECT_URL=""
SERVICE_KEY=""
if [[ -z "$SKIP_STORAGE" ]]; then
    read -rp "Project URL for the files (https://xxxx.supabase.co — empty to skip files): " PROJECT_URL
    PROJECT_URL="${PROJECT_URL%/}"
    if [[ -n "$PROJECT_URL" ]]; then
        read -rsp "service_role key (Project Settings → API): " SERVICE_KEY
        echo ""
        [ -n "$SERVICE_KEY" ] || { echo "No service_role key entered, aborting."; exit 1; }
    fi
fi

# Dumps contain real student/teacher data — keep them readable only by us.
umask 077

OUT="./cloud-export/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT"

CONN=("$DB_URL")

# auth.users / auth.identities first — public.profiles has a foreign key to
# auth.users, so the user rows must exist before the application data loads.
echo "▶  Dumping auth users..."
pg_dump "${CONN[@]}" \
    --data-only --no-owner --no-acl --disable-triggers \
    --table='auth.users' --table='auth.identities' \
    > "$OUT/auth-data.sql"
chmod 600 "$OUT/auth-data.sql"
echo "   ✓ auth-data.sql"

echo "▶  Dumping application data (public schema)..."
pg_dump "${CONN[@]}" \
    --schema=public --data-only --no-owner --no-acl --disable-triggers \
    > "$OUT/public-data.sql"
chmod 600 "$OUT/public-data.sql"
echo "   ✓ public-data.sql"

STORAGE_FAILED=0
if [[ -n "$PROJECT_URL" ]]; then
    echo "▶  Downloading storage files..."
    # Names containing tabs or line breaks can't travel in the TSV manifest; they are counted and reported.
    psql "$DB_URL" -X -At -F $'\t' -v ON_ERROR_STOP=1 -c "
        SELECT bucket_id, name,
               coalesce(metadata->>'mimetype', 'application/octet-stream'),
               coalesce(metadata->>'size', '')
        FROM storage.objects
        WHERE name !~ E'[\\t\\n\\r]' AND name NOT LIKE '%.emptyFolderPlaceholder'
        ORDER BY bucket_id, name" > "$OUT/storage-objects.tsv"
    UNLISTABLE=$(psql "$DB_URL" -X -At -c "SELECT count(*) FROM storage.objects WHERE name ~ E'[\\t\\n\\r]'")

    MANIFEST="$OUT/storage-manifest.tsv"
    : > "$MANIFEST"
    mkdir -p "$OUT/storage"
    DOWNLOADED=0
    while IFS=$'\t' read -r bucket name mime size; do
        if ! is_safe_object "$bucket" "$name"; then
            echo "   ⚠  skipping object with an unexpected name in bucket '$bucket'"
            STORAGE_FAILED=$((STORAGE_FAILED + 1))
            continue
        fi
        dest="$OUT/storage/$bucket/$name"
        mkdir -p "$(dirname "$dest")"
        if curl -fsS --retry 3 -o "$dest" \
            -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
            "$PROJECT_URL/storage/v1/object/$(urlencode_path "$bucket")/$(urlencode_path "$name")"; then
            printf '%s\t%s\t%s\t%s\n' "$bucket" "$name" "$mime" "$size" >> "$MANIFEST"
            DOWNLOADED=$((DOWNLOADED + 1))
        else
            echo "   ⚠  download failed: $bucket/$name"
            rm -f "$dest"
            STORAGE_FAILED=$((STORAGE_FAILED + 1))
        fi
    done < "$OUT/storage-objects.tsv"
    rm -f "$OUT/storage-objects.tsv"
    chmod -R go-rwx "$OUT/storage" "$MANIFEST"

    echo "   ✓ $DOWNLOADED file(s) → storage/ (listed in storage-manifest.tsv)"
    if [[ "$STORAGE_FAILED" -gt 0 || "$UNLISTABLE" != "0" ]]; then
        echo "   ⚠  $STORAGE_FAILED file(s) failed to download and $UNLISTABLE have a name with a tab or line break."
        echo "      Re-run the export, or copy those files by hand from the Supabase Dashboard."
    fi
else
    echo "▶  Skipping storage files — attachments, essays, recordings, feedback audio and scans"
    echo "   will NOT be available on the new instance until they are copied."
fi

echo ""
echo "✓ Export complete → $OUT"
echo ""
echo "Copy the folder to the server, e.g.:"
echo "  rsync -avz $OUT rubricmaker@your-vps:~/cloud-export/"
echo ""
echo "Then on the server, with the self-hosted stack already up and migrated:"
echo "  ./scripts/import-cloud.sh ~/cloud-export/$(basename "$OUT")"
