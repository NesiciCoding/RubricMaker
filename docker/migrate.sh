#!/bin/bash
# Runs Supabase migrations against the database, skipping ones already applied.
# Safe to re-run on every `docker-compose up`.
#
# Each migration runs in a single transaction together with its public._migrations
# row, so a failure part-way through a file rolls the whole file back and leaves it
# unrecorded: fix the migration and re-run. A migration that cannot run inside a
# transaction (e.g. CREATE INDEX CONCURRENTLY) opts out with a line
#     -- migrate:no-transaction
# in its first 20 lines; it is then run statement by statement and recorded only
# after it succeeds.
set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

echo "Waiting for database to be ready..."
until psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; do
    sleep 2
done
echo "Database is ready."

# Migration tracking table (idempotent)
# RLS enabled with no policies — internal bookkeeping only, never exposed to
# anon/authenticated clients (Supabase grants them default privileges on
# public schema tables, so RLS-off here would let clients read/write it).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
    CREATE TABLE IF NOT EXISTS public._migrations (
        name        TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
"

record_sql=$(mktemp)
trap 'rm -f "$record_sql"' EXIT

# Glob into an array (no word splitting, so paths with spaces survive); C collation sorts it bytewise.
LC_COLLATE=C
shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

for f in "${migrations[@]}"; do
    name=$(basename "$f")
    # File names become SQL string literals: double any single quote.
    literal="'${name//\'/\'\'}'"
    count=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc "SELECT COUNT(*) FROM public._migrations WHERE name = $literal")
    if [ "$count" != "0" ]; then
        echo "   ↷  $name already applied"
        continue
    fi

    echo "▶  Applying $name..."
    echo "INSERT INTO public._migrations (name) VALUES ($literal);" > "$record_sql"
    if head -n 20 "$f" | grep -q -- '-- migrate:no-transaction'; then
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$record_sql"
    elif ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f" -f "$record_sql"; then
        echo "   ✗ $name failed and was rolled back — nothing from it was applied. Fix it and re-run." >&2
        exit 1
    fi
    echo "   ✓ done"
done

echo ""
echo "✓ All migrations up to date."
