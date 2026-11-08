#!/usr/bin/env bash
# Installed at /usr/local/sbin/rm-backend-deploy.sh on the VPS (see docs/SELF_HOSTING_OPS.md →
# "Migrations and edge functions on the official stack" → "Deploying from CI (#935)").
#
# Invoked, as root, through exactly one narrow sudoers rule granted to a restricted CI-only
# account that otherwise has no docker access at all:
#
#   rm-backend-deploy ALL=(root) NOPASSWD: /usr/local/sbin/rm-backend-deploy.sh ""
#
# The trailing "" matters: a sudoers command with no argument list at all still lets the
# caller pass arbitrary arguments, so without it the restriction below is unenforced.
#
# CI stages only the *data* this deploys — supabase/migrations/ and supabase/functions/ —
# into the rm-backend-deploy account's own home directory (no root needed for that part,
# it's just an SSH file copy). The *tools* that apply that data (stack-drift.py,
# deploy-edge-functions.sh) are deliberately NOT taken from that same CI-writable directory:
# root here only ever runs the copies installed alongside this wrapper under TOOLS_DIR,
# by a human, the same way this script itself is installed. If root instead executed
# whatever Python/bash happened to be staged by the unprivileged account, that account could
# replace those tools with anything and get them run as root — the sudo restriction to "one
# script" would stop meaning anything. A leaked rm-backend-deploy key can change what gets
# deployed (that's the whole point), never the deploy logic itself. Update all three files
# together — see the provisioning doc above.
#
# Both steps are no-ops (exit 0) when there's nothing pending, so it's safe to run on every
# deploy regardless of whether this push actually touched supabase/.
set -euo pipefail

INCOMING="${INCOMING:-/home/rm-backend-deploy/incoming}"
TOOLS_DIR="${TOOLS_DIR:-/usr/local/lib/rm-backend-deploy}"

[[ -d "$INCOMING/supabase/migrations" ]] || {
    echo "error: $INCOMING/supabase/migrations missing — was the snapshot staged correctly?" >&2
    exit 2
}
[[ -d "$INCOMING/supabase/functions" ]] || {
    echo "error: $INCOMING/supabase/functions missing — was the snapshot staged correctly?" >&2
    exit 2
}
[[ -f "$TOOLS_DIR/stack-drift.py" && -f "$TOOLS_DIR/deploy-edge-functions.sh" ]] || {
    echo "error: $TOOLS_DIR is missing stack-drift.py or deploy-edge-functions.sh — install them (as root) alongside this wrapper first." >&2
    exit 2
}

echo "== Applying pending migrations =="
python3 "$TOOLS_DIR/stack-drift.py" apply --yes --repo-dir "$INCOMING"

echo
echo "== Redeploying edge functions that differ =="
bash "$TOOLS_DIR/deploy-edge-functions.sh" --yes --repo-dir "$INCOMING"
