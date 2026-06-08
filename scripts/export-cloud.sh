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
#
# Produces ./cloud-export/<timestamp>/{auth-data.sql, public-data.sql}.
# Copy that folder to the self-hosted server and run scripts/import-cloud.sh.

set -euo pipefail

command -v pg_dump >/dev/null 2>&1 || {
    echo "pg_dump not found. Install the Postgres client tools (e.g. 'brew install libpq')." >&2
    exit 1
}

read -rsp "Connection string (postgresql://postgres.xxxx:password@...pooler.supabase.com:5432/postgres): " DB_URL
echo ""
[ -n "$DB_URL" ] || { echo "No connection string entered, aborting."; exit 1; }

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
echo "   ✓ auth-data.sql"

echo "▶  Dumping application data (public schema)..."
pg_dump "${CONN[@]}" \
    --schema=public --data-only --no-owner --no-acl --disable-triggers \
    > "$OUT/public-data.sql"
echo "   ✓ public-data.sql"

echo ""
echo "✓ Export complete → $OUT"
echo ""
echo "Copy the folder to the server, e.g.:"
echo "  rsync -avz $OUT rubricmaker@your-vps:~/cloud-export/"
echo ""
echo "Then on the server, with the self-hosted stack already up and migrated:"
echo "  ./scripts/import-cloud.sh ~/cloud-export/$(basename "$OUT")"
