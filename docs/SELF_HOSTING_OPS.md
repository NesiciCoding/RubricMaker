# RubricMaker — Self-Hosting Operations Guide

This document covers day-two operations for self-hosted RubricMaker deployments: backup, restore, upgrades, resource sizing, and pg_cron activation. For initial setup see [HESTIACP_SETUP.md](HESTIACP_SETUP.md) or [VIRTUALMIN_SETUP.md](VIRTUALMIN_SETUP.md). For monitoring see [OBSERVABILITY_HESTIACP.md](OBSERVABILITY_HESTIACP.md).

---

## Backup and Restore

### Scripts (recommended, tested procedure)

```bash
./scripts/backup.sh                          # → ./backups/YYYYMMDD_HHMMSS/
./scripts/restore.sh backups/YYYYMMDD_HHMMSS
```

A backup directory contains:

| File             | Contents                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `data.sql`       | Rows of the `public`, `auth` and `storage` schemas (`pg_dump --data-only --disable-triggers`) |
| `migrations.txt` | The migrations applied when the backup was taken                                              |
| `storage.tar.gz` | The uploaded files (`rubricmaker_storage-data` volume, see below)                             |
| `FORMAT`         | `2`                                                                                           |
| `SHA256SUMS`     | Checksums of the four files above                                                             |

`restore.sh` refuses a backup that is missing any of the first four files, and one whose files no longer match `SHA256SUMS` (backups made before checksums were added have none; they restore with a warning).

The scripts connect to Postgres inside the `db` container over `127.0.0.1`. The image's `pg_hba.conf` only accepts `supabase_admin` on the local socket with a password but trusts loopback TCP, so the socket would fail with `fe_sendauth: no password supplied`. `DB_EXEC` overrides how they reach the database.

The scripts use `docker compose` (or the older `docker-compose` when that is all the server has). The uploads volume is `<project>_storage-data`, where the project is resolved the way Compose resolves it: `-p`/`--project-name`, then `COMPOSE_PROJECT_NAME` from the environment or the project's `.env`, then the compose file's `name:` (so `rubricmaker` here). `backup.sh` stops with an error when that volume does not exist instead of archiving an empty one; set `STORAGE_VOLUME` to point the scripts at a different volume.

Tables, GRANTs, RLS policies, triggers (such as the one on `auth.users` that creates profiles) and the realtime publication are **not** in the backup: they come from the migrations the stack runs. A restore therefore never recreates them, and the REST API keeps its `anon`/`authenticated`/`service_role` permissions.

To restore, onto the same server or a new one:

1. Start the stack at the same or a newer app version (`docker compose up -d`). This runs `db_migrate`.
2. Run `./scripts/restore.sh <backup-dir>`. It refuses if the stack lacks a migration the backup was taken with.
3. The script first unpacks the uploaded files into a staging folder in the volume, so a corrupt archive stops the restore before anything is changed. It then empties and reloads all tables in a single transaction with `ON_ERROR_STOP`. Any error rolls everything back and the script exits non-zero, so you never end up with a half-restored database. Only after that are the live files swapped for the staged ones.
4. Run `docker compose restart app`.

Backups made before format 2 (a single `database.sql` dumped with `--no-acl`) are refused. Replaying them dropped every GRANT. Take a new backup with the current script.

### Running against the official Supabase stack

Production typically runs the **official Supabase self-hosted Docker stack**, not this repository's `docker-compose.yml`. The pinned upstream compose file, the production override and the env template live in [`deploy/supabase/`](../deploy/supabase/README.md); copy them to the stack's directory on the host. Two things differ, and the scripts above handle both once you export the right variables:

|                    | This repo's compose                                   | Official stack                                                                                                                            |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Uploaded files     | Docker named volume `<project>_storage-data`          | Bind mount, `./volumes/storage` next to the stack's own compose file                                                                      |
| Applied migrations | `public._migrations` (written by `docker/migrate.sh`) | `public._migrations` if migrated the same way, otherwise `supabase_migrations.schema_migrations` (CLI `supabase db push`) — auto-detected |

```bash
export COMPOSE_FILE=/opt/supabase/docker/docker-compose.yml   # that stack's compose file
export STORAGE_DIR=/opt/supabase/docker/volumes/storage        # bind mount, not a volume name
./scripts/backup.sh
./scripts/restore.sh backups/20260515_120000
```

`STORAGE_DIR` takes priority over `STORAGE_VOLUME` and is passed straight to `docker run -v`, which accepts a host path exactly like a volume name — nothing else changes. The migrations table is detected automatically from the live database; set `MIGRATIONS_TABLE`/`MIGRATIONS_COLUMN` only if that detection picks the wrong one. `restore-drill.sh` always drills into its own scratch named volume regardless of `STORAGE_DIR`, since it proves the backup _file_ restores, not that the official stack's directory layout matches — rehearsing a restore onto a throwaway VPS with the real stack remains the drill for that part.

Nightly cron on the host running the official stack:

```cron
15 3 * * * cd /path/to/rubricmaker && COMPOSE_FILE=/opt/supabase/docker/docker-compose.yml STORAGE_DIR=/opt/supabase/docker/volumes/storage ./scripts/scheduled-backup.sh >> /var/log/rubricmaker-backup.log 2>&1 || logger -t rubricmaker-backup 'nightly backup FAILED - see /var/log/rubricmaker-backup.log'
```

### Off-site backups

`backup.sh` writes to `./backups` on the same disk as the database, so losing the server (hardware failure, ransomware, a provider incident, a mistaken `docker volume rm`) loses the backups with it. The off-site scripts keep encrypted copies in an S3-compatible bucket at **another provider** and prove regularly that they restore.

| Script                        | What it does                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/scheduled-backup.sh` | The nightly job: `backup.sh`, then upload, then keep the `LOCAL_KEEP` newest local backups, then ping `BACKUP_HEARTBEAT_URL`. Any failure exits non-zero and skips the ping. |
| `scripts/offsite-backup.sh`   | `push <dir>` (upload, verify against the local files, prune to `OFFSITE_KEEP`), `list`, `pull latest\|<name> [dir]` (download and verify checksums)                          |
| `scripts/restore-drill.sh`    | Restores the newest off-site backup (or a local one) into a throwaway Compose project and checks it, then removes the project                                                |

Uploads go through [rclone](https://rclone.org) (run from the pinned `rclone/rclone` image, so nothing is installed on the host) with a `crypt` remote. File contents **and** names are encrypted on this server with `BACKUP_ENCRYPTION_PASSPHRASE` before they leave it, so the bucket provider only ever stores ciphertext. That matters for the GDPR position: the provider holds no readable student data. After each upload, rclone's `cryptcheck` compares the uploaded copy with the local files.

#### Set up

1. Create a bucket at a provider other than the one hosting the server. EU providers keep student data in the EU: Hetzner Object Storage, Scaleway, OVHcloud and IONOS all work (endpoints in `.env.backup.example`). So do Cloudflare R2 (no egress fees), Backblaze B2 and Wasabi; pick an EU region there. Create an API key scoped to that bucket only.
2. `cp .env.backup.example .env.backup && chmod 600 .env.backup` and fill it in. Generate the passphrase with `openssl rand -base64 32`.
3. **Store a copy of `BACKUP_ENCRYPTION_PASSPHRASE` away from the server** (the school's password manager, or a sealed envelope with the head of IT). Without it, no off-site backup can be decrypted, and if the server is lost, so is `.env.backup`. Keep the bucket credentials with it, or know how to issue new ones.
4. Run `./scripts/scheduled-backup.sh` once by hand, then `./scripts/offsite-backup.sh list` to see the backup in the bucket.
5. Run `./scripts/restore-drill.sh` once to prove the copy restores.
6. Schedule both with `crontab -e`:

    ```cron
    15 3 * * * cd /path/to/rubricmaker && ./scripts/scheduled-backup.sh >> /var/log/rubricmaker-backup.log 2>&1 || logger -t rubricmaker-backup 'nightly backup FAILED - see /var/log/rubricmaker-backup.log'
    30 4 1 * * cd /path/to/rubricmaker && ./scripts/restore-drill.sh >> /var/log/rubricmaker-drill.log 2>&1 || logger -t rubricmaker-drill 'restore drill FAILED - see /var/log/rubricmaker-drill.log'
    ```

7. Point a dead-man's-switch monitor (Healthchecks.io, Better Stack, Uptime Kuma push monitors) at `BACKUP_HEARTBEAT_URL` (expected daily) and `RESTORE_DRILL_HEARTBEAT_URL` (expected monthly). Both are pinged only when a run fully succeeds, so a missed ping is the alert: it catches a failing script, a broken cron entry and a dead server alike.

#### The restore drill

`restore-drill.sh` downloads the newest off-site backup (checking its checksums) and starts the `db`, `auth` and `storage` services as a separate Compose project (`RESTORE_DRILL_PROJECT`, default `rubricmaker-drill`). That project has its own volumes and no published ports, and it refuses to run under the live project's name. It runs the migrations, restores with `restore.sh`, then checks that every table holds exactly the rows the dump contains and that every uploaded file came back. Finally it removes the project and its volumes. Set `RESTORE_DRILL_KEEP=1` to leave the project running for inspection.

It needs free disk for one more copy of the database and uploads, plus the downloaded backup (in `./backups/.restore-drill`, deleted afterwards). Run it when the server is quiet: it competes with the live stack for CPU and I/O while it runs.

#### Restoring from off-site after losing the server

1. On the new server, check out the same or a newer app version, put back `.env` (or generate a new one) and `.env.backup`, and run `docker compose up -d`.
2. `./scripts/offsite-backup.sh pull latest` downloads and verifies the newest copy into `./backups/<stamp>`.
3. `./scripts/restore.sh backups/<stamp>`, then `docker compose restart app`.

If `.env` was lost, the restored `auth.users` rows still work with a new `JWT_SECRET`, but everyone has to sign in again.

#### Recovery objectives

| Objective                          | With the nightly schedule above                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO** (data you can lose)        | Up to 24 hours: everything since the last successful nightly run. Run `scheduled-backup.sh` more often (e.g. also at lunchtime during exam weeks) to shorten it.       |
| **RTO** (time until teachers work) | Provisioning a server and `docker compose up -d`, plus the download, plus the restore. The drill prints how long its restore took; record that figure here per school. |

Re-measure the RTO when the data grows: the restore time scales with the database and upload sizes.

#### Hardening against a compromised server

Someone with root on the server can read `.env.backup`. With a key that may delete objects, they can also wipe the off-site copies. To make the copies survive that:

- Use an API key **without delete permission**, set `OFFSITE_KEEP=0` (the scripts then never delete), and expire old copies with the bucket's lifecycle rules instead (e.g. delete after 30 days).
- Additionally, enable object versioning or object lock (the four EU providers above, B2 and Wasabi support object lock; R2 supports bucket locks) so even an overwrite keeps the previous version for the retention period.

### Volume snapshot (faster, filesystem-level)

If your VPS provider supports volume snapshots (Hetzner, DigitalOcean, etc.) stop the stack first to avoid partial writes:

```bash
docker compose stop db
# take snapshot in your provider's control panel
docker compose start db
```

### JSON export (lightweight, app-level)

RubricMaker's Settings → Database tab can export all data as JSON. This is not a replacement for pg_dump but is useful for migrating between accounts or taking a quick snapshot before a risky change.

### Backups and erased students

Admin → Archive → **Erase permanently** removes a student and everything linked to them from the database and Storage (migration `084_erase_student.sql`). Copies made before the erasure are not touched:

- **Nightly cloud snapshots** (`nightly-backup`, `backups` bucket) keep each teacher's 7 most recent snapshots, so an erased student is gone from them after 7 days.
- **Off-site copies** (`scheduled-backup.sh`) keep the `OFFSITE_KEEP` newest backups (default 30, one per night), and the local `./backups` folder keeps the `LOCAL_KEEP` newest (default 7). An erased student is therefore gone from them after that many nights, or after the bucket lifecycle period when `OFFSITE_KEEP=0`. Record that period in the school's retention documentation.
- **`scripts/backup.sh` dumps run by hand and app JSON exports** are kept until you delete them. Rotate or prune them according to your school's retention policy, and do not restore an old dump over a database where students have since been erased without erasing them again.
- The student's own sign-in account (if they used the portal) lives in Supabase Auth; delete it under Authentication → Users.
- Files the teacher could not remove (voice feedback another grader recorded) are listed in the `audit_logs` row with `action = 'erase_student'`; delete them from Storage as an operator.

---

## Migrating from Supabase Cloud

`scripts/export-cloud.sh` and `scripts/import-cloud.sh` move a Supabase Cloud project to this self-hosted stack: users, all application rows **and the files in Storage** (attachments, export templates, essays, recordings, voice feedback, scans, backups).

1. **On your laptop** (needs `pg_dump`/`psql` matching the cloud Postgres version, and `curl`):

    ```bash
    ./scripts/export-cloud.sh
    ```

    It asks for the Session-pooler connection string (Dashboard → Project Settings → Database), then for the project URL and the `service_role` key (Dashboard → Project Settings → API) so it can download every Storage object. The result is `./cloud-export/<timestamp>/` with `auth-data.sql`, `public-data.sql`, `storage/<bucket>/…` and `storage-manifest.tsv`. It contains real student data and the folder is created readable only by you. Failed downloads, and object names with a tab or line break, are counted at the end — re-run, or fetch those files from the Dashboard.

2. **Copy the folder to the server** (e.g. `rsync -avz cloud-export/<timestamp> rubricmaker@your-vps:~/cloud-export/`).

3. **On the server**, with the stack up and migrations applied to a fresh database:

    ```bash
    ./scripts/import-cloud.sh ~/cloud-export/<timestamp>
    ```

    It loads the rows, then uploads every file through the Storage API at `STORAGE_URL` (default: `SITE_URL` from `.env`) with `SERVICE_ROLE_KEY` from `.env`, and finishes with a verification:
    - files per bucket in the export vs. on this instance;
    - per table (`attachments`, `export_templates`, `essay_submissions`, `recording_metadata`, `scan_metadata`), how many rows point at a file that is not in storage, with the first few paths.

    Voice-feedback audio is referenced from inside grade records, so it is covered by the per-bucket counts only.

If uploads fail (wrong `SITE_URL`, storage not running), fix the cause and run `./scripts/import-cloud.sh <dir> --storage-only` — uploads are idempotent. `--verify-only` prints the check again; `--skip-storage` imports rows only. Exports made with `--skip-storage`, or with the older script, have no files: the rows import, but every file they reference returns 404 until the objects are copied.

---

## Hardening the official stack

Production runs the **official Supabase self-hosted Docker stack**, not this repo's `docker-compose.yml`. Two high-priority gaps in that setup:

### Network exposure (#930)

Upstream's `docker-compose.yml` publishes Supavisor (`5432`, `6543`) and the API gateway (`8000`/`8443`, service key `api-gw` — Envoy-based on newer checkouts, Kong on older ones) on **all interfaces**. Docker inserts its own iptables rules ahead of the host firewall, so a port blocked in HestiaCP or ufw is still reachable from the internet — and the pooler port accepts Postgres logins directly, a known brute-force target. HestiaCP's nginx already reverse-proxies the public API domain to the gateway on `127.0.0.1`, so the raw ports don't need to be public.

1. Copy [`deploy/supabase/docker-compose.yml`](../deploy/supabase/docker-compose.yml) and [`deploy/supabase/docker-compose.override.yml`](../deploy/supabase/docker-compose.override.yml) into the stack's directory (Compose loads the override automatically) and `docker compose up -d` to apply it. See [`deploy/supabase/README.md`](../deploy/supabase/README.md) for the directory layout and the one-service-at-a-time upgrade.
2. Copy [`deploy/nginx-supabase-api-hestiacp.conf`](../deploy/nginx-supabase-api-hestiacp.conf) to the public API domain's vhost (`nginx.ssl.conf_after`) so `/project`, `/api/platform` and `/mcp` — Studio's dashboard and its SQL-executing MCP endpoint — 404 publicly instead of being reverse-proxied through. Reach them yourself over an SSH tunnel (`ssh -L 8000:127.0.0.1:8000 <vps>`) or WireGuard/Tailscale instead.
3. Rotate `DASHBOARD_PASSWORD` in the stack's `.env` once both are live — it may have crossed the network in clear text before the lockdown (`.mcp.json`'s production endpoint is `https://`, fixed already).
4. Verify from **outside** the VPS: `nmap -Pn -p 22,80,443,3000,5432,6543,8000,8443 <vps-ip>` should show only 22, 80 and 443 open.

### Memory and OOM protection (#932)

Nothing stops a memory-hungry sidecar (Studio, LanguageTool, Whisper) from pushing the kernel into OOM-killing Postgres mid-lesson. The same override file adds a `mem_limit` to every non-critical container and `oom_score_adj: -800` to `db`, so the kernel kills the container that overran instead. Two things it can't do from a compose file:

- **Swap**: check `swapon --show`; if empty, add a 2–4 GB swapfile with `vm.swappiness=10` as an OOM buffer, not working memory.
- **Trim what isn't needed**: `docker inspect supabase-analytics supabase-vector` — if either exists, the stack is still running Logflare/Vector (a second log pipeline duplicating Alloy + Loki, ~1–1.5 GB); remove them and Studio's `depends_on: analytics`. On a VPS that doesn't host mail or PHP sites, `v-list-sys-services` and disable ClamAV, SpamAssassin, Exim/Dovecot and MariaDB if HestiaCP enabled them.

`scripts/audit-live-stack.sh` (below) checks all of the above — port exposure, Studio/MCP reachability, memory limits, swap, OOM events, and the leftover Logflare/Vector/HestiaCP services — on the live host and tells you exactly what's still open.

---

## Production health check

`scripts/audit-live-stack.sh` is a read-only check for a host running HestiaCP and the official
Supabase Docker stack. It covers exposed ports, Studio/MCP reachability, upstream example secrets
and demo keys, response headers, SSH settings, memory limits and OOM protection, disk, Postgres
settings, tables without RLS, failed `pg_cron`/`pg_net` runs, scheduled backups, and drift between
the repository and the deployed migrations and edge functions. Each line is PASS, WARN, FAIL or
INFO, with the issue that tracks the fix. It changes nothing (only `SELECT`/`SHOW` queries and
GET/HEAD requests) and never prints secret values.

```bash
git clone --depth 1 https://github.com/NesiciCoding/RubricMaker /tmp/rm
sudo bash /tmp/rm/scripts/audit-live-stack.sh \
    --app-url https://your-app-domain --api-url https://your-supabase-domain \
    --repo-dir /tmp/rm | tee audit-$(date +%F).txt
```

The stack directory is detected from the `supabase-db` container; pass `--supabase-dir` if it is
not. The exit status is 1 while anything FAILs, so it also works as a post-change check. Port
exposure is checked from the server itself: confirm it from outside with the `nmap` command the
script prints.

---

## Migrations and edge functions on the official stack

The official Supabase Docker stack keeps no record of which migration files ran, and it serves edge
functions straight from `volumes/functions/`. Two scripts close that gap. Run them on the server from a
checkout of this repository (`git clone --depth 1 https://github.com/NesiciCoding/RubricMaker /tmp/rm`).

**`scripts/stack-drift.py`** compares the database and the deployed functions with the repository:

```bash
python3 /tmp/rm/scripts/stack-drift.py check             # read-only
python3 /tmp/rm/scripts/stack-drift.py baseline          # record what is already applied
python3 /tmp/rm/scripts/stack-drift.py apply             # run what is pending
```

- `check` works out each migration's status from the database itself. It reads every migration in order
  and keeps what should still exist afterwards: tables, columns, indexes, views, types, functions with
  their exact body, policies, triggers, `pg_cron` jobs and storage buckets, with later drops, renames and
  redefinitions taken into account. It then looks for those objects in the live catalog. Each migration
  is **applied**, **missing**, **partial** (some objects absent, listed) or **unknown** (it only grants,
  changes data or settings, so there is nothing to check). A function that exists with an older body
  counts as absent, so a migration that only redefines a function is still detected. It also lists edge
  functions that differ from the repository and environment variables the functions read but the
  edge-runtime container lacks. Exit status 1 means something is pending or differs.
- `baseline` creates `public._migrations`, the table `docker/migrate.sh` uses, and records every
  migration up to the newest applied one. It refuses if an earlier one looks missing or partial; check
  that one by hand and pass `--accept <file>` if it is in fact applied. After a baseline, `check` reads
  the table instead of guessing.
- `apply` runs the pending migrations in order. Each one runs in a single transaction together with its
  record row, and the run stops at the first failure. Take a backup first.

**`scripts/deploy-edge-functions.sh`** refreshes the deployed functions from the repository:

```bash
sudo bash /tmp/rm/scripts/deploy-edge-functions.sh
```

It refuses while `stack-drift.py` reports pending migrations, because new function code can need new
schema (`--force` skips that check). It then shows which functions change and asks before touching
anything (`--yes` skips the prompt — this is how CI drives it). Before copying, it saves
`volumes/functions` as `volumes/functions.bak-<timestamp>` and keeps the newest five. It replaces only
the directories the repository has, so the stack's own `main` router is left alone. Finally it restarts
the edge-runtime container and sends an `OPTIONS` request to every function through `127.0.0.1:8000`. If
a function fails to boot, it prints the command that restores the backup.

### Deploying from CI (#935)

Two things happen automatically on every push to `main`, in `ci.yml`'s `deploy-backend` and
`deploy-hestiacp` jobs, in that order — so a frontend that needs a new RPC, table or column never goes
live before the schema it depends on:

1. **`deploy-backend`** runs `stack-drift.py apply --yes` then `deploy-edge-functions.sh --yes` on the
   VPS. Both are no-ops when there's nothing pending, so this runs on every deploy, not only ones that
   touched `supabase/`. It then smoke-tests `${SUPABASE_PUBLIC_URL}/rest/v1/`.
2. **`deploy-hestiacp`** (the frontend deploy) only runs after `deploy-backend` succeeds, and still ends
   with the read-only `stack-drift.py check` from the interim fix, as a second, cheap confirmation.

Both connect over SSH, but as **different, narrowly scoped accounts** — neither is `root`, and neither
is a member of the `docker` group (which is root-equivalent: anyone who can run arbitrary `docker`
commands can mount the host filesystem into a container and read/write anything on the box):

- The frontend deploy (#404) uses the `rubricmaker` HestiaCP user over SFTP — see
  `docs/HESTIACP_SETUP.md` §9.1.
- The read-only drift check still uses `root` (`VPS_SSH_KEY`) — it predates this account and only ever
  runs `docker exec ... psql` in read-only queries and `docker inspect`, never a write.
- **`deploy-backend` uses a new, dedicated account, `rm-backend-deploy`**, provisioned as follows.

#### Provisioning `rm-backend-deploy`

This account's only privilege is running exactly one fixed, no-argument script as root through sudo —
not arbitrary `docker exec`, and not `docker`-group membership. The script
(`scripts/ci-backend-deploy.sh` in this repository) just calls the two tools above; review it before
installing it, same as any other root-run script.

**1. Create the account and let it receive files over SSH** (as root on the VPS):

```bash
useradd -m -s /bin/bash rm-backend-deploy
usermod -L rm-backend-deploy   # locks the password — key auth only, ever
install -d -m 700 -o rm-backend-deploy -g rm-backend-deploy /home/rm-backend-deploy/.ssh
touch /home/rm-backend-deploy/.ssh/authorized_keys
chown rm-backend-deploy:rm-backend-deploy /home/rm-backend-deploy/.ssh/authorized_keys
chmod 600 /home/rm-backend-deploy/.ssh/authorized_keys
```

**2. Generate a dedicated key pair** (on your own machine) and add the public half, with port/X11/agent
forwarding turned off (no `command=` here, unlike #404's key — this one needs both plain file copies
and a later command, so it can't be forced to one fixed command):

```bash
ssh-keygen -t ed25519 -C "github-actions-backend-deploy" -f ~/.ssh/rm_backend_deploy -N ""
PUBKEY="$(cat ~/.ssh/rm_backend_deploy.pub)"
ssh root@YOUR_VPS_IP "printf '%s\n' 'no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding ${PUBKEY}' >> /home/rm-backend-deploy/.ssh/authorized_keys"
```

Confirm it connects and has no `sudo` access yet: `ssh -i ~/.ssh/rm_backend_deploy rm-backend-deploy@YOUR_VPS_IP whoami` should print `rm-backend-deploy`; `... sudo -n true` should fail (`sudo: a password is required`) until the next step.

**3. Install the wrapper script, the tools it runs, and the sudoers rule** (as root):

`ci-backend-deploy.sh` deliberately does not execute `stack-drift.py` or `deploy-edge-functions.sh`
from the CI-writable staging directory — if it did, the `rm-backend-deploy` account could replace
either file and get root to run it, which would defeat the point of restricting that account to one
script. So all three files are installed together here, the same way, as root:

```bash
# From a checkout of this repository on the server (or scp the files over):
install -d -m 755 -o root -g root /usr/local/lib/rm-backend-deploy
install -m 644 -o root -g root scripts/stack-drift.py scripts/deploy-edge-functions.sh /usr/local/lib/rm-backend-deploy/
install -m 755 -o root -g root scripts/ci-backend-deploy.sh /usr/local/sbin/rm-backend-deploy.sh

cat > /etc/sudoers.d/rm-backend-deploy <<'EOF'
rm-backend-deploy ALL=(root) NOPASSWD: /usr/local/sbin/rm-backend-deploy.sh ""
EOF
chmod 440 /etc/sudoers.d/rm-backend-deploy
visudo -c   # validates every file under /etc/sudoers.d — fix before moving on if this reports an error
```

The trailing `""` on the sudoers line matters: a command entry with no argument list at all still lets
the caller pass arbitrary arguments, so without it "no arguments" wouldn't actually be enforced.
`rm-backend-deploy.sh` always reads _data_ from the fixed path `/home/rm-backend-deploy/incoming`
(overridable via `INCOMING` for manual testing) and the _tools_ from `/usr/local/lib/rm-backend-deploy`
(overridable via `TOOLS_DIR`) — CI populates only the former, over a plain SSH file copy that needs no
privilege of its own (`rm-backend-deploy` writing into its own home directory).

**4. Test the whole path by hand** before wiring up CI — stage a data snapshot the same way CI will,
as the restricted user (no root needed for this part — it's never given the tool scripts):

```bash
ssh -i ~/.ssh/rm_backend_deploy rm-backend-deploy@YOUR_VPS_IP "mkdir -p ~/incoming/supabase/migrations"
scp -i ~/.ssh/rm_backend_deploy supabase/migrations/*.sql \
  rm-backend-deploy@YOUR_VPS_IP:incoming/supabase/migrations/
scp -i ~/.ssh/rm_backend_deploy -r supabase/functions rm-backend-deploy@YOUR_VPS_IP:incoming/supabase/

# The real thing — this applies any pending migrations and redeploys any changed functions:
ssh -i ~/.ssh/rm_backend_deploy rm-backend-deploy@YOUR_VPS_IP "sudo -n /usr/local/sbin/rm-backend-deploy.sh"
```

Run this from a clean checkout (`git status` shows nothing uncommitted) so what you're testing matches
what's in `main`. If it reports "No pending migrations." and "Every deployed function already matches
the repository," that's success — it means production was already caught up.

If `sudo` refuses with `sorry, you must have a tty to run sudo`, your `sudoers` has `requiretty` set
and conflicts with the key's `no-pty` restriction above — add
`Defaults:rm-backend-deploy !requiretty` to `/etc/sudoers.d/rm-backend-deploy` (before the `NOPASSWD`
line, then `visudo -c` again) rather than dropping `no-pty`.

**5. Add the private key as a GitHub secret:**

```
Secret name : VPS_BACKEND_SSH_KEY
Secret value: (paste the entire contents of ~/.ssh/rm_backend_deploy, including the -----BEGIN----- lines)
```

**Updating the wrapper or tool scripts later:** re-run step 3's three `install` lines after pulling the
new versions — they overwrite the files in place; the sudoers rule doesn't change unless the wrapper's
path does.

---

## Upgrade Path

RubricMaker's `docker-compose.yml` pins image versions. To upgrade:

1. Pull the new `docker-compose.yml` from the repository (or edit image tags manually).
2. Take a database backup before upgrading.
3. Apply any new migrations:

    ```bash
    docker compose up -d --build db_migrate
    docker compose logs db_migrate
    ```

4. Restart remaining services:

    ```bash
    docker compose up -d --build
    ```

`db_migrate` runs once `auth` and `storage` are healthy (it needs the `auth` and `storage` schemas they create), and `app` — the only container with a published port — starts only after `db_migrate` completed successfully. Until then nothing is reachable, so no one can sign up before the trigger that creates profiles exists. If a migration fails, `app` stays down: fix it and re-run `docker compose up -d`.

**Supabase component upgrades** (postgres, auth, rest, storage images) should be done one at a time. Check the [Supabase Docker changelog](https://github.com/supabase/supabase/releases) for breaking changes before bumping image tags.

---

## Resource Sizing

| Users / Students                     | RAM  | vCPU | Disk    | Notes                                    |
| ------------------------------------ | ---- | ---- | ------- | ---------------------------------------- |
| 1 teacher / up to 50 students        | 1 GB | 1    | 10 GB   | Minimum; no recording storage            |
| 1–5 teachers / up to 500 students    | 2 GB | 2    | 20 GB   | Comfortable for daily use                |
| 5–20 teachers / up to 5 000 students | 4 GB | 2–4  | 50 GB   | Enable connection pooling (PgBouncer)    |
| 20+ teachers                         | 8 GB | 4+   | 100 GB+ | Add PgBouncer; consider managed Supabase |

**Storage note:** Each speaking-session recording is up to 50 MB (enforced in the app). Budget ~1 GB of storage per 20 students who regularly use recordings.

**Connection pooling:** PostgreSQL defaults to 100 max connections. With more than ~15 concurrent users add PgBouncer in front of `db`. Set `pool_mode = transaction` and point `rest` at PgBouncer's port.

---

## Enabling pg_cron (Audit Log + Auto-Anonymization)

Migration `038_audit_logs.sql` calls `CREATE EXTENSION IF NOT EXISTS pg_cron` and registers cleanup jobs. pg_cron requires two things on self-hosted deployments:

1. **Add `pg_cron` to `shared_preload_libraries`** in `postgresql.conf`:

    ```ini
    shared_preload_libraries = 'pg_cron'
    cron.database_name = 'postgres'
    ```

    This repo's `docker-compose.yml` does **not** set it: the `db` service only sets `POSTGRES_PASSWORD`, and there is no `POSTGRES_EXTRA_FLAGS` or `postgresql.conf` mount. It works because the bundled `public.ecr.aws/supabase/postgres` image ships `pg_cron` preloaded — confirm with `SHOW shared_preload_libraries;`. On a different Postgres image, add `shared_preload_libraries = 'pg_cron'` and `cron.database_name = 'postgres'` to a `postgresql.conf` and mount it into the container.

2. **Grant usage** (handled automatically by the migration via the `postgres` superuser role):

    ```sql
    GRANT USAGE ON SCHEMA cron TO postgres;
    ```

On **managed Supabase** (supabase.com), enable pg_cron through the Dashboard → Database → Extensions panel. The migration's `CREATE EXTENSION IF NOT EXISTS pg_cron` is idempotent and will succeed once it is enabled.

To verify scheduled jobs are running:

```sql
SELECT jobname, schedule, command, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

### Diagnostic log cleanup (`client-logs-cleanup`)

Migration `089_client_logs_bounds.sql` schedules `client-logs-cleanup` at 03:35 every night. It deletes `client_logs` rows (the stress-test diagnostics written when the client build sets `VITE_STRESS_TEST_LOGGING=true`, and the errors-only reports written with `VITE_ERROR_REPORTING=true`, see `docs/ERROR_REPORTING.md`) older than 30 days. The same migration adds a size check that rejects oversized rows. The client logger clamps its fields to fit, so normal logging never hits the limit.

### Teacher email digest job (`scheduled-digest`)

Migration `059_scheduled_digest.sql` schedules a `teacher-email-digest` cron job that calls the `scheduled-digest` edge function nightly via `pg_net`'s `net.http_post` — the first pg_cron job in this repo that reaches out to an edge function instead of running plain SQL. It needs:

1. **The `pg_net` extension** — also enabled by that migration (`CREATE EXTENSION IF NOT EXISTS pg_net`), same "just works on Cloud, needs `shared_preload_libraries` self-hosted" caveat as `pg_cron` above.
2. **This project's URL and service-role key**, set once as database-level GUCs (a shared migration file can't hardcode per-deployment secrets):

    ```sql
    ALTER DATABASE postgres SET app.settings.project_url = 'https://<project-ref>.supabase.co';
    ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
    ```

    Until both are set, the job raises in `cron.job_run_details` (visible as a failed `teacher-email-digest` run, with the missing setting named in `return_message`) instead of calling the function with a bogus bearer token. Migration `106` replaced the original silent version.

    The job gives its `net.http_post` a **two-minute** budget (`timeout_milliseconds := 120000`, migration `106`). `net.http_post` cancels the request after that window and records a `timed_out` failure in `net._http_response`, while the function itself keeps running — the default 5 seconds was shorter than a digest run that actually sends mail (synchronous SMTP sends plus the heartbeat ping), so the "Scheduled HTTP call failed" alert used to fire every morning a digest went out.

3. **The `scheduled-digest` function deployed** — same deploy step as `nightly-backup` (copy `index.ts` into the official self-hosted stack's `volumes/functions/scheduled-digest/index.ts`, or deploy via Cloud).

The job only emails teachers who opted in via Settings → Email Digest (`digestEmailEnabled`); it's a no-op for everyone else.

**"Scheduled HTTP call failed" e-mails every morning.** Confirm which call failed before touching anything (run this soon after the alert — pg_net prunes responses after `pg_net.ttl`, 6 hours by default):

```sql
SELECT created, status_code, timed_out, error_msg, left(content, 300) AS body
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

| Row                                                                | Meaning                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| empty `status_code`, `timed_out = true`, "Timeout of … ms reached" | pg_net gave up waiting (default 5 s, migration `106` sets 120 s). The function usually finished anyway, so teachers did get their digest; if it still times out at 120 s the run is genuinely too slow. |
| `status_code` 401                                                  | `app.settings.service_role_key` is not this project's current service-role key (rotated, or copied from another deployment). Re-run the `ALTER DATABASE … SET app.settings.service_role_key` above.     |
| `status_code` 500, body `"SMTP is not configured"`                 | The edge-runtime container has no `SMTP_*` variables (see `deploy/supabase/docker-compose.override.yml`).                                                                                               |
| `status_code` 500, body `"Server misconfigured"`                   | The function container has no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.                                                                                                                             |

A run can also be recorded as a _success_ while individual teachers failed to receive their mail: the function returns 200 with an `errors` array and skips its heartbeat ping, so the missing dead-man's-switch ping (not this alert) is what reports partial delivery failures.

---

## Login providers

The sign-in page shows one button per provider listed in the `auth_providers` row of
`public.site_config` (a JSON array). The default is every supported provider:

```sql
SELECT value FROM public.site_config WHERE key = 'auth_providers';
-- ["google", "azure_personal", "azure_ad", "email"]
```

To hide a provider, update the array in the SQL editor (Supabase Studio or `psql`). There is no
admin screen for this yet:

```sql
UPDATE public.site_config SET value = '["google", "email"]' WHERE key = 'auth_providers';
```

Valid entries are `google`, `azure_personal`, `azure_ad` and `email`. A provider listed here must
also be enabled under Authentication → Providers in Supabase, or its button signs in to nothing.
Logged-out visitors can read only this one key (migration 088); the rest of `site_config` is
readable by signed-in users only. If the row cannot be read, the page falls back to showing every
provider.

## Email

Supabase Auth (GoTrue) sends every email RubricMaker relies on. Each one has a code-only, Dutch +
English template in `public/email-templates/`:

| GoTrue email     | Template                | Sent when                                                             |
| ---------------- | ----------------------- | --------------------------------------------------------------------- |
| Confirmation     | `confirmation.html`     | A new teacher signs in with email for the first time                  |
| Magic link       | `magic-link.html`       | An existing teacher signs in with email                               |
| Recovery         | `recovery.html`         | A password reset is requested (not used by the app today)             |
| Invite           | `invite.html`           | An admin invites a user from Studio (no code; points to the app)      |
| Email change     | `email-change.html`     | A user changes their email address (not used by the app today)        |
| Reauthentication | `reauthentication.html` | GoTrue asks for a fresh code before a sensitive change (not used yet) |

The templates show the 8-digit code, never a clickable token link: Microsoft Safe Links and similar
scanners open links on arrival and would use up the one-time token. `otp-code.html` is the older
single template, kept so existing configs that point at it keep working.

**This repo's `docker-compose.yml`** already points GoTrue at these templates (served by the `app`
container).

**The official Supabase stack** needs `deploy/supabase/docker-compose.override.yml`:

1. Copy it next to the stack's `docker-compose.yml` (with the pinned `deploy/supabase/docker-compose.yml`
   if the host is being rebuilt). Compose loads `docker-compose.override.yml` automatically.
2. Copy the templates into the stack: `cp public/email-templates/*.html <stack>/volumes/mail-templates/`.
3. In the stack's `.env`, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`
   (the From address), `SMTP_SENDER_NAME=RubricMaker` (the display name) and
   `ENABLE_EMAIL_AUTOCONFIRM=false`, plus `APP_URL` (the address the app is served from). Quote
   `SMTP_PASS` in single quotes if it contains `$`, `#` or spaces.
4. `docker compose up -d --force-recreate mail-templates auth functions`

GoTrue fetches a template over HTTP the first time it needs it and falls back to its built-in,
link-only email if the fetch fails, so check after a change:

```bash
docker compose exec auth wget -qO- http://mail-templates/magic-link.html | head -5
```

GoTrue checks the SMTP server's TLS certificate against `SMTP_HOST`. To see what it sees, run this
from the stack's network (replace the host name at the end):

```bash
docker run --rm --network supabase_default alpine sh -c 'apk add -q openssl && openssl s_client -brief -starttls smtp -connect "$0:587" -servername "$0" </dev/null' mail.example.nl
```

`Verification: OK` and a certificate for that exact host name are required.

### Relay provider and sending domain

Production sends auth mail through an **SMTP relay**, not directly from Office 365, Gmail or a school
tenant. The relay owns the sending reputation and the school's own mail flow is never involved. Use an
EU provider — these messages go to student and teacher addresses. How much delivery evidence comes
back depends on the provider: Brevo keeps a per-message transactional log, while STRATO has no
delivery dashboard and returns bounces to the sending mailbox (see below).

**STRATO is the primary setup**, and the values below assume it: the domain and its mailboxes live in
a STRATO package (Mail Basic is enough — five mailboxes), and `smtp.strato.de` relays the app's mail.
From address, SPF and DKIM then all belong to one package, which is why the records further down are
short. **Brevo** (France, free tier 300 emails/day) is the documented **fallback** for a domain that
is not hosted at STRATO, or when a separate provider dashboard is wanted.

| Bundled stack → official stack     | STRATO value                                        |
| ---------------------------------- | --------------------------------------------------- |
| `SMTP_HOST` → `SMTP_HOST`          | `smtp.strato.de`                                    |
| `SMTP_PORT` → `SMTP_PORT`          | `465` (implicit TLS); `587` (STARTTLS) also works   |
| `SMTP_USER` → `SMTP_USER`          | the full mailbox address, e.g. `noreply@example.nl` |
| `SMTP_PASS` → `SMTP_PASS`          | that mailbox's password                             |
| `SMTP_SENDER` → `SMTP_ADMIN_EMAIL` | the same mailbox address                            |
| — → `SMTP_SENDER_NAME`             | `RubricMaker`                                       |

Two STRATO rules decide what goes in there: `SMTP_USER` must be a **mailbox**, never an alias (aliases
receive mail but cannot authenticate), and the From address must be a mailbox in the package too —
otherwise submission fails with `not authorized to send mail from`. The Brevo fallback uses
`smtp-relay.brevo.com` on `587` or `465`, the account login as `SMTP_USER` and an **SMTP key** as
`SMTP_PASS`, with the From domain verified in Brevo.

This repo's `docker-compose.yml` maps `SMTP_*` onto `GOTRUE_SMTP_*` itself, so the bundled stack needs
no extra variables. The official stack reads `SMTP_*` from its `.env` (GoTrue's image maps them to
`GOTRUE_SMTP_*`), and `deploy/supabase/docker-compose.override.yml` passes the same block to the edge
functions, so the notification emails share the relay and its reputation.

#### SPF, DKIM and DMARC

All three belong on the **sending domain** and are what the receiving school actually checks:

| Record | Name                          | Value                                                            |
| ------ | ----------------------------- | ---------------------------------------------------------------- |
| SPF    | `@` (TXT)                     | `v=spf1 redirect=_spf.strato.com`                                |
| DKIM   | `strato-dkim-0002._domainkey` | `strato-dkim-0002._domainkey.rzone.de.` (CNAME)                  |
| DKIM   | `strato-dkim-0003._domainkey` | `strato-dkim-0003._domainkey.rzone.de.` (CNAME)                  |
| DMARC  | `_dmarc` (TXT)                | `v=DMARC1; p=none; rua=mailto:dmarc@example.nl; adkim=r; aspf=r` |

On STRATO's own nameservers the DKIM records already exist; with DNS hosted elsewhere, add both
CNAMEs. Keep **both** selectors — STRATO signs with an RSA key (`strato-dkim-0002`) and an ed25519
key (`strato-dkim-0003`), and some receivers ignore the ed25519 signature while others only use it.
The apex SPF entry also has its own control in the STRATO DNS settings: _STRATO SPF-Regel → Standard
STRATO Mailserver_ writes `redirect=_spf.strato.com`. Where another sender shares the domain, use
`v=spf1 include:_spf.strato.com ~all` instead.

The Brevo fallback publishes `v=spf1 include:spf.brevo.com ~all` and the DKIM CNAMEs Brevo lists under
Senders, domains & IPs → your domain → DKIM; DMARC is the same record either way.

- **One SPF record only.** If the domain already has one (the school's own mail), edit it and add the
  provider's `redirect=`/`include:`; a second `v=spf1` record makes SPF fail outright.
- **DKIM is the one that matters.** The `<selector>._domainkey…` CNAMEs sign each message — don't
  flatten them to A records or proxy them.
- Start DMARC at `p=none` with a report address, then move to `p=quarantine` once the reports show the
  relay passing for a week or two. Don't jump to `p=reject` while the school's own mail still sends
  from the domain.

Verify the records from anywhere:

```bash
dig +short TXT example.nl | grep spf1                        # exactly one v=spf1 record, with the include
dig +short CNAME strato-dkim-0002._domainkey.example.nl     # and strato-dkim-0003
```

Then request a code and read the message's `Authentication-Results` header: `spf=pass`, `dkim=pass`
and `dmarc=pass` are what "verified" means. Without them the relay still accepts the message and the
school's filter still drops it. Requesting a code is the only end-to-end test worth running, and it
should go to an Outlook/school address, not just a Gmail account on the same network.

With STRATO there is no delivery dashboard: the envelope sender is the mailbox, so bounces and DMARC
aggregate reports arrive **in that mailbox** (STRATO webmail) — check it when a teacher reports a
missing code. Brevo keeps the same information in its transactional log.

### Notification emails

Three edge functions send their own email over the same SMTP account, with Dutch + English bodies
from `supabase/functions/_shared/notificationEmails.ts`:

| Function                 | Recipient | Sent when                                                                                  |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------ |
| `notify-student-graded`  | Student   | A teacher saves a grade with Settings → "Notify students when graded" on                   |
| `notify-student-message` | Student   | A teacher sends or replies to a message                                                    |
| `scheduled-digest`       | Teacher   | Nightly, when the teacher turned on a digest category in Settings and something is waiting |

Only students with an email address on their record get mail. The SMTP client is
`supabase/functions/_shared/smtp.ts` (STARTTLS on 587, implicit TLS on 465, AUTH PLAIN/LOGIN; it
refuses to send a password without TLS) with the Deno socket glue in `supabase/functions/_deno/`.
`deploy-edge-functions.sh` copies both folders along with the functions.

The edge-runtime container needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` and `APP_URL` (the app's address, used for the links). The
override file passes them through from the stack's `.env`; `stack-drift.py check` reports any that are
missing. A failed send is logged as `[mail] send failed …` in `docker logs supabase-edge-functions`.
The grade and message functions answer `{"skipped": true, "reason": "smtp_not_configured" | "send_failed"}`
instead of failing the teacher's action; `scheduled-digest` reports failed recipients in `errors` and
skips its heartbeat ping, so the missed-heartbeat alert fires.

## Log Rotation

The observability stack (see [OBSERVABILITY_HESTIACP.md](OBSERVABILITY_HESTIACP.md)) uses Loki with a 168-hour (7-day) retention window. For raw web-server logs on HestiaCP/Virtualmin, `logrotate` is configured automatically by the control panel. Verify with:

```bash
logrotate --debug /etc/logrotate.conf
```

Docker daemon logs are rotated via `/etc/docker/daemon.json`:

```json
{
    "log-driver": "json-file",
    "log-opts": { "max-size": "50m", "max-file": "5" }
}
```

---

## SSL Certificate Renewal

**Caddy (HTTPS profile):** Renewal is fully automatic via Let's Encrypt. Caddy stores certificates in `caddy-data:/data`. No action needed.

**HestiaCP / Virtualmin:** Renewal is handled by the control panel's built-in Let's Encrypt integration. Check that the cron job `certbot renew` (or equivalent) runs and that port 80 is reachable for HTTP-01 challenges.

---

## Troubleshooting

| Symptom                                                                           | First steps                                                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SMTP / OTP email not arriving                                                     | Check `docker compose logs auth` for SMTP errors; verify `SMTP_HOST/PORT/USER/PASS` in `.env`; see Email                                    |
| Cannot log in after restore                                                       | Run `docker compose up -d db_migrate` to ensure migrations are applied; check `auth` logs                                                   |
| Storage uploads fail                                                              | Check `docker compose logs storage`; verify S3/local storage bucket config in `.env`                                                        |
| pg_cron jobs not running                                                          | See "Enabling pg_cron" above; confirm with `SELECT * FROM cron.job`                                                                         |
| High memory usage                                                                 | Check `docker stats`; add connection pooling if `db` has many idle connections                                                              |
| RLS errors in app                                                                 | Run `npm run db:reset` locally to reproduce; check for missing policies in latest migrations                                                |
| No admin can sign in                                                              | See "Admin recovery" below                                                                                                                  |
| Live Monitor: `ChannelRateLimitReached: Too many channels` in the `realtime` logs | See "Realtime limits" below                                                                                                                 |
| Student test/essay links fail to load                                             | Check **Allow anonymous sign-ins**: `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true` on `auth` (Studio: Authentication → Sign In / Providers) |

### Realtime limits

The Live Monitor listens on one Realtime channel per student, and every student page joins one. Realtime enforces per-tenant limits stored in `_realtime.tenants` (the self-hosted tenant is `realtime-dev`): `max_channels_per_client` (channels on one socket, default 100), `max_concurrent_users` (default 200), `max_events_per_second` (default 100) and `max_joins_per_second` (default 100). The app spreads the monitor's channels over several sockets of at most 50 each, so `max_channels_per_client` is only hit by older app builds. Classes of many students, or several monitored tests at once, need more than the defaults.

Don't edit `_realtime.tenants` by hand: Realtime deletes and recreates the tenant every time it starts, so an `update` is lost on the next restart. The tenant takes its limits from Realtime's `TENANT_MAX_*` environment variables when it is created. `deploy/supabase/docker-compose.override.yml` sets them (1000 concurrent users, 1000 events/s, 500 joins/s, 200 channels per socket); edit the numbers there to change them. Apply with:

```bash
docker compose up -d --force-recreate realtime
```

Recreating Realtime drops live connections for a few seconds (clients reconnect on their own), so do it outside a test. Then check the tenant (`docker compose exec -e PGHOST=127.0.0.1 db psql -U supabase_admin -d postgres`):

```sql
select external_id, max_concurrent_users, max_events_per_second, max_joins_per_second, max_channels_per_client
from _realtime.tenants;
```

If it still shows 200 / 100 / 100 / 100, the Realtime image predates these variables; upgrade Realtime (see Upgrade Path).

---

## Admin recovery

Roles live in `public.profiles.role` (`admin`, `teacher`, `student`). Inside the app, role changes are guarded by the `protect_role_changes()` trigger: only an admin can change another user's role, and the last admin cannot be demoted (Admin → Users and Onboarding both refuse it). Since migration `083_role_repair_last_admin.sql`, the same trigger lets an **operator** change any role: a direct database connection (Supabase Studio SQL editor, `psql`) or a request made with the service-role key.

To restore an admin, run this in the SQL editor or with `psql` (Docker Compose: `docker compose exec -e PGHOST=127.0.0.1 db psql -U supabase_admin -d postgres`):

```sql
-- Find the account
SELECT id, email, display_name, role FROM public.profiles WHERE lower(email) = lower('teacher@school.example');

-- Promote it
UPDATE public.profiles SET role = 'admin' WHERE lower(email) = lower('teacher@school.example');
```

The user gets admin rights after reloading the app (or signing out and back in).

### Set a password when sign-in mail does not arrive

When Outlook or a school relay drops the OTP/confirmation mail, an admin can give any account a password and mark its address confirmed (migration `108_admin_set_user_password.sql`). It works without the functions runtime, so it suits the Docker stack. Call it signed in as an admin (the SQL editor and `psql` have no user, so use the operator `UPDATE auth.users` fallback below instead):

```sql
SELECT public.admin_set_user_password('teacher@school.example', 'NewTempPassword123!');
-- optional: p_confirm_email => false, p_revoke_sessions => false
```

It matches the email exactly, needs a password of 8 to 72 bytes, is limited to 20 calls a minute, ends the target's other sessions, and writes an `admin_set_user_password` row to `audit_logs` without the password. Ask the person to change the temporary password afterwards. Operator fallback from the SQL editor: `UPDATE auth.users SET encrypted_password = extensions.crypt('…', extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()) WHERE lower(email) = lower('teacher@school.example');`.

**Deployments that have not applied migration 083 yet** still reject the update with "Only admins can change roles". Apply the migrations first (`docker compose up -d db_migrate`, or `supabase db push`). If that is not possible, wrap the update in a transaction that disables the trigger for that one statement:

```sql
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER enforce_role_protection;
UPDATE public.profiles SET role = 'admin' WHERE lower(email) = lower('teacher@school.example');
ALTER TABLE public.profiles ENABLE TRIGGER enforce_role_protection;
COMMIT;
```
