#!/bin/bash
# RubricMaker — regenerate supabase/bootstrap.sql from supabase/migrations/
#
# bootstrap.sql concatenates every migration, in order, into a single file so a
# brand-new database (e.g. a fresh self-hosted deploy) can be set up in one
# `psql -f supabase/bootstrap.sql` instead of running 32 files one by one.
# It also seeds public._migrations so docker/migrate.sh treats them as already
# applied and won't try to re-run them.
#
# supabase/migrations/ stays the source of truth — re-run this script whenever
# a migration is added, changed, or removed.
#
# Usage: ./scripts/generate-bootstrap.sh

set -euo pipefail

cd "$(dirname "$0")/.."

MIGRATIONS_DIR="supabase/migrations"
OUT="supabase/bootstrap.sql"
FILES=$(cd "$MIGRATIONS_DIR" && ls *.sql | sort)
TOTAL=$(echo "$FILES" | wc -l | tr -d ' ')

{
    echo "-- =============================================================================="
    echo "-- RubricMaker — bootstrap schema (generated, do not hand-edit)"
    echo "--"
    echo "-- Concatenation of all files in supabase/migrations/, in order, for setting up"
    echo "-- a brand-new database in a single pass (e.g. self-hosted first deploy)."
    echo "--"
    echo "-- supabase/migrations/ remains the source of truth — regenerate this file with:"
    echo "--   ./scripts/generate-bootstrap.sh"
    echo "--"
    echo "-- After running this file, every migration below is recorded in"
    echo "-- public._migrations so docker/migrate.sh recognizes them as already applied"
    echo "-- and will not try to re-run them."
    echo "-- =============================================================================="
    echo ""
    for f in $FILES; do
        echo "-- ── $f ──────────────────────────────────────────────────────────────"
        echo ""
        cat "$MIGRATIONS_DIR/$f"
        echo ""
    done

    echo "-- ── record applied migrations ──────────────────────────────────────────"
    echo ""
    echo "create table if not exists public._migrations ("
    echo "    name        text        primary key,"
    echo "    applied_at  timestamptz not null default now()"
    echo ");"
    echo ""
    echo "-- internal bookkeeping only — RLS on with no policies keeps it hidden"
    echo "-- from anon/authenticated clients (which get default privileges on"
    echo "-- public schema tables otherwise)"
    echo "alter table public._migrations enable row level security;"
    echo ""
    echo "insert into public._migrations (name) values"
    n=0
    for f in $FILES; do
        n=$((n + 1))
        if [ "$n" -eq "$TOTAL" ]; then sep=""; else sep=","; fi
        echo "    ('$f')$sep"
    done
    echo "on conflict (name) do nothing;"
} > "$OUT"

echo "✓ Regenerated $OUT from $TOTAL migrations"
