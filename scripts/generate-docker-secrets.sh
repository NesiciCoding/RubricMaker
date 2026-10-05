#!/bin/bash
# RubricMaker — generate the secrets docker-compose.yml requires
#
# Creates .env from .env.docker.example when it does not exist, then fills every EMPTY secret:
# POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY and JWT_JWKS. Values that are already set
# are never changed, so it is safe to run again. The API keys are HS256 JWTs signed with JWT_SECRET; if
# JWT_SECRET is generated here they are regenerated with it so the three always match.
#
# Usage (from the project root):
#   ./scripts/generate-docker-secrets.sh
#
# Rotating an existing installation is a separate, manual job: changing POSTGRES_PASSWORD on a database
# volume that already exists does not change the password inside Postgres.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
EXAMPLE_FILE="${ROOT_DIR}/.env.docker.example"

command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || cp "$EXAMPLE_FILE" "$ENV_FILE"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }

set_var() {
    local key="$1" value="$2" tmp
    tmp="$(mktemp)"
    if grep -qE "^${key}=" "$ENV_FILE"; then
        awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" } $1 == k { print k "=" v; next } { print }' "$ENV_FILE" >"$tmp"
    else
        cat "$ENV_FILE" >"$tmp"
        printf '%s=%s\n' "$key" "$value" >>"$tmp"
    fi
    cat "$tmp" >"$ENV_FILE"
    rm -f "$tmp"
}

jwt() {
    local role="$1" now exp header payload signature
    now="$(date +%s)"
    exp=$((now + 315360000))
    header="$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)"
    payload="$(printf '{"iss":"supabase","role":"%s","iat":%s,"exp":%s}' "$role" "$now" "$exp" | b64url)"
    signature="$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)"
    printf '%s.%s.%s' "$header" "$payload" "$signature"
}

changed=0

if [[ -z "$(get POSTGRES_PASSWORD)" ]]; then
    # Postgres only applies POSTGRES_PASSWORD the first time a data volume is created, so a new value would
    # lock every service out of an existing database.
    if command -v docker >/dev/null 2>&1; then
        existing_volume="$(docker volume ls -q 2>/dev/null | grep -E '(^|_)db-data$' | head -1 || true)"
        if [[ -n "$existing_volume" ]]; then
            echo "An existing database volume (${existing_volume}) was found, but POSTGRES_PASSWORD is empty in ${ENV_FILE}." >&2
            echo "The database keeps the password it was first created with (the old default was 'postgres')." >&2
            echo "Set POSTGRES_PASSWORD in ${ENV_FILE} to that password and run this script again." >&2
            exit 1
        fi
    fi
    set_var POSTGRES_PASSWORD "$(openssl rand -hex 16)"
    changed=1
fi

regenerate_keys=0
JWT_SECRET="$(get JWT_SECRET)"
if [[ -z "$JWT_SECRET" ]]; then
    JWT_SECRET="$(openssl rand -hex 32)"
    set_var JWT_SECRET "$JWT_SECRET"
    regenerate_keys=1
    changed=1
fi

if [[ "$regenerate_keys" == 1 || -z "$(get ANON_KEY)" ]]; then
    set_var ANON_KEY "$(jwt anon)"
    changed=1
fi
if [[ "$regenerate_keys" == 1 || -z "$(get SERVICE_ROLE_KEY)" ]]; then
    set_var SERVICE_ROLE_KEY "$(jwt service_role)"
    changed=1
fi
if [[ "$regenerate_keys" == 1 || -z "$(get JWT_JWKS)" ]]; then
    set_var JWT_JWKS "'{\"keys\":[{\"kty\":\"oct\",\"k\":\"$(printf '%s' "$JWT_SECRET" | b64url)\"}]}'"
    changed=1
fi

if [[ "$(get POSTGRES_PASSWORD)" == "postgres" || "$JWT_SECRET" == super-secret-jwt-token* ]]; then
    echo "Warning: ${ENV_FILE} still contains the old public demo credentials. They are left unchanged because" >&2
    echo "rotating them on an existing database needs extra steps; do not expose this installation." >&2
fi

if [[ "$changed" == 1 ]]; then
    echo "Secrets written to ${ENV_FILE}. Keep this file private and do not commit it."
else
    echo "All secrets in ${ENV_FILE} were already set; nothing changed."
fi
