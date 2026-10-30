#!/usr/bin/env bash
# RubricMaker — read-only health and hardening check for a production host running HestiaCP
# (frontend) and the official Supabase Docker stack (backend). Each check prints PASS, WARN, FAIL
# or INFO, plus the issue that tracks the fix.
#
# It changes nothing: it reads files, runs SELECT/SHOW queries through `docker exec … psql`, and
# sends GET/HEAD requests to your own domains. Secret values are never printed, only whether they
# look like the upstream defaults.
#
# Usage (as root, or a user in the docker group with sudo for the host checks):
#
#   sudo bash scripts/audit-live-stack.sh \
#       --app-url https://rubricmaker.nl \
#       --api-url https://supabase.rubricmaker.nl \
#       [--supabase-dir /opt/supabase/docker] \
#       [--repo-dir /path/to/a/RubricMaker/checkout] \
#       [--backup-dir /path/to/backups] \
#       | tee audit-$(date +%F).txt
#
#   --supabase-dir  The official stack's compose directory (holds .env and volumes/). Detected from
#                   the supabase-db container's compose labels when omitted.
#   --repo-dir      A checkout of this repository on the server, used to compare migrations and
#                   edge functions with what is deployed. Without it those checks are skipped.
#                   (`git clone --depth 1 https://github.com/NesiciCoding/RubricMaker /tmp/rm`)
#   --backup-dir    Where pg_dump-based backups land, to check the newest one's age.
#
# Exit status: 0 when nothing FAILed, 1 otherwise. Re-run after each fix.

set -uo pipefail

APP_URL=""
API_URL=""
SUPABASE_DIR=""
REPO_DIR=""
BACKUP_DIR=""
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

usage() { sed -n '2,/^# Exit status/p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --app-url) APP_URL="${2:-}"; shift 2 ;;
        --api-url) API_URL="${2:-}"; shift 2 ;;
        --supabase-dir) SUPABASE_DIR="${2:-}"; shift 2 ;;
        --repo-dir) REPO_DIR="${2:-}"; shift 2 ;;
        --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
        -h | --help) usage; exit 0 ;;
        *) echo "Unknown argument: $1 (see --help)" >&2; exit 2 ;;
    esac
done

if [[ -t 1 ]]; then
    C_PASS=$'\e[32m' C_WARN=$'\e[33m' C_FAIL=$'\e[31m' C_INFO=$'\e[36m' C_OFF=$'\e[0m' C_B=$'\e[1m'
else
    C_PASS="" C_WARN="" C_FAIL="" C_INFO="" C_OFF="" C_B=""
fi
N_PASS=0 N_WARN=0 N_FAIL=0

pass() { N_PASS=$((N_PASS + 1)); printf '%s[PASS]%s %s\n' "$C_PASS" "$C_OFF" "$1"; }
warn() { N_WARN=$((N_WARN + 1)); printf '%s[WARN]%s %s\n' "$C_WARN" "$C_OFF" "$1"; [[ -n "${2:-}" ]] && printf '       → %s\n' "$2"; return 0; }
fail() { N_FAIL=$((N_FAIL + 1)); printf '%s[FAIL]%s %s\n' "$C_FAIL" "$C_OFF" "$1"; [[ -n "${2:-}" ]] && printf '       → %s\n' "$2"; return 0; }
info() { printf '%s[INFO]%s %s\n' "$C_INFO" "$C_OFF" "$1"; }
section() { printf '\n%s== %s ==%s\n' "$C_B" "$1" "$C_OFF"; }
have() { command -v "$1" >/dev/null 2>&1; }
as_root() { [[ $EUID -eq 0 ]]; }

# GNU coreutils' `timeout` is missing on macOS and BSD. The audit normally runs on the Linux host,
# but it is also run from developer machines, so run unbounded rather than fail where it is absent.
with_timeout() {
    local secs="$1"
    shift
    if have timeout; then timeout "$secs" "$@"; else "$@"; fi
}

# Epoch seconds for a certificate's `notAfter` ("Sep  1 12:00:00 2026 GMT"): GNU date -d, BSD date -j.
# An empty value is rejected outright: `date -d ''` succeeds and means the start of today, which
# would turn a failed TLS probe into a certificate that "expires today".
epoch_of() {
    local value="${1:-}"
    [[ -n "${value// /}" ]] || return 1
    date -d "$value" +%s 2>/dev/null || date -j -f '%b %d %H:%M:%S %Y %Z' "$value" +%s 2>/dev/null
}

# Value of KEY in a dotenv file, without sourcing it (the file may contain shell metacharacters).
env_value() {
    local file="$1" key="$2"
    [[ -r "$file" ]] || return 1
    grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//; s/^['\"]//; s/['\"][[:space:]]*$//"
}

url_host() { sed -E 's#^[a-z]+://##; s#[/:].*$##' <<<"$1"; }

jwt_claim() {
    local payload pad
    payload="$(cut -d. -f2 <<<"$1" | tr '_-' '/+')"
    pad=$(((4 - ${#payload} % 4) % 4))
    payload="$payload$(printf '%*s' "$pad" '' | tr ' ' '=')"
    base64 -d 2>/dev/null <<<"$payload" | grep -o "\"$2\":\"[^\"]*\"" | cut -d'"' -f4
}

DOCKER_OK=0
if have docker && docker info >/dev/null 2>&1; then DOCKER_OK=1; fi
DB_OK=0
DB_USER="supabase_admin"

# psql inside the db container over loopback TCP, which the Supabase image trusts (see #926).
# A password, when needed, travels through the environment, never on the command line (ps). -w
# makes psql fail instead of waiting on a password prompt that 2>/dev/null would hide.
psql_q() {
    local envargs=(-e PGHOST=127.0.0.1)
    [[ -n "${PGPASSWORD_ENV:-}" ]] && envargs+=(-e PGPASSWORD)
    PGPASSWORD="${PGPASSWORD_ENV:-}" with_timeout 30 docker exec "${envargs[@]}" "$DB_CONTAINER" \
        psql -w -U "$DB_USER" -d postgres -XAtq -v ON_ERROR_STOP=1 -F '|' -c "$1" 2>/dev/null
}

printf '%sRubricMaker live-stack audit — %s on %s%s\n' "$C_B" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(hostname)" "$C_OFF"
as_root || info "Not running as root: SSH, firewall, OOM-history and service checks may be incomplete."

# ── Stack ─────────────────────────────────────────────────────────────────────────────────────────
section "Stack"
if [[ $DOCKER_OK -eq 0 ]]; then
    fail "Docker is not reachable from this shell" "Run as root or a member of the docker group."
else
    if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
        pass "Official Supabase stack detected ($DB_CONTAINER running)"
        if [[ -z "$SUPABASE_DIR" ]]; then
            SUPABASE_DIR="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$DB_CONTAINER" 2>/dev/null)"
        fi
    else
        fail "No '$DB_CONTAINER' container" "Set DB_CONTAINER=<name> if your stack uses another name."
    fi
    info "Containers: $(docker ps --format '{{.Names}}' | sort | tr '\n' ' ')"
    if [[ -n "$SUPABASE_DIR" && -d "$SUPABASE_DIR" ]]; then
        info "Supabase stack directory: $SUPABASE_DIR"
    else
        warn "Supabase stack directory not found; .env checks are skipped" "Pass --supabase-dir."
        SUPABASE_DIR=""
    fi
fi
ENV_FILE="${SUPABASE_DIR:+$SUPABASE_DIR/.env}"
if [[ -n "$ENV_FILE" && -r "$ENV_FILE" ]]; then
    [[ -z "$API_URL" ]] && API_URL="$(env_value "$ENV_FILE" SUPABASE_PUBLIC_URL || true)"
    [[ -z "$API_URL" ]] && API_URL="$(env_value "$ENV_FILE" API_EXTERNAL_URL || true)"
    [[ -z "$APP_URL" ]] && APP_URL="$(env_value "$ENV_FILE" SITE_URL || true)"
fi
info "App URL: ${APP_URL:-<unset>}   API URL: ${API_URL:-<unset>}"

# ── Secrets and auth config ───────────────────────────────────────────────────────────────────────
section "Secrets and auth config (#930)"
if [[ -n "$ENV_FILE" && -r "$ENV_FILE" ]]; then
    # GNU stat takes -c, BSD/macOS stat takes -f. The audit runs on a Linux host, but its
    # tests run on developer machines too — a failed stat must not abort the checks.
    mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || true)"
    if [[ -z "$mode" ]]; then
        # Neither stat flavour answered. Reporting PASS here would claim the file is safe without
        # having looked at it, which is the failure mode this check exists to catch.
        warn "Could not read the permissions on $ENV_FILE" \
            "stat -c %a on GNU, stat -f %Lp on BSD; confirm by hand that only the stack user can read it."
    elif [[ "${mode: -1}" =~ [4-7] ]]; then
        fail "$ENV_FILE is world-readable (mode $mode)" "chmod 600 $ENV_FILE"
    else
        pass "$ENV_FILE is not world-readable (mode $mode)"
    fi

    defaults_hit=()
    for key in POSTGRES_PASSWORD JWT_SECRET DASHBOARD_PASSWORD SECRET_KEY_BASE VAULT_ENC_KEY PG_META_CRYPTO_KEY \
        LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN; do
        val="$(env_value "$ENV_FILE" "$key" || true)"
        [[ -z "$val" ]] && continue
        if [[ "$val" =~ your-|super-secret|this_password_is_insecure|UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1 ]]; then
            defaults_hit+=("$key")
        fi
    done
    if [[ ${#defaults_hit[@]} -gt 0 ]]; then
        fail "Upstream example values still in use: ${defaults_hit[*]}" \
            "Generate new secrets (supabase.com/docs/guides/self-hosting/docker#securing-your-services); rotating JWT_SECRET means new ANON_KEY/SERVICE_ROLE_KEY and a frontend rebuild."
    else
        pass "No upstream example secrets found"
    fi
    jwt="$(env_value "$ENV_FILE" JWT_SECRET || true)"
    if [[ -n "$jwt" && ${#jwt} -lt 32 ]]; then fail "JWT_SECRET is shorter than 32 characters"; fi
    for key in ANON_KEY SERVICE_ROLE_KEY; do
        tok="$(env_value "$ENV_FILE" "$key" || true)"
        [[ -z "$tok" ]] && continue
        if [[ "$(jwt_claim "$tok" iss)" == "supabase-demo" ]]; then
            fail "$key is the public demo key (iss=supabase-demo): anyone can mint requests" "Generate keys from your own JWT_SECRET."
        else
            pass "$key is not the demo key"
        fi
    done
    [[ "$(env_value "$ENV_FILE" DASHBOARD_USERNAME || true)" == "supabase" ]] &&
        warn "DASHBOARD_USERNAME is the default 'supabase'" "Change it together with DASHBOARD_PASSWORD."
    [[ "$(env_value "$ENV_FILE" ENABLE_EMAIL_AUTOCONFIRM || true)" == "true" ]] &&
        warn "ENABLE_EMAIL_AUTOCONFIRM=true: sign-ups are never verified by email" "Set it to false once SMTP works (#875)."
    smtp="$(env_value "$ENV_FILE" SMTP_HOST || true)"
    if [[ -z "$smtp" ]]; then
        fail "SMTP_HOST is empty: sign-in codes cannot be sent" "#875"
    elif [[ "$smtp" == "supabase-mail" || "$smtp" == "inbucket" || "$smtp" == "mailpit" ]]; then
        fail "SMTP_HOST=$smtp is the stack's test mail catcher: real users never receive codes" "#875"
    else
        pass "SMTP relay configured ($smtp)"
    fi
    for p in GOOGLE AZURE; do
        [[ "$(env_value "$ENV_FILE" "GOTRUE_EXTERNAL_${p}_ENABLED" || env_value "$ENV_FILE" "ENABLE_${p}_SIGNUP" || true)" == "true" ]] &&
            info "$p sign-in is enabled in .env"
    done
fi

# ── Network exposure ──────────────────────────────────────────────────────────────────────────────
section "Network exposure (#930)"
if [[ $DOCKER_OK -eq 1 ]]; then
    public_maps="$(docker ps --format '{{.Names}}\t{{.Ports}}' | tr ',' '\n' |
        awk -F'\t' 'NF==2{name=$1; ports=$2} NF==1{ports=$1} {print name"\t"ports}' |
        grep -E '(0\.0\.0\.0|\[?::\]?):[0-9]+->' | sed -E 's/\t.*:([0-9]+)->.*/\t\1/' | sort -u)"
    if [[ -n "$public_maps" ]]; then
        while IFS=$'\t' read -r name port; do
            fail "$name publishes port $port on all interfaces (Docker bypasses the host firewall)" \
                "Publish it as \"127.0.0.1:$port:$port\" in docker-compose.override.yml (ports: !override)"
        done <<<"$public_maps"
    else
        pass "No container publishes a port on a public interface"
    fi
fi
if have ss; then
    # One line per port and process; loopback, link-local, Docker bridges and docker-proxy (reported
    # above) are left out.
    listeners="$(ss -tlnpH 2>/dev/null | awk '{print $4"\t"$6}' |
        grep -vE '^(127\.|\[::1\]|::1|\[fe80|172\.(1[6-9]|2[0-9]|3[01])\.)' | grep -v docker-proxy |
        sed -E 's/^.*:([0-9]+)\t.*\("([^"]+)".*/\1\t\2/' | grep -vE '^(22|80|443)\b' | sort -u -n)"
    if [[ -n "$listeners" ]]; then
        info "Other ports listening on public addresses (the host firewall must block any you don't serve):"
        awk -F'\t' '{printf "       %s (%s)\n", $1, $2}' <<<"$listeners"
        grep -qE '^8083\b' <<<"$listeners" && warn "HestiaCP panel (8083) listens publicly" "Restrict it to your IP in Hestia → Server → Firewall, or reach it over an SSH tunnel."
        grep -qE '^21\b' <<<"$listeners" && warn "FTP (21, plain text) listens publicly" "systemctl disable --now vsftpd if nobody uses FTP accounts"
        grep -qE '^53\b' <<<"$listeners" && info "DNS (53) listens publicly: from outside, 'dig @<vps-ip> example.com' must answer REFUSED (no open resolver)"
    fi
fi
if [[ -n "$API_URL" ]] && have curl; then
    for path in /mcp /project/default /; do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$API_URL$path" || true)"
        case "$code" in
            200) fail "$API_URL$path answers 200 without credentials" "Serve Studio/MCP only through an SSH tunnel or VPN (#930)." ;;
            401) warn "$API_URL$path is reachable from the internet behind basic auth (HTTP $code)" "Prefer an SSH tunnel / VPN for Studio and /mcp (#930)." ;;
            000) info "$API_URL$path did not answer (timeout or connection refused)" ;;
            *) pass "$API_URL$path is not publicly served (HTTP $code)" ;;
        esac
    done
    info "This probe runs from the VPS itself; confirm from outside with: nmap -Pn -p 22,80,443,3000,4000,5432,6543,8000,8083,8443 $(url_host "$API_URL")"
fi
for u in "$APP_URL" "$API_URL"; do
    [[ -z "$u" ]] && continue
    host="$(url_host "$u")"
    loc="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "http://$host/" || true)"
    if [[ "$loc" =~ ^30[1278]\ https:// ]]; then pass "http://$host redirects to HTTPS"; else warn "http://$host does not redirect to HTTPS ($loc)"; fi
    if have openssl; then
        end="$(echo | with_timeout 10 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
        end_epoch="$(epoch_of "$end")"
        if [[ -n "$end_epoch" ]]; then
            days=$((($end_epoch - $(date +%s)) / 86400))
            if [[ $days -lt 14 ]]; then warn "TLS certificate for $host expires in $days days"; else pass "TLS certificate for $host valid for $days more days"; fi
        else
            warn "Could not read the TLS certificate expiry for $host" "The probe returned no notAfter value ($(openssl version 2>/dev/null || echo 'openssl')); check the certificate by hand."
        fi
    fi
done

# ── Frontend headers ──────────────────────────────────────────────────────────────────────────────
section "Frontend headers (#929)"
if [[ -n "$APP_URL" ]] && have curl; then
    headers="$(curl -sI --max-time 10 "$APP_URL/" | tr -d '\r')"
    pp="$(grep -i '^permissions-policy:' <<<"$headers" | head -n1)"
    if [[ -z "$pp" ]]; then
        warn "No Permissions-Policy header on $APP_URL"
    elif grep -q 'camera=()' <<<"$pp"; then
        fail "Permissions-Policy blocks the camera (camera=()): live scanning is broken" \
            "Deploy #929 and copy deploy/nginx-hestiacp.conf to the domain's nginx.ssl.conf_after, then reload nginx."
    elif grep -q 'camera=(self)' <<<"$pp"; then
        pass "Permissions-Policy allows the camera for the app"
    else
        warn "Permissions-Policy present but has no camera=(self): $pp"
    fi
    grep -qi '^strict-transport-security:' <<<"$headers" && pass "HSTS header present" || warn "No Strict-Transport-Security header"
    csp="$(grep -i '^content-security-policy:' <<<"$headers" | head -n1)"
    [[ -z "$csp" ]] && warn "No Content-Security-Policy header on $APP_URL"
    grep -q 'api.languagetool.org' <<<"$csp" && info "CSP still allows api.languagetool.org: essays go to the public LanguageTool API (#878/#879)"
fi
if as_root; then
    stale="$(grep -lE 'camera=\(\)' /home/*/conf/web/*/nginx*.conf_after /home/*/conf/web/*/apache2*.conf_after /home/*/web/*/public_html/.htaccess 2>/dev/null || true)"
    [[ -n "$stale" ]] && fail "camera=() still in: $(tr '\n' ' ' <<<"$stale")" "Replace with camera=(self), microphone=(self) (#929)."
fi

# ── SSH and host security ─────────────────────────────────────────────────────────────────────────
section "SSH and host security (#404)"
if as_root && have sshd; then
    cfg="$(sshd -T 2>/dev/null)"
    pwauth="$(awk '$1=="passwordauthentication"{print $2}' <<<"$cfg")"
    rootlogin="$(awk '$1=="permitrootlogin"{print $2}' <<<"$cfg")"
    [[ "$pwauth" == "yes" ]] && fail "SSH password authentication is enabled" "PasswordAuthentication no" || pass "SSH password authentication is off"
    case "$rootlogin" in
        yes) fail "SSH root login with a password is allowed" "PermitRootLogin no (after #404's deploy user exists)" ;;
        prohibit-password | without-password) warn "SSH root login by key is allowed (CI deploys as root)" "#404: a restricted deploy user, then PermitRootLogin no" ;;
        *) pass "SSH root login disabled ($rootlogin)" ;;
    esac
    [[ -r /root/.ssh/authorized_keys ]] && info "root has $(grep -cvE '^\s*(#|$)' /root/.ssh/authorized_keys) authorized SSH key(s)"
fi
if have systemctl && [[ -d /run/systemd/system ]]; then
    systemctl is-active --quiet fail2ban 2>/dev/null && pass "fail2ban is running" || warn "fail2ban is not running"
fi
if have apt-get; then
    upg="$(apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep '^Inst' || true)"
    sec="$(grep -ci security <<<"$upg" || true)"
    total="$(grep -c . <<<"$upg" || true)"
    if [[ "${sec:-0}" -gt 0 ]]; then warn "$sec pending security updates ($total in total)" "apt-get upgrade in a maintenance window"; else pass "No pending security updates ($total other updates)"; fi
    dpkg -s unattended-upgrades >/dev/null 2>&1 && pass "unattended-upgrades installed" || warn "unattended-upgrades not installed" "apt-get install unattended-upgrades"
fi
[[ -f /var/run/reboot-required ]] && warn "A reboot is pending (/var/run/reboot-required)"

# ── Memory and CPU ────────────────────────────────────────────────────────────────────────────────
section "Memory and CPU (#932)"
if have free; then
    read -r _ mem_total mem_used _ _ _ mem_avail < <(free -m | awk '/^Mem:/')
    info "RAM: ${mem_total} MB total, ${mem_used} MB used, ${mem_avail} MB available"
    swap_total="$(free -m | awk '/^Swap:/{print $2}')"
    if [[ "${swap_total:-0}" -eq 0 ]]; then warn "No swap configured" "A 2–4 GB swapfile with vm.swappiness=10 as an OOM buffer"; else pass "Swap: ${swap_total} MB (swappiness $(cat /proc/sys/vm/swappiness))"; fi
fi
if as_root; then
    ooms="$( (journalctl -k --since '-30 days' 2>/dev/null || dmesg 2>/dev/null) | grep -ciE 'out of memory|oom-kill' || true)"
    if [[ "${ooms:-0}" -gt 0 ]]; then warn "$ooms OOM-killer events in the kernel log (last 30 days)" "journalctl -k | grep -i oom"; else pass "No OOM-killer events in the kernel log"; fi
fi
if [[ $DOCKER_OK -eq 1 ]]; then
    info "Top containers by memory:"
    docker stats --no-stream --format '{{.MemUsage}}\t{{.Name}}' | sort -h -r | head -n 12 | sed 's/^/       /'
    unlimited=()
    while IFS='|' read -r name mem oom; do
        name="${name#/}"
        if [[ "$name" == "$DB_CONTAINER" ]]; then
            if [[ "$oom" -lt 0 ]]; then pass "$name has oom_score_adj $oom"; else warn "$name has oom_score_adj $oom: the kernel may pick Postgres first" "oom_score_adj: -800 on db"; fi
        elif [[ "$mem" -eq 0 ]]; then
            unlimited+=("$name")
        fi
    done < <(docker ps -q | xargs -r docker inspect -f '{{.Name}}|{{.HostConfig.Memory}}|{{.HostConfig.OomScoreAdj}}' 2>/dev/null)
    if [[ ${#unlimited[@]} -gt 0 ]]; then
        warn "${#unlimited[@]} containers have no memory limit: ${unlimited[*]}" "mem_limit on the non-critical ones (Studio, imgproxy, Grafana, Loki, …)"
    else
        pass "Every non-db container has a memory limit"
    fi
    for c in supabase-analytics supabase-vector; do
        docker inspect "$c" >/dev/null 2>&1 && warn "$c is running (Logflare/Vector log pipeline, ~0.5–1 GB each)" "Remove it; Alloy + Loki already ship logs (#932, #867)."
    done
    docker ps --format '{{.Names}} {{.Image}}' | grep -qi promtail && warn "Promtail is still running (end-of-life since 2026-03-02)" "Merge #928 (Alloy)."
fi
if have systemctl && [[ -d /run/systemd/system ]]; then
    active=()
    for s in clamav-daemon clamav-freshclam spamassassin spamd exim4 dovecot mariadb mysql; do
        systemctl is-active --quiet "$s" 2>/dev/null && active+=("$s")
    done
    [[ ${#active[@]} -gt 0 ]] && info "HestiaCP services running: ${active[*]} (disable the ones this VPS doesn't need, #932)"
fi
if [[ -r /proc/stat ]]; then
    read -r -a a < <(grep '^cpu ' /proc/stat)
    sleep "${AUDIT_CPU_SAMPLE_SECONDS:-5}"
    read -r -a b < <(grep '^cpu ' /proc/stat)
    tot=0
    for i in 1 2 3 4 5 6 7 8; do tot=$((tot + b[i] - a[i])); done
    steal=$(((b[8] - a[8]) * 1000 / (tot > 0 ? tot : 1)))
    idle=$(((b[4] - a[4]) * 1000 / (tot > 0 ? tot : 1)))
    msg="CPU over ${AUDIT_CPU_SAMPLE_SECONDS:-5} s: steal $((steal / 10)).$((steal % 10))%, idle $((idle / 10)).$((idle % 10))%, load $(cut -d' ' -f1-3 /proc/loadavg) on $(nproc) cores"
    if [[ $steal -gt 100 ]]; then warn "$msg" "High steal: the host's other tenants are taking CPU (#932)"; else info "$msg"; fi
fi

# ── Disk ──────────────────────────────────────────────────────────────────────────────────────────
section "Disk (#928)"
while read -r mount pct avail_k; do
    p="${pct%\%}"
    msg="$mount is ${pct} full ($((avail_k / 1024 / 1024)) GB free)"
    if [[ $p -ge 90 ]]; then fail "$msg"; elif [[ $p -ge 80 ]]; then warn "$msg"; else pass "$msg"; fi
done < <(for path in / /var/lib/docker "${SUPABASE_DIR:-}"; do
    [[ -z "$path" || ! -e "$path" ]] && continue
    df -P "$path" | awk 'NR==2{print $6" "$5" "$4}'
done | sort -u)
if [[ -n "$SUPABASE_DIR" && -d "$SUPABASE_DIR/volumes/storage" ]]; then
    info "Uploads (volumes/storage): $(with_timeout 60 du -sh "$SUPABASE_DIR/volumes/storage" 2>/dev/null | cut -f1)"
fi

# ── Postgres ──────────────────────────────────────────────────────────────────────────────────────
section "Postgres (#933)"
if [[ $DOCKER_OK -eq 1 ]] && docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    if psql_q 'SELECT 1' >/dev/null; then
        DB_OK=1
    elif [[ -n "$ENV_FILE" ]]; then
        PGPASSWORD_ENV="$(env_value "$ENV_FILE" POSTGRES_PASSWORD || true)"
        for DB_USER in supabase_admin postgres; do
            psql_q 'SELECT 1' >/dev/null && { DB_OK=1; break; }
        done
    fi
fi
if [[ $DB_OK -eq 0 ]]; then
    warn "Could not query Postgres in $DB_CONTAINER; database checks skipped"
else
    info "$(psql_q 'SELECT version()' | cut -d, -f1)"
    while IFS='|' read -r name setting unit; do
        info "$(printf '%-22s %s%s' "$name" "$setting" "${unit:+ ($unit)}")"
    done < <(psql_q "SELECT name, setting, unit FROM pg_settings WHERE name IN ('shared_buffers','effective_cache_size','work_mem','maintenance_work_mem','random_page_cost','max_connections') ORDER BY name")
    sb_mb="$(psql_q "SELECT setting::bigint * 8 / 1024 FROM pg_settings WHERE name = 'shared_buffers'")"
    if [[ "${sb_mb:-0}" -lt 1024 ]]; then warn "shared_buffers is ${sb_mb} MB" "About 2 GB on this host (#933)"; else pass "shared_buffers is ${sb_mb} MB"; fi
    preload="$(psql_q 'SHOW shared_preload_libraries')"
    for lib in pg_stat_statements pg_cron pg_net; do
        grep -q "$lib" <<<"$preload" && pass "$lib is preloaded" || warn "$lib is not in shared_preload_libraries"
    done
    read -r used max < <(psql_q "SELECT count(*), current_setting('max_connections') FROM pg_stat_activity" | tr '|' ' ')
    if [[ -z "${max:-}" || "$max" -eq 0 ]]; then
        warn "Could not read the connection count"
    elif [[ $((used * 100 / max)) -ge 70 ]]; then warn "Connections: $used of $max" "Check for idle clients; point heavy clients at Supavisor"; else pass "Connections: $used of $max"; fi
    hit="$(psql_q 'SELECT round(100 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) FROM pg_stat_database')"
    info "Cache hit ratio: ${hit}% (aim for ≥ 99% on a normal school day)   Database size: $(psql_q "SELECT pg_size_pretty(pg_database_size('postgres'))")"

    norls="$(psql_q "SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity AND c.relname NOT IN ('_migrations')")"
    if [[ -n "$norls" ]]; then fail "Public tables without row-level security (readable through the REST API): $norls" "ALTER TABLE … ENABLE ROW LEVEL SECURITY and add policies"; else pass "Every public table has row-level security enabled"; fi

    if [[ "$(psql_q "SELECT count(*) FROM pg_extension WHERE extname = 'pg_cron'")" == "1" ]]; then
        jobs="$(psql_q "SELECT string_agg(jobname || CASE WHEN active THEN '' ELSE ' (inactive)' END, ', ' ORDER BY jobname) FROM cron.job")"
        info "pg_cron jobs: ${jobs:-none}"
        failed="$(psql_q "SELECT count(*) FROM cron.job_run_details WHERE status = 'failed' AND start_time > now() - interval '1 day'")"
        if [[ "${failed:-0}" -gt 0 ]]; then
            warn "$failed failed pg_cron runs in the last 24 h" "SELECT jobid, status, return_message, start_time FROM cron.job_run_details WHERE status='failed' ORDER BY start_time DESC LIMIT 10;"
        else
            pass "No failed pg_cron runs in the last 24 h"
        fi
    else
        warn "pg_cron is not installed: retention, anonymisation and digest jobs never run"
    fi
    if [[ "$(psql_q "SELECT count(*) FROM pg_extension WHERE extname = 'pg_net'")" == "1" ]]; then
        netfail="$(psql_q "SELECT count(*) FROM net._http_response WHERE created > now() - interval '1 day' AND (status_code >= 400 OR error_msg IS NOT NULL)")"
        if [[ "${netfail:-0}" -gt 0 ]]; then warn "$netfail failed pg_net calls in the last 24 h (edge-function jobs)" "SELECT status_code, error_msg, created FROM net._http_response ORDER BY created DESC LIMIT 10;"; else pass "No failed pg_net calls in the last 24 h"; fi
    fi
    gucs="$(psql_q "SELECT (coalesce(current_setting('app.settings.project_url', true), '') <> '')::int + (coalesce(current_setting('app.settings.service_role_key', true), '') <> '')::int")"
    if [[ "$gucs" == "2" ]]; then pass "app.settings.project_url / service_role_key are set (digest and notification jobs can reach edge functions)"; else warn "app.settings.project_url and/or service_role_key are not set: the digest job's HTTP calls fail silently" "See docs/SELF_HOSTING_OPS.md → Teacher email digest job"; fi
fi

# ── Backups ───────────────────────────────────────────────────────────────────────────────────────
section "Backups (#931)"
cron_hits="$( (crontab -l 2>/dev/null; cat /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/* 2>/dev/null) |
    grep -vE '^\s*#' | grep -oE '[^ ]*(backup|pg_dump|rclone|restic|borg)[^ ]*' | sort -u | tr '\n' ' ')"
# HestiaCP's own nightly backup covers its users' web, mail and panel databases, not Docker volumes.
db_backup_hits="$(tr ' ' '\n' <<<"$cron_hits" | grep -v 'v-backup-users' | grep . | tr '\n' ' ')"
if [[ -n "$db_backup_hits" ]]; then
    info "Scheduled backup commands found: $db_backup_hits"
elif [[ -n "$cron_hits" ]]; then
    fail "Only HestiaCP's v-backup-users is scheduled: it does not include the Supabase database or uploads" \
        "It backs up HestiaCP users (web, mail, panel databases) to the same disk. #931 adds a pg_dump + uploads backup with an off-site copy."
else
    fail "No scheduled pg_dump/rclone/restic/borg backup on this host" \
        "The nightly-backup edge function's JSON snapshots hold no files and live on the same disk. #931 makes scripts/scheduled-backup.sh work on this stack."
fi
if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
    newest="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 2 -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -n1)"
    if [[ -n "$newest" ]]; then
        age_h=$((($(date +%s) - ${newest%%.*}) / 3600))
        if [[ $age_h -gt 26 ]]; then warn "Newest backup in $BACKUP_DIR is ${age_h} h old"; else pass "Newest backup in $BACKUP_DIR is ${age_h} h old"; fi
    else
        fail "$BACKUP_DIR is empty"
    fi
fi
[[ $DB_OK -eq 1 ]] && [[ -n "$(psql_q "SELECT 1 FROM cron.job WHERE command ILIKE '%nightly-backup%' LIMIT 1" 2>/dev/null)" ]] &&
    info "nightly-backup edge function is scheduled (per-teacher JSON snapshot, not a full backup)"

# ── Deploy drift ──────────────────────────────────────────────────────────────────────────────────
section "Deploy drift (#935)"
if [[ -z "$REPO_DIR" ]]; then
    info "Skipped: pass --repo-dir with a current checkout of the repository"
elif [[ ! -d "$REPO_DIR/supabase/migrations" ]]; then
    warn "$REPO_DIR has no supabase/migrations"
else
    if [[ $DB_OK -eq 1 ]]; then
        applied="$( {
            psql_q "SELECT regexp_replace(name, '\.sql$', '') FROM public._migrations" 2>/dev/null
            psql_q "SELECT version || coalesce('_' || name, '') FROM supabase_migrations.schema_migrations" 2>/dev/null
        } | sed 's/\.sql$//' | sort -u)"
        if [[ -z "$applied" ]]; then
            warn "No migration bookkeeping table found (public._migrations or supabase_migrations.schema_migrations): can't tell which migrations production has" "python3 scripts/stack-drift.py check, then baseline"
        else
            missing=()
            for f in "$REPO_DIR"/supabase/migrations/*.sql; do
                stem="$(basename "$f" .sql)"
                grep -qxF "$stem" <<<"$applied" || missing+=("$stem")
            done
            if [[ ${#missing[@]} -gt 0 ]]; then
                warn "${#missing[@]} repository migrations are not recorded as applied: ${missing[*]:0:10}${missing[10]:+ …}" "python3 scripts/stack-drift.py check shows which are really missing; apply runs them"
            else
                pass "Every repository migration is recorded as applied"
            fi
        fi
    fi
    funcs="${SUPABASE_DIR:+$SUPABASE_DIR/volumes/functions}"
    if [[ -n "$funcs" && -d "$funcs" ]]; then
        drift=()
        for d in "$REPO_DIR"/supabase/functions/*/; do
            fn="$(basename "$d")"
            if [[ ! -d "$funcs/$fn" ]]; then
                drift+=("$fn (missing)")
            elif ! diff -rq --exclude='*.test.ts' --exclude='__tests__' "$d" "$funcs/$fn" >/dev/null 2>&1; then
                drift+=("$fn (differs)")
            fi
        done
        if [[ ${#drift[@]} -gt 0 ]]; then
            warn "Edge functions differ from the repository: ${drift[*]}" "bash scripts/deploy-edge-functions.sh (checks migrations first, backs up, restarts, probes)"
        else
            pass "Deployed edge functions match the repository"
        fi
    else
        warn "No volumes/functions directory under the Supabase stack; edge-function drift not checked"
    fi
fi

# ── Images ────────────────────────────────────────────────────────────────────────────────────────
section "Images (#934)"
if [[ $DOCKER_OK -eq 1 ]]; then
    docker ps --format '{{.Image}}' | sort -u | sed 's/^/       /'
    docker ps --format '{{.Image}}' | grep -E ':latest$' >/dev/null &&
        warn "Some images run from :latest (unpinned)" "Pin exact tags so upgrades are deliberate (#934)"
fi

printf '\n%sSummary:%s %s%d PASS%s, %s%d WARN%s, %s%d FAIL%s\n' "$C_B" "$C_OFF" "$C_PASS" "$N_PASS" "$C_OFF" "$C_WARN" "$N_WARN" "$C_OFF" "$C_FAIL" "$N_FAIL" "$C_OFF"
[[ $N_FAIL -eq 0 ]]
