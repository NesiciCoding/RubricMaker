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
# Env knobs (all optional): VUS, DURATION, TARGET, SEED_TESTS, SEED_ASSIGNMENTS.
#   REPORT=<file.md>   append one result row to a Markdown sizing table
#   LABEL="4vCPU/8GB"  annotate that row (e.g. the VM spec under test)
#
# Example:
#   REPORT=k6/results.md LABEL="4vCPU/8GB VM" VUS=150 npm run loadtest:stress
#
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
# A remote target must be fully specified. If ANY of the three target vars is
# set but not all, refuse: otherwise local discovery would keep the supplied
# (possibly remote) SUPABASE_URL while pulling the LOCAL service key from
# `supabase status` and send that local key to the remote target during seeding.
if [ -n "${SUPABASE_URL:-}" ] || [ -n "${SUPABASE_ANON_KEY:-}" ] || [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
    if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ] || [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
        echo "error: a target set via environment needs all three of SUPABASE_URL," >&2
        echo "       SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY. Set all three for a" >&2
        echo "       remote/staging target, or none to auto-discover the local stack." >&2
        exit 1
    fi
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

# Transport security: seeding sends the service_role key in request headers, so
# refuse cleartext HTTP to anything but an exact loopback host (e.g. a tunnel
# endpoint). https:// is always allowed. Runs regardless of LOADTEST_YES.
case "$SUPABASE_URL" in
    https://*) ;;
    http://127.0.0.1 | http://127.0.0.1:* | http://127.0.0.1/* \
        | http://localhost | http://localhost:* | http://localhost/* \
        | http://0.0.0.0 | http://0.0.0.0:* | http://0.0.0.0/* \
        | 'http://[::1]' | 'http://[::1]:'* | 'http://[::1]/'*) ;;
    http://*)
        echo "error: refusing to send credentials over cleartext HTTP to a non-loopback" >&2
        echo "       target: ${SUPABASE_URL}" >&2
        echo "       Use https://, or an SSH tunnel and point at http://127.0.0.1:<port>." >&2
        exit 1 ;;
    *)
        echo "error: unsupported target URL (expected http:// or https://): ${SUPABASE_URL}" >&2
        exit 1 ;;
esac

# Safety: hitting a non-localhost target seeds real rows via the service_role
# key and generates real load. Require an explicit confirmation so a production
# URL can't be run by reflex. LOADTEST_YES=1 bypasses (for automation/CI).
case "$SUPABASE_URL" in
    http://127.0.0.1 | http://127.0.0.1:* | http://127.0.0.1/* \
        | http://localhost | http://localhost:* | http://localhost/* \
        | http://0.0.0.0 | http://0.0.0.0:* | http://0.0.0.0/* \
        | 'http://[::1]' | 'http://[::1]:'* | 'http://[::1]/'*) ;;
    *)
        if [ "${LOADTEST_YES:-}" != "1" ]; then
            echo "⚠  Target is NOT localhost:  ${SUPABASE_URL}" >&2
            echo "   This seeds a real user + tests + assignments via the service_role key" >&2
            echo "   and generates real concurrent load. NEVER run this against production." >&2
            if [ -t 0 ]; then
                printf "   Type 'yes' to continue: " >&2
                read -r REPLY
                [ "$REPLY" = "yes" ] || { echo "Aborted." >&2; exit 1; }
            else
                echo "   Non-interactive shell — set LOADTEST_YES=1 to proceed." >&2
                exit 1
            fi
        fi
        ;;
esac

echo "[loadtest] profile: ${PROFILE}  target-tier: ${TARGET:-both}  (VUS=${VUS:-profile default}  DURATION=${DURATION:-profile default})"
echo "[loadtest] seeding: ${SEED_TESTS:-5} tests, ${SEED_ASSIGNMENTS:-40} assignments"
echo

# Guard the empty-array expansion: on macOS's bash 3.2, "${arr[@]}" on an empty
# array under `set -u` errors with "unbound variable".
K6_ARGS=()
[ ${#K6_EXTRA[@]} -gt 0 ] && K6_ARGS+=("${K6_EXTRA[@]}")

# REPORT=<file.md>: export a k6 summary, then append one row to the results table
# via scripts/loadtest-report.mjs (annotated with PROFILE/TARGET/LABEL). We can't
# exec in this path since the parser runs after k6; preserve k6's exit code.
if [ -n "${REPORT:-}" ]; then
    if ! command -v node >/dev/null 2>&1; then
        echo "error: REPORT is set but node is not installed (needed to parse the summary)." >&2
        exit 1
    fi
    SUMMARY_JSON="$(mktemp)"
    K6_ARGS+=(--summary-export "$SUMMARY_JSON")
    set +e
    k6 run "${K6_ARGS[@]}" "$SCRIPT"
    RC=$?
    REPORT_RC=0
    if [ -s "$SUMMARY_JSON" ]; then
        node "$HERE/scripts/loadtest-report.mjs" "$SUMMARY_JSON" "$REPORT"
        REPORT_RC=$?
    fi
    set -e
    rm -f "$SUMMARY_JSON"
    # A k6 failure (e.g. a threshold breach) takes priority; otherwise surface a
    # report-writing failure so a requested-but-unwritten report doesn't look OK.
    [ "$RC" -ne 0 ] && exit "$RC"
    exit "$REPORT_RC"
fi

if [ ${#K6_ARGS[@]} -gt 0 ]; then
    exec k6 run "${K6_ARGS[@]}" "$SCRIPT"
else
    exec k6 run "$SCRIPT"
fi
