#!/usr/bin/env bash
#
# e2e-preflight.sh — verify the local Supabase edge runtime before running the
# Supabase E2E suite. Runs edge-fix.sh (detect + fix + boot probes).
#
# Warns but does not fail the suite if the fix can't be applied, so CI (which
# runs a fresh `supabase start` with a healthy mount) is unaffected — the
# preflight is a no-op there, and a genuinely broken local runtime still lets
# the suite run (it will fail with informative 503 BootError responses).
#
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[e2e-preflight] checking the Supabase edge runtime..."

if ! command -v docker >/dev/null 2>&1; then
    echo "[e2e-preflight] docker not available — skipping (the suite will fail loudly if Supabase isn't running)."
    exit 0
fi

if bash "$HERE/edge-fix.sh" "$@"; then
    echo "[e2e-preflight] edge runtime OK — starting Playwright."
    exit 0
fi

echo "[e2e-preflight] WARN: edge-fix reported a problem (see above); continuing anyway."
echo "[e2e-preflight] WARN: expect 503 BootError responses from /functions/v1/* unless the issue is resolved."
exit 0
