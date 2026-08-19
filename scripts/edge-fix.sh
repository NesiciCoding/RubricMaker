#!/usr/bin/env bash
#
# edge-fix.sh — repair a broken local Supabase edge-runtime container.
#
# The edge runtime serves your supabase/functions directory through a bind
# mount. That mount can silently detach — e.g. the project directory was
# deleted and recreated (docker keeps the old, now-empty directory), or the
# path isn't visible to the Docker daemon (sandboxed /tmp, remote daemon).
# The runtime then fails with:
#
#   worker boot error: failed to bootstrap runtime: failed to determine entrypoint
#
# and every /functions/v1/* call returns HTTP 503 (BootError) even with valid
# JWTs — the JWT check runs before boot, so a bad JWT would be a 401, not a 503.
#
# `docker start` cannot re-bind a mount, so the container must be recreated.
# This script detects the failure, stages the functions to a daemon-visible
# location when needed, and recreates the container with identical config
# (env, network, working dir, entrypoint, deno cache, compose labels).
#
# After (re)creating, it probes that the runtime actually boots workers:
#   1. GET /_internal/health on the edge runtime's own port, and
#   2. GET /functions/v1/<one function> through kong with the anon key.
#      (With an anon key, a healthy runtime answers anything but 503; a
#      detached mount answers 503 BootError. No auth gives 401 regardless,
#      which is why the probe authenticates.)
#
# Usage:
#   npm run edge:fix                # auto-detect the container for this project
#   bash scripts/edge-fix.sh <name> # target a specific container (e.g. supabase_edge_runtime_rm-459)
#
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
STAGING_ROOT="${EDGE_FIX_STAGING_ROOT:-$HOME/.rm-edge-functions}"
PROBE_IMAGE="alpine:latest"
EDGE_PORT="8081"
ENV_FILE=""

log()  { printf '[edge-fix] %s\n' "$*"; }
warn() { printf '[edge-fix] WARN: %s\n' "$*"; }
die()  { printf '[edge-fix] ERROR: %s\n' "$*" >&2; exit 1; }
trap 'rm -f "${ENV_FILE:-}"' EXIT

# ── 1. Locate the edge-runtime container ─────────────────────────────────────
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
    # A container whose functions mount points into this project…
    for c in $(docker ps -a --format '{{.Names}}' | grep -E '^(supabase_edge_runtime_|supabase-edge-functions)' || true); do
        if docker inspect "$c" --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' 2>/dev/null |
            grep -q "$PROJECT_ROOT/supabase/functions"; then
            TARGET="$c"
            break
        fi
    done
    # …or the CLI naming convention: supabase_edge_runtime_<project-dir-basename>.
    if [ -z "$TARGET" ] && docker inspect "supabase_edge_runtime_$PROJECT_NAME" >/dev/null 2>&1; then
        TARGET="supabase_edge_runtime_$PROJECT_NAME"
    fi
fi

if [ -z "$TARGET" ]; then
    warn "no edge-runtime container found for project '$PROJECT_NAME'."
    warn "start the stack first: npm run db:start  (or: supabase start)"
    exit 0
fi
docker inspect "$TARGET" >/dev/null 2>&1 || die "container '$TARGET' does not exist"

# ── 2. Inspect the container's functions mount ───────────────────────────────
FUNCTIONS_MOUNT="$(docker inspect "$TARGET" --format '{{range .Mounts}}{{.Source}}|{{.Destination}}{{println}}{{end}}' |
    grep 'supabase/functions' | head -1 || true)"
FUNCTIONS_SRC="${FUNCTIONS_MOUNT%%|*}"
FUNCTIONS_DEST="${FUNCTIONS_MOUNT#*|}"
if [ -z "$FUNCTIONS_SRC" ] || [ -z "$FUNCTIONS_DEST" ]; then
    die "could not find a supabase/functions mount on '$TARGET'"
fi
NETWORK="$(docker inspect "$TARGET" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')"
log "container '$TARGET' serves functions from '$FUNCTIONS_SRC'"

# ── 3. Detect a detached / daemon-invisible mount ────────────────────────────
HOST_FILES="$(ls -A "$FUNCTIONS_SRC" 2>/dev/null | wc -l | tr -d ' ')"
RUNNING="$(docker inspect "$TARGET" --format '{{.State.Running}}')"

# What does the Docker daemon actually see at the source path? (A bind mount
# resolves on the daemon's side; if that path is empty there, the worker can't
# find its entrypoint even though the files exist on disk.)
DAEMON_FILES="$(docker run --rm -v "$FUNCTIONS_SRC:/probe" "$PROBE_IMAGE" \
    sh -c 'ls -A /probe 2>/dev/null | wc -l' 2>/dev/null | tr -d ' ' || echo 0)"

NEED_RECREATE=0
if [ "$RUNNING" != "true" ]; then
    NEED_RECREATE=1
    log "'$TARGET' is not running"
fi
if [ "${HOST_FILES:-0}" -gt 0 ] && [ "${DAEMON_FILES:-0}" -eq 0 ]; then
    NEED_RECREATE=1
    log "functions mount is invisible to the Docker daemon ($HOST_FILES files on disk, 0 visible to it)"
fi
if [ "$RUNNING" = "true" ] && [ "$NEED_RECREATE" = 0 ]; then
    CONT_FILES="$(docker exec "$TARGET" sh -c "ls -A '$FUNCTIONS_DEST' 2>/dev/null | wc -l" | tr -d ' ')"
    if [ "${CONT_FILES:-0}" -eq 0 ] && [ "${HOST_FILES:-0}" -gt 0 ]; then
        NEED_RECREATE=1
        log "container sees an empty functions dir ($HOST_FILES files on disk)"
    fi
fi
if [ "${HOST_FILES:-0}" -eq 0 ]; then
    die "the functions directory '$FUNCTIONS_SRC' is empty or missing — restore the functions first (git checkout / git pull), then re-run."
fi

# ── 4. Capture config / stage / recreate ─────────────────────────────────────
# Bootstrap script lives in Entrypoint for CLI-created containers
# (['sh','-c',<script>]) but in Cmd for docker-run-created ones (Entrypoint
# ['sh'], Cmd ['-c',<script>]). Handle both layouts.
capture_config() {
    IMG="$(docker inspect "$TARGET" --format '{{.Config.Image}}')"
    # The functions config (env) resolves entrypoints as `cwd + supabase/functions/<fn>/index.ts`,
    # so the working dir must be the mount destination's grandparent. Copying the old
    # container's workdir is not safe — a broken container may have a stale one
    # (e.g. pointing at a deleted project path).
    WORKDIR="$(dirname "$(dirname "$FUNCTIONS_DEST")")"
    OLD_WORKDIR="$(docker inspect "$TARGET" --format '{{.Config.WorkingDir}}')"
    if [ -n "$OLD_WORKDIR" ] && [ "$OLD_WORKDIR" != "$WORKDIR" ]; then
        warn "working dir was '$OLD_WORKDIR'; using '$WORKDIR' (derived from the functions mount)"
    fi
    ENTRY_SCRIPT="$(docker inspect "$TARGET" --format \
        '{{if eq (len .Config.Entrypoint) 3}}{{index .Config.Entrypoint 2}}{{else}}{{index .Config.Cmd 1}}{{end}}')"
    DENO_VOL="$(docker inspect "$TARGET" --format '{{range .Mounts}}{{if eq .Destination "/root/.cache/deno"}}{{.Name}}{{end}}{{end}}')"
    [ -n "$IMG" ] || die "could not read the container image"
    [ -n "$WORKDIR" ] || die "could not read the container working directory"
    [ -n "$NETWORK" ] || die "could not read the container network"
    [ -n "$ENTRY_SCRIPT" ] || die "could not read the container entrypoint (expected ['sh','-c',<script>])"
    if [ -z "$DENO_VOL" ]; then
        DENO_VOL="supabase_edge_runtime_${TARGET#supabase_edge_runtime_}"
        warn "no deno cache volume found; docker will create '$DENO_VOL'"
    fi
    ENV_FILE="$(mktemp)"
    docker inspect "$TARGET" --format '{{range .Config.Env}}{{println .}}{{end}}' >"$ENV_FILE"
    LABELS=()
    while IFS= read -r l; do
        if [ -n "$l" ]; then
            LABELS+=(-l "$l")
        fi
    done < <(docker inspect "$TARGET" --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}')
}

recreate() {
    capture_config
    MOUNT_SRC="$FUNCTIONS_SRC"
    # Re-check daemon visibility: stage to a daemon-visible path if needed.
    if [ "${HOST_FILES:-0}" -gt 0 ] && [ "${DAEMON_FILES:-0}" -eq 0 ]; then
        STAGE_DIR="$STAGING_ROOT/${TARGET#supabase_edge_runtime_}"
        mkdir -p "$STAGE_DIR"
        cp -a "$FUNCTIONS_SRC/." "$STAGE_DIR/"
        MOUNT_SRC="$STAGE_DIR"
        log "staged functions to daemon-visible '$MOUNT_SRC'"
    fi
    log "recreating '$TARGET' (image $IMG, network $NETWORK)"
    docker rm -f "$TARGET" >/dev/null
    docker run -d --name "$TARGET" \
        "${LABELS[@]}" \
        --network "$NETWORK" \
        --workdir "$WORKDIR" \
        -v "$MOUNT_SRC:$FUNCTIONS_DEST" \
        -v "$DENO_VOL:/root/.cache/deno" \
        --env-file "$ENV_FILE" \
        --entrypoint sh \
        "$IMG" -c "$ENTRY_SCRIPT"
    sleep 4
    STATUS="$(docker inspect "$TARGET" --format '{{.State.Status}}')"
    [ "$STATUS" = "running" ] || die "'$TARGET' failed to start — see: docker logs $TARGET"
}

# ── 5. Boot probes ───────────────────────────────────────────────────────────
probe_health() {
    local out
    out="$(docker run --rm --network "$NETWORK" "$PROBE_IMAGE" \
        wget -qO- -T 5 "http://$TARGET:$EDGE_PORT/_internal/health" 2>/dev/null || true)"
    case "$out" in *ok*) return 0;; esac
    return 1
}

find_kong() {
    # Prefer a kong container on the same network as the edge runtime (the
    # one that actually proxies THIS stack), then fall back to common names.
    local c name
    for c in $(docker ps -q --filter "network=$NETWORK"); do
        name="$(docker inspect "$c" --format '{{.Name}}' | sed 's#^/##')"
        case "$name" in *kong*) KONG="$name"; return 0;; esac
    done
    for c in "supabase-kong" "supabase_kong_${PROJECT_NAME}"; do
        docker inspect "$c" >/dev/null 2>&1 && { KONG="$c"; return 0; }
    done
    return 1
}

# Call one function through kong with the anon key. Healthy runtime: anything
# but 503/502 (401/403/404/405/… all prove the worker booted). Detached mount:
# 503 BootError. Returns 0 = booted, 1 = failed, 2 = skipped (no kong/token).
probe_kong() {
    local code="" port=""
    [ -n "${KONG:-}" ] || find_kong || { warn "no kong container found — skipping the function probe."; return 2; }
    port="$(docker port "$KONG" 8000/tcp 2>/dev/null | head -1 | grep -oE '[0-9]+$' || true)"
    if [ -n "$port" ]; then
        code="$(curl -s -m 15 -o /dev/null -w '%{http_code}' \
            -H "Authorization: Bearer $ANON_KEY" \
            "http://127.0.0.1:$port/functions/v1/$PROBE_FUNC" || true)"
    else
        # No published port — probe from inside the network.
        code="$(docker run --rm --network "$NETWORK" "$PROBE_IMAGE" sh -c \
            "wget -q -S -O /dev/null --header='Authorization: Bearer $ANON_KEY' -T 10 \
            http://$KONG:8000/functions/v1/$PROBE_FUNC 2>&1 | grep -oE 'HTTP/[0-9.]+ [0-9]{3}' | tail -1" \
            | grep -oE '[0-9]{3}$' || true)"
    fi
    log "function probe: GET /functions/v1/$PROBE_FUNC via kong -> ${code:-no response}"
    [ -n "$code" ] && [ "$code" != "503" ] && [ "$code" != "502" ]
}

run_probes() {
    local failed=0
    if probe_health; then
        log "health probe OK (/$EDGE_PORT/_internal/health)"
    else
        warn "health probe FAILED — the runtime is not answering on port $EDGE_PORT"
        failed=1
    fi
    # Token for the kong probe: the edge container env carries the anon key in
    # one of these forms, depending on CLI version.
    ANON_KEY="$(docker inspect "$TARGET" --format '{{range .Config.Env}}{{println .}}{{end}}' |
        grep -E '^SUPABASE_(ANON_KEY|INTERNAL_PUBLISHABLE_KEY|SERVICE_ROLE_KEY)=' | head -1 | cut -d= -f2- || true)"
    if [ -n "$PROBE_FUNC" ] && [ -n "$ANON_KEY" ]; then
        if probe_kong; then
            log "function probe OK — the runtime boots workers"
        else
            warn "function probe FAILED — the runtime still cannot boot workers"
            failed=1
        fi
    else
        warn "no probe function or anon key available — skipping the kong function probe (health probe only)"
    fi
    return $failed
}

PROBE_FUNC=""
for cand in get-test-assignment get-essay-assignment; do
    [ -d "$FUNCTIONS_SRC/$cand" ] && PROBE_FUNC="$cand" && break
done
[ -z "$PROBE_FUNC" ] && PROBE_FUNC="$(ls -A "$FUNCTIONS_SRC" 2>/dev/null | grep -v '^\.' | head -1 || true)"

# ── 6. Main: fix if needed, then verify with probes ──────────────────────────
RECREATED=0
if [ "$NEED_RECREATE" = 1 ]; then
    recreate
    RECREATED=1
fi

if ! run_probes; then
    if [ "$RECREATED" = 0 ]; then
        log "probes failed although the container looked healthy — recreating as a fix attempt"
        recreate
        RECREATED=1
        run_probes || die "'$TARGET' still fails the probes after recreation — see: docker logs $TARGET"
    else
        die "'$TARGET' still fails the probes after recreation — see: docker logs $TARGET"
    fi
fi

EFFECTIVE_SRC="$(docker inspect "$TARGET" --format '{{range .Mounts}}{{if eq .Destination "'"$FUNCTIONS_DEST"'"}}{{.Source}}{{end}}{{end}}')"
log "done — '$TARGET' serves functions from '$EFFECTIVE_SRC' and boots workers."
