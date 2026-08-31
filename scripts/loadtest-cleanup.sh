#!/usr/bin/env bash
#
# loadtest-cleanup.sh — remove rows the k6 load test seeded (id prefix
# `loadtest-`). Uses the service_role key (bypasses RLS) via PostgREST DELETE.
#
# Targets the local stack by default (keys read from `supabase status`); point
# it at a remote/staging target by exporting SUPABASE_URL + SUPABASE_SERVICE_KEY
# yourself. It does NOT delete the seeded auth users (they live in the auth
# schema) — see the printed instructions at the end.
#
# Usage: scripts/loadtest-cleanup.sh

set -euo pipefail

# ── Resolve target + service key (mirrors scripts/loadtest.sh) ────────────────
# A remote target must be fully specified — otherwise local discovery would keep
# the supplied remote URL but pull the LOCAL service key and DELETE against the
# remote target with it. Require both, or neither (auto-discover local).
if [ -n "${SUPABASE_URL:-}" ] || [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
        echo "error: a target set via environment needs both SUPABASE_URL and" >&2
        echo "       SUPABASE_SERVICE_KEY. Set both for a remote target, or neither" >&2
        echo "       to auto-discover the local stack." >&2
        exit 1
    fi
    echo "[cleanup] target: ${SUPABASE_URL} (from environment)"
else
    if ! command -v supabase >/dev/null 2>&1; then
        echo "error: supabase CLI not found and SUPABASE_URL/SUPABASE_SERVICE_KEY not set." >&2
        exit 1
    fi
    if ! STATUS="$(supabase status 2>/dev/null)"; then
        echo "error: local Supabase stack is not running (npm run db:start)." >&2
        exit 1
    fi
    SVC_KEY="$(echo "$STATUS" | grep -oE 'sb_secret_[A-Za-z0-9_-]+' | head -1 || true)"
    [ -z "$SVC_KEY" ] && SVC_KEY="$(echo "$STATUS" | awk '/service_role key:/{print $NF}')"
    if [ -z "$SVC_KEY" ]; then
        echo "error: could not read service key from 'supabase status'." >&2
        exit 1
    fi
    export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
    export SUPABASE_SERVICE_KEY="$SVC_KEY"
    echo "[cleanup] target: ${SUPABASE_URL} (local stack)"
fi

del() {
    local table="$1" prefix="$2"
    # PostgREST treats `*` in a like filter as the SQL % wildcard.
    curl -fsS -X DELETE \
        "${SUPABASE_URL}/rest/v1/${table}?id=like.${prefix}*" \
        -H "apikey: ${SUPABASE_SERVICE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
        -H "Prefer: return=minimal" \
        && echo "[cleanup] deleted ${table} rows with id like '${prefix}*'"
}

del test_assignments 'loadtest-asgn-'
del tests 'loadtest-test-'

cat <<'EOF'

[cleanup] Seeded auth users are NOT removed automatically (they live in the
          auth schema). Remove them one of two ways:
  - Supabase Dashboard → Authentication → Users → search "loadtest+" → delete
    (this cascades the profiles row), or
  - with psql access to the DB:
      delete from auth.users where email like 'loadtest+%';
EOF
