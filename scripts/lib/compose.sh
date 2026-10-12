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

# docker-compose.yml pins `name: rubricmaker`, so the volume is rubricmaker_storage-data unless
# COMPOSE_PROJECT_NAME overrides the project name. STORAGE_VOLUME overrides it outright.
STORAGE_VOLUME="${STORAGE_VOLUME:-${COMPOSE_PROJECT_NAME:-rubricmaker}_storage-data}"
