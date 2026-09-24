#!/bin/bash
# RubricMaker — start the local Supabase stack in CI, resilient to ghcr.io rate limits
#
# `supabase start` pulls ~15 images from ghcr.io on a fresh runner. Anonymous pulls from
# shared GitHub-hosted runner IPs get throttled (`toomanyrequests`), which fails the job
# before any test runs. This script:
#   1. logs Docker in to ghcr.io when GHCR_TOKEN is set (authenticated pulls are not subject
#      to the anonymous limit); a failed login only warns, falling back to anonymous pulls;
#   2. retries `supabase start` with backoff, stopping the half-started stack in between.
#
# Usage (from a workflow step):
#   env:
#     GHCR_USER: ${{ github.actor }}
#     GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
#   run: ./scripts/ci-supabase-start.sh
#
# Env: SUPABASE_START_ATTEMPTS (default 3), SUPABASE_START_BACKOFF_SECONDS (default 30; the
# wait before attempt n is n-1 times this).

set -euo pipefail

ATTEMPTS="${SUPABASE_START_ATTEMPTS:-3}"
BACKOFF="${SUPABASE_START_BACKOFF_SECONDS:-30}"

if [ -n "${GHCR_TOKEN:-}" ]; then
    if printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-github-actions}" --password-stdin >/dev/null 2>&1; then
        echo "Logged in to ghcr.io; image pulls are authenticated."
    else
        echo "::warning::docker login to ghcr.io failed; falling back to anonymous (rate-limited) pulls."
    fi
fi

for attempt in $(seq 1 "$ATTEMPTS"); do
    if supabase start; then
        exit 0
    fi
    if [ "$attempt" -lt "$ATTEMPTS" ]; then
        wait_seconds=$(( attempt * BACKOFF ))
        echo "::warning::supabase start failed (attempt $attempt/$ATTEMPTS); retrying in ${wait_seconds}s"
        supabase stop --no-backup || true
        sleep "$wait_seconds"
    fi
done

echo "::error::supabase start failed after $ATTEMPTS attempts"
exit 1
