# RubricMaker — Observability Stack on a HestiaCP Subdomain

This guide deploys the standalone Loki + Promtail + Grafana stack
(`docker-compose.observability.yml`) on a HestiaCP-managed server, exposed at
a dedicated subdomain — e.g. `observability.rubricmaker.example.com` — with
HTTPS via HestiaCP's Let's Encrypt integration.

It's independent of how RubricMaker itself is deployed and only needs Docker.
If RubricMaker isn't deployed on this server yet, see
[HESTIACP_SETUP.md](HESTIACP_SETUP.md) first.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Docker](#2-install-docker)
3. [Create the subdomain in HestiaCP](#3-create-the-subdomain-in-hestiacp)
4. [Copy the stack to the server and configure it](#4-copy-the-stack-to-the-server-and-configure-it)
5. [Start the stack (localhost-only)](#5-start-the-stack-localhost-only)
6. [Reverse-proxy the subdomain to Grafana](#6-reverse-proxy-the-subdomain-to-grafana)
7. [Configure Grafana's external URL](#7-configure-grafanas-external-url)
8. [Verify](#8-verify)
9. [Maintenance & troubleshooting](#9-maintenance--troubleshooting)

---

## 1. Prerequisites

- A HestiaCP-managed VPS, already serving at least one domain.
- Root SSH access (Docker installation and the Nginx template changes below
  both require root).
- A DNS **A record** for the subdomain pointing at the VPS IP, e.g.:

  ```
  observability.rubricmaker.example.com.  IN  A  YOUR_VPS_IP
  ```

This stack does **not** use ports 80/443 directly — Grafana is bound to
`127.0.0.1:3001` and reached through HestiaCP's existing Nginx, which already
owns 80/443 for every domain on the server. No firewall changes are needed.

---

## 2. Install Docker

HestiaCP doesn't manage Docker, but the two coexist without conflict as long
as Docker isn't asked to publish ports HestiaCP already uses (it won't be —
see above).

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $(whoami)   # re-login for this to take effect
docker compose version              # confirm the Compose plugin is present
```

---

## 3. Create the subdomain in HestiaCP

1. **Web → Add Web Domain** → enter `observability.rubricmaker.example.com`.
   Use the same HestiaCP user as your main RubricMaker domain (or a separate
   one — doesn't matter, nothing in `public_html` is served).
2. Wait for the DNS record from step 1 to resolve, then enable SSL:
   **Web → Edit domain → SSL → Enable SSL for this domain → Use Let's
   Encrypt → Save.**

At this point `https://observability.rubricmaker.example.com` loads
HestiaCP's default placeholder page over HTTPS. That's expected — leave it
like this until step 6. Creating it as a normal web domain first is what lets
Let's Encrypt issue the certificate via the standard webroot challenge,
before we repoint Nginx at Grafana.

---

## 4. Copy the stack to the server and configure it

You only need `docker-compose.observability.yml`, the `docker/observability/`
config files, and `.env.observability.example` — not the whole app. Easiest
is a shallow clone or rsync from your checkout:

```bash
ssh rubricmaker@YOUR_VPS_IP "mkdir -p ~/observability/docker/observability"
scp docker-compose.observability.yml .env.observability.example \
    rubricmaker@YOUR_VPS_IP:~/observability/
scp docker/observability/*.yml \
    rubricmaker@YOUR_VPS_IP:~/observability/docker/observability/
```

On the server:

```bash
cd ~/observability
cp .env.observability.example .env.observability
```

Edit `.env.observability`:

```bash
GRAFANA_ADMIN_PASSWORD=<choose a strong password>

# HestiaCP per-domain log layout (see .env.observability.example for the
# Virtualmin equivalent). Promtail recurses into this path looking for
# *access*.log / *error*.log files.
RUBRICMAKER_LOG_DIR=/home/rubricmaker/web/*/log

# Set in step 7, once the subdomain is live.
GRAFANA_DOMAIN=observability.rubricmaker.example.com
GRAFANA_ROOT_URL=https://observability.rubricmaker.example.com/

# Optional — only if you also want client_logs queryable from Grafana
# (see README → "Stress-test logging").
# SUPABASE_DB_HOST=
# SUPABASE_DB_NAME=postgres
# SUPABASE_DB_USER=postgres
# SUPABASE_DB_PASSWORD=
```

> **`RUBRICMAKER_LOG_DIR=/home/rubricmaker/web/*/log` vs `/var/log`:**
> HestiaCP writes per-domain logs to `/home/<user>/web/<domain>/log/` *and*
> aggregates them under `/var/log/$WEB_SYSTEM/domains/`. Either path works;
> the `/home/.../web/*/log` glob is narrower if this HestiaCP user hosts
> multiple unrelated domains and you only want RubricMaker's logs.

---

## 5. Start the stack (localhost-only)

```bash
cd ~/observability
docker compose -f docker-compose.observability.yml --env-file .env.observability up -d
```

Confirm Grafana is up but only reachable locally:

```bash
curl -sI http://127.0.0.1:3001/login | head -1   # → HTTP/1.1 200 OK
curl -sI https://observability.rubricmaker.example.com/   # → still HestiaCP's placeholder
```

---

## 6. Reverse-proxy the subdomain to Grafana

HestiaCP's default Nginx vhost for a domain proxies everything to its Apache
backend on `127.0.0.1:8080` (or a per-domain port). We need that `location /`
to instead point at Grafana on `127.0.0.1:3001`, while still letting Let's
Encrypt's renewal requests through. The supported way to do this without
HestiaCP overwriting the change on rebuild is a **custom Nginx proxy
template**.

1. Copy the default proxy template pair to new names:

   ```bash
   cd /usr/local/hestia/data/templates/web/nginx
   sudo cp default.tpl  rmaker_proxy.tpl
   sudo cp default.stpl rmaker_proxy.stpl
   ```

2. In **both** new files, find the `location /` block (it proxies to the
   Apache backend, typically `proxy_pass http://%backend_lsnr%;` or similar —
   the exact variable depends on your HestiaCP version) and replace its
   `proxy_pass` target with Grafana's local port. Also add the headers
   Grafana needs for its live-dashboard websocket connections:

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3001;
       proxy_set_header Host              $host;
       proxy_set_header X-Real-IP         $remote_addr;
       proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_http_version 1.1;
       proxy_set_header Upgrade    $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```

   Leave any `location ~ /\.well-known/acme-challenge/` block (or equivalent
   static-file handling for ACME validation) untouched — that's what lets
   certificate renewals keep working after this template is applied.

3. Apply the new template to the subdomain and rebuild:

   ```bash
   sudo /usr/local/hestia/bin/v-change-web-domain-proxy-tpl \
        rubricmaker observability.rubricmaker.example.com rmaker_proxy

   sudo /usr/local/hestia/bin/v-rebuild-web-domains rubricmaker
   ```

   (`v-change-web-domain-proxy-tpl` only swaps the Nginx proxy config — the
   Apache backend and SSL certificate for this domain are untouched.)

4. Reload Nginx if the rebuild didn't already:

   ```bash
   sudo systemctl reload nginx
   ```

`https://observability.rubricmaker.example.com/` now serves Grafana's login
page over HTTPS.

> **HestiaCP UI overwrites:** as with `.htaccess` and `*.conf_after` files
> (see HESTIACP_SETUP.md §12), avoid re-saving this domain's settings in a way
> that resets its proxy template — `v-rebuild-web-domains` re-applies the
> template you set, but switching the **Web Template** dropdown in the UI
> would point it back at `default`.

---

## 7. Configure Grafana's external URL

Grafana needs to know its public HTTPS URL so redirects, cookies, and
generated links (e.g. "Share dashboard") are correct behind the proxy. This
is the `GRAFANA_DOMAIN` / `GRAFANA_ROOT_URL` pair set in step 4
(`docker-compose.observability.yml` passes these through as
`GF_SERVER_DOMAIN` / `GF_SERVER_ROOT_URL`). Apply them:

```bash
cd ~/observability
docker compose -f docker-compose.observability.yml --env-file .env.observability up -d
```

(`up -d` re-creates only the `grafana` container since its config changed —
Loki and Promtail are unaffected.)

---

## 8. Verify

- Open `https://observability.rubricmaker.example.com/` — Grafana's login
  page loads over HTTPS, padlock shown.
- Log in with `admin` / `GRAFANA_ADMIN_PASSWORD`. Grafana prompts for a
  password change on first login — set one and store it.
- **Connections → Data sources**: "Loki" shows a green "Data source is
  working" check. If `SUPABASE_DB_*` was set, the Postgres `client_logs`
  datasource does too.
- **Explore**, pick the Loki datasource, and confirm log lines from
  `RUBRICMAKER_LOG_DIR` (or the combined Docker stack's containers) appear.

---

## 9. Maintenance & troubleshooting

**Updating the images:**

```bash
cd ~/observability
docker compose -f docker-compose.observability.yml --env-file .env.observability pull
docker compose -f docker-compose.observability.yml --env-file .env.observability up -d
```

**Viewing container logs:**

```bash
docker compose -f docker-compose.observability.yml logs -f grafana
docker compose -f docker-compose.observability.yml logs -f promtail
```

**Tearing down after a stress-test window** (drops Grafana dashboards/users
and Loki's stored logs — back up first if needed):

```bash
docker compose -f docker-compose.observability.yml down -v
```

To keep the subdomain but stop exposing it, switch the domain back to the
`default` proxy template with `v-change-web-domain-proxy-tpl ... default` and
rebuild, or just `docker compose ... down` (Nginx then proxies to a closed
port and returns 502, which is an acceptable "off" state for a pilot-only
subdomain).

**SSL renewal** — handled automatically by HestiaCP, same as any other domain
(HESTIACP_SETUP.md §11). The custom proxy template doesn't change how
certificates are issued or renewed, only how *application* traffic is routed.

**502 Bad Gateway:**

```bash
docker compose -f docker-compose.observability.yml ps   # is grafana "Up"?
curl -sI http://127.0.0.1:3001/login                     # reachable locally?
```

If Grafana is down, `docker compose ... up -d` it; if it's up but Nginx still
502s, double-check the `proxy_pass` target in `rmaker_proxy.stpl` and that
`v-rebuild-web-domains` ran without errors.

**Redirect loops or "invalid origin" errors after login** — usually means
`GF_SERVER_ROOT_URL` / `GF_SERVER_DOMAIN` weren't applied. Re-check
`.env.observability` and re-run `up -d` (step 7).

**Restricting access further** — Grafana requires login by default
(`GF_AUTH_ANONYMOUS_ENABLED=false`), which is normally sufficient for a
pilot window. To additionally restrict by IP during a stress test, add an
`allow`/`deny` block to the `location /` in `rmaker_proxy.stpl`:

```nginx
location / {
    allow 203.0.113.0/24;   # school network
    deny  all;
    proxy_pass http://127.0.0.1:3001;
    # ... headers as in step 6
}
```
