#!/bin/bash
# Shared helpers for the off-site backup scripts — source it after lib/compose.sh, don't run it.
#
# Off-site copies go to any S3-compatible bucket (Cloudflare R2, Backblaze B2, Wasabi, Storj, a
# MinIO on another machine) through rclone. Everything is encrypted on this server before upload by
# an rclone `crypt` remote (file contents and names), so the bucket provider never sees student
# data. Configuration lives in .env.backup next to docker-compose.yml — see .env.backup.example.

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-$COMPOSE_PROJECT_DIR/.env.backup}"
RCLONE_IMAGE="${RCLONE_IMAGE:-rclone/rclone:1.71.2}"

load_backup_env() {
    if [[ -f "$BACKUP_ENV_FILE" ]]; then
        set -a
        # shellcheck source=/dev/null
        source "$BACKUP_ENV_FILE"
        set +a
    fi
}

# Exits with every missing setting listed, so a half-configured server fails on its first run
# instead of skipping the upload while the local backup still reports success.
require_offsite_config() {
    local unset_vars=() var
    for var in OFFSITE_S3_ENDPOINT OFFSITE_S3_BUCKET OFFSITE_S3_ACCESS_KEY_ID OFFSITE_S3_SECRET_ACCESS_KEY \
        BACKUP_ENCRYPTION_PASSPHRASE; do
        [[ -n "${!var:-}" ]] || unset_vars+=("$var")
    done
    if ((${#unset_vars[@]} > 0)); then
        echo "Error: off-site backup is not configured. Missing in $BACKUP_ENV_FILE:" >&2
        printf "  - %s\n" "${unset_vars[@]}" >&2
        echo "Copy .env.backup.example to .env.backup and fill it in (docs/SELF_HOSTING_OPS.md → Off-site backups)." >&2
        exit 1
    fi
    if ((${#BACKUP_ENCRYPTION_PASSPHRASE} < 20)); then
        echo "Error: BACKUP_ENCRYPTION_PASSPHRASE must be at least 20 characters (generate one with: openssl rand -base64 32)." >&2
        exit 1
    fi
    export RCLONE_CONFIG_OFFSITE_TYPE=s3
    export RCLONE_CONFIG_OFFSITE_PROVIDER="${OFFSITE_S3_PROVIDER:-Other}"
    export RCLONE_CONFIG_OFFSITE_ENDPOINT="$OFFSITE_S3_ENDPOINT"
    export RCLONE_CONFIG_OFFSITE_REGION="${OFFSITE_S3_REGION:-auto}"
    export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$OFFSITE_S3_ACCESS_KEY_ID"
    export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$OFFSITE_S3_SECRET_ACCESS_KEY"
    # Object-scoped API tokens (R2, B2 application keys) may not create or inspect buckets.
    export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
    export RCLONE_CONFIG_VAULT_TYPE=crypt
    export RCLONE_CONFIG_VAULT_REMOTE="offsite:$OFFSITE_S3_BUCKET/${OFFSITE_S3_PREFIX:-rubricmaker}"
    export BACKUP_ENCRYPTION_PASSPHRASE
}

# Runs rclone with `dir` (an absolute host path) mounted at the same path in the container, so
# arguments can name host paths directly. The passphrase reaches rclone through the environment
# only, never the command line. OFFSITE_RCLONE replaces the container with another rclone command.
offsite_rclone() {
    local dir="$1"
    shift
    if [[ -n "${OFFSITE_RCLONE:-}" ]]; then
        RCLONE_CONFIG_VAULT_PASSWORD="$(printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | $OFFSITE_RCLONE obscure -)" \
            $OFFSITE_RCLONE --config "" "$@"
        return
    fi
    local -a env_args=()
    local var
    for var in $(compgen -e | grep -E '^(RCLONE_CONFIG_(OFFSITE|VAULT)_|BACKUP_ENCRYPTION_PASSPHRASE$)'); do
        env_args+=(-e "$var")
    done
    local -a net_args=()
    [[ -n "${OFFSITE_DOCKER_NETWORK:-}" ]] && net_args=(--network "$OFFSITE_DOCKER_NETWORK")
    docker run --rm "${net_args[@]}" --user "$(id -u):$(id -g)" "${env_args[@]}" \
        -e HOME=/tmp -v "$dir:$dir" --entrypoint sh "$RCLONE_IMAGE" \
        -c 'export RCLONE_CONFIG_VAULT_PASSWORD="$(printf %s "$BACKUP_ENCRYPTION_PASSPHRASE" | rclone obscure -)"; exec rclone --config "" "$@"' \
        rclone "$@"
}

# A backup directory is named by its timestamp (backup.sh); remote copies keep that name.
is_backup_name() {
    [[ "$1" =~ ^[0-9]{8}_[0-9]{6}$ ]]
}

# Remote backup names, oldest first.
offsite_list() {
    local dir="$1"
    offsite_rclone "$dir" lsf --dirs-only vault: | sed 's:/$::' | while read -r name; do
        if is_backup_name "$name"; then printf '%s\n' "$name"; fi
    done | sort
}

# The files every format-2 backup has; SHA256SUMS covers them.
BACKUP_FILES=(FORMAT data.sql migrations.txt storage.tar.gz)

write_checksums() {
    (cd "$1" && sha256sum "${BACKUP_FILES[@]}" > SHA256SUMS)
}

verify_checksums() {
    local dir="$1"
    if [[ ! -f "$dir/SHA256SUMS" ]]; then
        echo "Error: $dir has no SHA256SUMS, so its integrity cannot be checked." >&2
        return 1
    fi
    local file
    for file in "${BACKUP_FILES[@]}"; do
        if ! grep -qE "^[0-9a-f]{64}  $file\$" "$dir/SHA256SUMS"; then
            echo "Error: $dir/SHA256SUMS does not cover $file." >&2
            return 1
        fi
    done
    if ! (cd "$dir" && sha256sum --quiet -c SHA256SUMS); then
        echo "Error: checksum mismatch in $dir — the backup is corrupt or was modified." >&2
        return 1
    fi
}

# "<table>\t<rows>" for every table in a pg_dump data file, sorted. COPY's text format escapes
# newlines inside values, so each row is exactly one line between the `COPY <table> (...) FROM
# stdin;` header and its `\.` terminator.
dump_row_counts() {
    awk '
        /^COPY [^ ]+ .*FROM stdin;$/ { table = $2; rows = 0; inside = 1; next }
        inside && $0 == "\\." { print table "\t" rows; inside = 0; next }
        inside { rows++ }
    ' "$1" | sort
}

# Optional dead-man's-switch ping (Healthchecks.io, Better Stack, Uptime Kuma push monitors): a
# missed ping is the alert. A failing ping never fails the job that already succeeded.
ping_heartbeat() {
    local url="${1:-}"
    [[ -n "$url" ]] || return 0
    curl -fsS -m 10 --retry 3 -o /dev/null "$url" || echo "Warning: heartbeat ping to the configured URL failed." >&2
}
