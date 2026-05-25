#!/bin/bash
# deploy.example.sh — Template for deploying RubricMaker to a VPS.
#
# SETUP:
#   cp deploy.example.sh deploy.sh
#   chmod +x deploy.sh
#   # Edit the configuration section below, then run: ./deploy.sh
#
# deploy.sh is listed in .gitignore so your personal credentials
# are never committed. This example file is safe to commit.
#
# See VIRTUALMIN_SETUP.md or HESTIACP_SETUP.md for full instructions.
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
# Edit these values before your first deploy.
DOMAIN="rubricmaker.example.com"      # Your domain, e.g. app.rubricmaker.nl
VPS_USER="rubricmaker"                # SSH username on the VPS (often root for HestiaCP)
VPS_HOST="YOUR_VPS_IP"               # VPS IP address or hostname
SSH_KEY=""                            # Path to SSH private key, e.g. ~/.ssh/id_ed25519
                                      # Leave blank to use your default SSH key (~/.ssh/id_*)

# ─── Web root path ────────────────────────────────────────────────────────────
# Uncomment the line that matches your control panel:

# Virtualmin:
# REMOTE_PATH="/home/${VPS_USER}/public_html"

# HestiaCP:
REMOTE_PATH="/home/${VPS_USER}/web/${DOMAIN}/public_html"

# ─── Helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
die()     { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; exit 1; }

# ─── Sanity checks ────────────────────────────────────────────────────────────
[[ "$DOMAIN" == "rubricmaker.example.com" ]] && \
    die "Edit DOMAIN in deploy.sh before running."
[[ "$VPS_HOST" == "YOUR_VPS_IP" ]] && \
    die "Edit VPS_HOST in deploy.sh before running."
command -v npm   >/dev/null 2>&1 || die "npm not found. Install Node.js 22+."
command -v rsync >/dev/null 2>&1 || die "rsync not found."

# ─── Build ────────────────────────────────────────────────────────────────────
info "Building (npm run build)..."

# Load .env if present so VITE_SUPABASE_* vars are injected
if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep '^VITE_' .env)
    set +a
    info "Loaded .env (VITE_* vars injected)"
fi

npm run build
info "Build complete — dist/ is ready."

# ─── Deploy ───────────────────────────────────────────────────────────────────
SSH_OPTS="-o StrictHostKeyChecking=accept-new"
if [[ -n "$SSH_KEY" ]]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

RSYNC_OPTS="-avz --delete --progress"
RSYNC_SHELL="ssh $SSH_OPTS"

info "Deploying dist/ → ${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}/ ..."
rsync $RSYNC_OPTS -e "$RSYNC_SHELL" dist/ "${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}/"

# ─── Copy .htaccess (first deploy or when it changes) ────────────────────────
# The .htaccess in deploy/ enables SPA routing, security headers, and caching.
if [[ -f deploy/.htaccess ]]; then
    info "Uploading deploy/.htaccess → ${REMOTE_PATH}/.htaccess"
    rsync -avz -e "$RSYNC_SHELL" deploy/.htaccess "${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}/.htaccess"
else
    warn "deploy/.htaccess not found — skipping. Apache security/cache headers will not be set."
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
info "Done. Visit https://${DOMAIN}"
