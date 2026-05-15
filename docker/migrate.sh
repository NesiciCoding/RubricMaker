#!/bin/bash
# Runs Supabase migrations against the database, skipping ones already applied.
# Safe to re-run on every `docker-compose up`.
set -e

echo "Waiting for database to be ready..."
until psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; do
    sleep 2
done
echo "Database is ready."

# Migration tracking table (idempotent)
psql "$DATABASE_URL" -c "
    CREATE TABLE IF NOT EXISTS public._migrations (
        name        TEXT        PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
"

for f in $(ls /migrations/*.sql | sort); do
    name=$(basename "$f")
    count=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM public._migrations WHERE name='$name'")
    if [ "$count" -eq "0" ]; then
        echo "▶  Applying $name..."
        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
        psql "$DATABASE_URL" -c "INSERT INTO public._migrations (name) VALUES ('$name')"
        echo "   ✓ done"
    else
        echo "   ↷  $name already applied"
    fi
done

echo ""
echo "✓ All migrations up to date."
