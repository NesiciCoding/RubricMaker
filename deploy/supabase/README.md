# Official Supabase stack (production)

Production runs the **official Supabase self-hosted Docker stack**, not this repository's
`docker-compose.yml` (that one runs the app plus a smaller set of services locally). This directory
keeps the production stack in version control so a VPS can be rebuilt from the repo, a `.env` and a
backup instead of from memory — and so security releases for the Supabase images arrive as pull
requests.

| File                          | Role                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `docker-compose.yml`          | Pinned copy of the upstream stack. Change it only by re-pinning (see below).            |
| `docker-compose.override.yml` | Every RubricMaker change: loopback ports (#930), memory limits (#932), mail, Realtime.  |
| `.env.example`                | Every variable the stack reads, with no secrets. Copy to `.env` on the server and fill. |

Compose loads `docker-compose.override.yml` automatically when both files sit in the same directory,
so the stack always starts with the override applied.

## Layout on the VPS

The stack lives in its own directory — `/opt/supabase` in the examples below — outside the app
checkout, because its images and volumes are far larger than the repo:

```
/opt/supabase/
  docker-compose.yml            # from deploy/supabase/
  docker-compose.override.yml   # from deploy/supabase/
  .env                          # from deploy/supabase/.env.example, filled in, chmod 600
  volumes/
    api/envoy/envoy.yaml        # upstream default, from the upstream stack checkout
    functions/<name>/index.ts   # copied from supabase/functions/ (see below)
    mail-templates/*.html       # copied from public/email-templates/
    db/, storage/               # stack state — restored from a backup, never from git
```

`volumes/` holds state, so it is not in this repo. `envoy.yaml` is the upstream default and has not
been customised; copy it from the upstream `docker` directory (or from the stack's release tarball)
when building a host. Everything else in `volumes/` is created by the stack or restored from a
backup — see `docs/SELF_HOSTING_OPS.md` for the backup and restore scripts.

## Rebuilding a host from the repo

1. Install Docker and the compose plugin.
2. Create `/opt/supabase` and copy `docker-compose.yml`, `docker-compose.override.yml` and
   `.env.example` from this directory; rename the last one to `.env` and fill in every blank.
   `chmod 600 .env`.
3. Fill `volumes/api/envoy/envoy.yaml` from upstream, and copy `public/email-templates/*.html` into
   `volumes/mail-templates/`.
4. Restore the database and storage volumes from the latest backup.
5. `docker compose up -d`, then deploy the edge functions (below) and verify with
   `scripts/audit-live-stack.sh`.

Never commit a filled-in `.env`: it holds `POSTGRES_PASSWORD`, `JWT_SECRET`, the API keys and the
SMTP password.

## Upgrading one service at a time

Dependabot opens the image updates (`.github/dependabot.yml` → docker-compose, grouped so the
Supabase images move in one PR). Postgres majors are ignored on purpose: they need a dump/restore,
not a pull.

Apply an update to a single service and check it before moving on:

```bash
cd /opt/supabase
git -C <checkout> pull                                  # the repo copy of the compose files
docker compose pull auth && docker compose up -d auth    # one service at a time
docker compose ps
```

Re-pinning the whole stack: copy the new upstream `docker/docker-compose.yml` over `docker-compose.yml`
verbatim (keep the provenance header at the top), review the diff for new services or variables, add
anything the override must cover, and apply service by service as above. Keep the file a clean copy
of upstream — every production change belongs in the override — so the next re-pin stays reviewable.

## Edge functions

The stack serves `volumes/functions/<name>/index.ts`, so a function is deployed by copying its
directory into `volumes/functions/`. `scripts/deploy-edge-functions.sh` does that for every function
in `supabase/functions/` (and can target a remote host); it also rewrites the shared modules each
function imports. Run it after a deploy that changed anything under `supabase/functions/`.

## Mail

`docker-compose.override.yml` adds a `mail-templates` nginx container and points Auth's six mail
templates at it, with `GOTRUE_MAILER_OTP_LENGTH=8`. The templates show only the code, never a
clickable token link — mail scanners such as Microsoft Safe Links open links on arrival and would
use up the one-time token. After changing a template:

```bash
docker compose up -d --force-recreate mail-templates auth
```

## Deploy security headers and gateway

The public API domain is reverse-proxied by HestiaCP's nginx to the gateway on `127.0.0.1:8000`
(`deploy/nginx-supabase-api-hestiacp.conf`). The override binds the gateway and Supavisor to
loopback only; verify from outside the VPS that `5432`, `6543`, `8000` and `8443` are closed:

```bash
nmap -Pn -p 5432,6543,8000,8443 <vps-ip>
```

See `docs/SELF_HOSTING_OPS.md` → Hardening the official stack for the host-level steps the override
cannot cover (swap, Studio/MCP behind a tunnel, trimming unused services).
