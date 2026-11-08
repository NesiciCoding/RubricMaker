#!/usr/bin/env bash
# Installed at /usr/local/sbin/rm-backend-deploy.sh on the VPS (see docs/SELF_HOSTING_OPS.md →
# "Migrations and edge functions on the official stack" → "Deploying from CI (#935)").
#
# Invoked, as root, through exactly one narrow sudoers rule granted to a restricted CI-only
# account that otherwise has no docker access at all:
#
#   rm-backend-deploy ALL=(root) NOPASSWD: /usr/local/sbin/rm-backend-deploy.sh
#
# CI stages a snapshot of this repository's scripts/ and supabase/ directories into that
# account's own home directory (no root needed for that part — it's just an SSH file copy),
# then runs `ssh rm-backend-deploy@host sudo -n /usr/local/sbin/rm-backend-deploy.sh`. This
# script reads that staged snapshot and nothing else: it takes no arguments, so the sudoers
# rule above needs no argument wildcard (which would be harder to scope tightly).
#
# Both steps are no-ops (exit 0) when there's nothing pending, so it's safe to run on every
# deploy regardless of whether this push actually touched supabase/.
set -euo pipefail

INCOMING="${INCOMING:-/home/rm-backend-deploy/incoming}"

[[ -d "$INCOMING/supabase/migrations" ]] || {
    echo "error: $INCOMING/supabase/migrations missing — was the snapshot staged correctly?" >&2
    exit 2
}
[[ -d "$INCOMING/supabase/functions" ]] || {
    echo "error: $INCOMING/supabase/functions missing — was the snapshot staged correctly?" >&2
    exit 2
}

echo "== Applying pending migrations =="
python3 "$INCOMING/scripts/stack-drift.py" apply --yes --repo-dir "$INCOMING"

echo
echo "== Redeploying edge functions that differ =="
bash "$INCOMING/scripts/deploy-edge-functions.sh" --yes --repo-dir "$INCOMING"
