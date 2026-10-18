#!/bin/bash
# Shared helpers for the ops scripts — source it, don't run it.

# Compose v2 ships as `docker compose`; older servers only have the standalone v1 `docker-compose`.
# Resolved lazily so a script whose DB_EXEC points elsewhere still runs without either.
require_compose() {
    if [[ -n "${COMPOSE:-}" ]]; then return 0; fi
    if docker compose version >/dev/null 2>&1; then
        COMPOSE="docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        COMPOSE="docker-compose"
    else
        echo "Error: neither 'docker compose' nor 'docker-compose' is installed." >&2
        exit 1
    fi
}

# How ops scripts run pg_dump/psql in the `db` service. The image's pg_hba.conf only lets
# supabase_admin in over the local socket with a password, but trusts loopback TCP inside the
# container, so connect through 127.0.0.1 instead of the socket.
db_exec_default() {
    printf '%s exec -T -e PGHOST=127.0.0.1 db' "$COMPOSE"
}

# Compose resolves its project directory from COMPOSE_FILE when one is given, otherwise from the
# directory the compose file is found in; compose.sh lives in scripts/lib/, so this repo is the
# fallback. The project's .env is read from there.
if [[ -n "${COMPOSE_FILE:-}" ]]; then
    COMPOSE_PROJECT_DIR="$(cd "$(dirname "$COMPOSE_FILE")" && pwd)"
else
    COMPOSE_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# The project name behind the uploads volume, resolved the way Compose resolves it: the
# -p/--project-name flag on the compose command, then COMPOSE_PROJECT_NAME from the environment or
# the project's .env, then the top-level `name:` in the compose file. Reading COMPOSE_PROJECT_NAME
# alone misses the flag and a .env this shell never loaded — backup.sh would then archive an empty,
# freshly created volume while restore.sh overwrote an unrelated one.
compose_project_from_flags() {
    local -a parts
    read -r -a parts <<< "${COMPOSE:-}"
    local i
    for ((i = 0; i < ${#parts[@]}; i++)); do
        case "${parts[i]}" in
            -p | --project-name)
                printf '%s' "${parts[i + 1]:-}"
                return 0
                ;;
            --project-name=*)
                printf '%s' "${parts[i]#*=}"
                return 0
                ;;
        esac
    done
    return 1
}

compose_project_from_env_file() {
    local env_file="$COMPOSE_PROJECT_DIR/.env"
    [[ -f "$env_file" ]] || return 1
    local value
    value=$(sed -n 's/^[[:space:]]*COMPOSE_PROJECT_NAME[[:space:]]*=[[:space:]]*//p' "$env_file" | tail -n 1)
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    [[ -n "$value" ]] || return 1
    printf '%s' "$value"
}

compose_project_from_file() {
    local file="${COMPOSE_FILE:-$COMPOSE_PROJECT_DIR/docker-compose.yml}"
    [[ -f "$file" ]] || return 1
    local value
    value=$(sed -n 's/^name:[[:space:]]*\([^[:space:]#]*\).*/\1/p' "$file" | head -n 1)
    [[ -n "$value" ]] || return 1
    printf '%s' "$value"
}

resolve_compose_project() {
    local project
    project=$(compose_project_from_flags || true)
    if [[ -z "$project" ]]; then project="${COMPOSE_PROJECT_NAME:-}"; fi
    if [[ -z "$project" ]]; then project=$(compose_project_from_env_file || true); fi
    if [[ -z "$project" ]]; then project=$(compose_project_from_file || true); fi
    printf '%s' "${project:-rubricmaker}"
}

# docker-compose.yml pins `name: rubricmaker`, so the volume is rubricmaker_storage-data unless the
# project name says otherwise. STORAGE_VOLUME overrides the result outright.
resolve_storage_volume() {
    if [[ -n "${STORAGE_VOLUME:-}" ]]; then
        printf '%s' "$STORAGE_VOLUME"
        return 0
    fi
    printf '%s_storage-data' "$(resolve_compose_project)"
}

STORAGE_VOLUME="$(resolve_storage_volume)"
