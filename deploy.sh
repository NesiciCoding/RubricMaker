#!/bin/bash
# deploy.sh — Build RubricMaker locally and rsync to a Virtualmin VPS.
# See VIRTUALMIN_SETUP.md for full setup instructions.
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
# Edit these four values before your first deploy.
DOMAIN="rubricmaker.example.com"
VPS_USER="rubricmaker"          # Virtualmin Unix username for the virtual server
VPS_HOST="YOUR_VPS_IP"          # VPS IP address or hostname
SSH_KEY=""                      # Path to SSH private key, e.g. ~/.ssh/rubricmaker_deploy
                                # Leave blank to use your default SSH key (~/.ssh/id_*)

# Virtualmin web root: /home/<user>/public_html/
REMOTE_PATH="/home/${VPS_USER}/public_html"

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
command -v npm  >/dev/null 2>&1 || die "npm not found. Install Node.js 22+."
command -v rsync >/dev/null 2>&1 || die "rsync not found."

# ─── Build ────────────────────────────────────────────────────────────────────
info "Building (npm run build)..."

# Load .env if present so VITE_SUPABASE_* vars are injected
if [[ -f .env ]]; then
    # Export only VITE_ prefixed variables (safe for build-time injection)
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
# The .htaccess in deploy/ enables security headers and caching rules.
# It is separate from dist/ so rsync --delete doesn't remove it.
if [[ -f deploy/.htaccess ]]; then
    info "Uploading deploy/.htaccess → ${REMOTE_PATH}/.htaccess"
    rsync -avz -e "$RSYNC_SHELL" deploy/.htaccess "${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}/.htaccess"
else
    warn "deploy/.htaccess not found — skipping. Apache security/cache headers will not be set."
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
info "Done. Visit https://${DOMAIN}"
