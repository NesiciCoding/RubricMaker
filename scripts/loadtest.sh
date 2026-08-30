#!/usr/bin/env bash
#
# loadtest.sh — run the k6 backend load test on your local machine.
#
# Targets a LOCAL Supabase stack by default: it reads the anon + service_role
# keys straight from `supabase status`, so you never copy keys by hand. Point it
# at a remote/staging project instead by exporting SUPABASE_URL + the two keys
# yourself (then this script skips the local lookup).
#
# Usage:
#   scripts/loadtest.sh [profile] [-- <extra k6 flags>]
#
#   profile   smoke | load | stress | spike | soak      (default: load)
#
# Examples:
#   scripts/loadtest.sh                       # default 'load' profile, ~50 VUs
#   scripts/loadtest.sh smoke                 # 5 VUs, 15s — quick sanity
#   VUS=300 scripts/loadtest.sh stress        # climb to 300 VUs, find the wall
#   DURATION=10m scripts/loadtest.sh soak     # sustained 30 VUs for 10 minutes
#   scripts/loadtest.sh load -- --out json=run.json   # pass flags through to k6
#
# Env knobs (all optional): VUS, DURATION, SEED_TESTS, SEED_ASSIGNMENTS.
# See k6/README.md for the full picture and how to read the numbers.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$HERE/k6/load-test.js"

# ── Parse args: optional profile, then optional `-- <k6 flags>` ───────────────
PROFILE_ARG=""
K6_EXTRA=()
while [ $# -gt 0 ]; do
    case "$1" in
        --) shift; K6_EXTRA=("$@"); break ;;
        -*) K6_EXTRA+=("$1"); shift ;;
        *) PROFILE_ARG="$1"; shift ;;
    esac
done
export PROFILE="${PROFILE_ARG:-${PROFILE:-load}}"

# ── k6 must be installed ──────────────────────────────────────────────────────
if ! command -v k6 >/dev/null 2>&1; then
    echo "error: k6 is not installed." >&2
    echo "  macOS:  brew install k6" >&2
    echo "  Linux:  https://grafana.com/docs/k6/latest/set-up/install-k6/" >&2
    exit 1
fi

# ── Resolve target credentials ────────────────────────────────────────────────
# If the caller already supplied a full target (remote/staging), trust it and
# skip the local lookup. Otherwise pull local keys from `supabase status`.
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ] && [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
    echo "[loadtest] target: ${SUPABASE_URL} (from environment)"
else
    if ! command -v supabase >/dev/null 2>&1; then
        echo "error: supabase CLI not found and SUPABASE_URL/keys not fully set." >&2
        echo "  Either start the local stack (npm run db:start) with the CLI installed," >&2
        echo "  or export SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY for a remote target." >&2
        exit 1
    fi

    if ! STATUS="$(supabase status 2>/dev/null)"; then
        echo "error: local Supabase stack is not running." >&2
        echo "  Start it first:  npm run db:start" >&2
        exit 1
    fi

    # CLI v2 prints sb_publishable_* / sb_secret_* keys; older CLIs printed
    # "anon key:" / "service_role key:" JWTs. Support both.
    ANON_KEY="$(echo "$STATUS" | grep -oE 'sb_publishable_[A-Za-z0-9_-]+' | head -1 || true)"
    SVC_KEY="$(echo "$STATUS" | grep -oE 'sb_secret_[A-Za-z0-9_-]+' | head -1 || true)"
    [ -z "$ANON_KEY" ] && ANON_KEY="$(echo "$STATUS" | awk '/anon key:/{print $NF}')"
    [ -z "$SVC_KEY" ] && SVC_KEY="$(echo "$STATUS" | awk '/service_role key:/{print $NF}')"
    if [ -z "$ANON_KEY" ] || [ -z "$SVC_KEY" ]; then
        echo "error: could not read anon/service keys from 'supabase status':" >&2
        echo "$STATUS" >&2
        exit 1
    fi

    export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
    export SUPABASE_ANON_KEY="$ANON_KEY"
    export SUPABASE_SERVICE_KEY="$SVC_KEY"
    echo "[loadtest] target: ${SUPABASE_URL} (local stack)"
fi

echo "[loadtest] profile: ${PROFILE}  (VUS=${VUS:-profile default}  DURATION=${DURATION:-profile default})"
echo "[loadtest] seeding: ${SEED_TESTS:-5} tests, ${SEED_ASSIGNMENTS:-40} assignments"
echo

# Guard the empty-array expansion: on macOS's bash 3.2, "${arr[@]}" on an empty
# array under `set -u` errors with "unbound variable".
if [ ${#K6_EXTRA[@]} -gt 0 ]; then
    exec k6 run "${K6_EXTRA[@]}" "$SCRIPT"
else
    exec k6 run "$SCRIPT"
fi
