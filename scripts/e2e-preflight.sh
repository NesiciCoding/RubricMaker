#!/usr/bin/env bash
#
# e2e-preflight.sh — verify the local Supabase edge runtime before running the
# Supabase E2E suite. Runs edge-fix.sh (detect + fix + boot probes).
#
# Warns but does not fail the suite if the runtime can't be verified, so CI
# (which runs a fresh `supabase start` with a healthy mount) is unaffected —
# the preflight is a no-op there, and a genuinely broken local runtime still
# lets the suite run (it will fail with informative 503 BootError responses).
#
# Distinguishes three outcomes from edge-fix.sh:
#   - healthy            → proceed with the suite
#   - no container found → warn (edge-fix exits 0; the runtime is absent, not OK)
#   - repair failed      → warn and continue
#
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[e2e-preflight] checking the Supabase edge runtime..."

if ! command -v docker >/dev/null 2>&1; then
    echo "[e2e-preflight] docker not available — skipping (the suite will fail loudly if Supabase isn't running)."
    exit 0
fi

OUT="$(bash "$HERE/edge-fix.sh" "$@" 2>&1)"
RC=$?
printf '%s\n' "$OUT"

if [ "$RC" -eq 0 ]; then
    if printf '%s' "$OUT" | grep -q "no edge-runtime container found"; then
        echo "[e2e-preflight] WARN: no Supabase edge-runtime container found — is the local stack running?"
        echo "[e2e-preflight] WARN: continuing; expect failures unless Supabase is available."
        exit 0
    fi
    echo "[e2e-preflight] edge runtime OK — starting Playwright."
    exit 0
fi

echo "[e2e-preflight] WARN: edge-fix reported a problem (see above); continuing anyway."
echo "[e2e-preflight] WARN: expect 503 BootError responses from /functions/v1/* unless the issue is resolved."
exit 0
