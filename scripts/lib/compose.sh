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
# container, so connect through 127.0.0.1 instead of the socket. Use as
# `$COMPOSE "${DB_EXEC_ARGS[@]}" psql …`, or db_exec_default for a DB_EXEC string.
DB_EXEC_ARGS=(exec -T -e PGHOST=127.0.0.1 db)
db_exec_default() {
    printf '%s %s' "$COMPOSE" "${DB_EXEC_ARGS[*]}"
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

# STORAGE_DIR points the scripts at a bind-mount path instead of a named volume — the official
# Supabase self-hosting stack keeps uploads in ./volumes/storage next to its own compose file, not
# a Docker volume. `docker run -v` accepts a host path exactly like a volume name, so every script
# that mounts STORAGE_SRC needs no separate code path for the two cases.
if [[ -n "${STORAGE_DIR:-}" ]]; then
    STORAGE_SRC="$STORAGE_DIR"
else
    STORAGE_SRC="$STORAGE_VOLUME"
fi

storage_source_exists() {
    if [[ -n "${STORAGE_DIR:-}" ]]; then
        [[ -d "$STORAGE_DIR" ]]
    else
        docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1
    fi
}

storage_source_missing_message() {
    if [[ -n "${STORAGE_DIR:-}" ]]; then
        echo "Error: uploads directory '$STORAGE_DIR' (STORAGE_DIR) does not exist."
    else
        echo "Error: uploads volume '$STORAGE_VOLUME' does not exist."
        echo "       It is named <compose project>_storage-data, so start the stack (docker compose up -d)"
        echo "       or set COMPOSE_PROJECT_NAME/STORAGE_VOLUME to the project it actually runs as."
        echo "       Running against the official Supabase stack instead? Set STORAGE_DIR to its"
        echo "       ./volumes/storage bind mount rather than STORAGE_VOLUME."
    fi
    echo "       See docs/SELF_HOSTING_OPS.md → Backup and Restore."
}

# The table + column backup.sh/restore.sh read "which migrations are applied" from. This repo's
# own docker/migrate.sh writes public._migrations(name); a stack migrated with the Supabase CLI
# (`supabase db push`) tracks supabase_migrations.schema_migrations(version) instead. Detected from
# the live database; MIGRATIONS_TABLE/MIGRATIONS_COLUMN override it outright. Prints "table column".
migrations_source() {
    local db_exec="$1"
    if [[ -n "${MIGRATIONS_TABLE:-}" ]]; then
        printf '%s %s' "$MIGRATIONS_TABLE" "${MIGRATIONS_COLUMN:-name}"
        return 0
    fi
    if [[ -n "$($db_exec psql -U supabase_admin -d postgres -tA -c "SELECT to_regclass('public._migrations')" < /dev/null)" ]]; then
        printf '%s %s' "public._migrations" "name"
        return 0
    fi
    if [[ -n "$($db_exec psql -U supabase_admin -d postgres -tA -c "SELECT to_regclass('supabase_migrations.schema_migrations')" < /dev/null)" ]]; then
        printf '%s %s' "supabase_migrations.schema_migrations" "version"
        return 0
    fi
    echo "Error: no migrations table found (checked public._migrations and supabase_migrations.schema_migrations)." >&2
    echo "       Set MIGRATIONS_TABLE/MIGRATIONS_COLUMN to override." >&2
    return 1
}
