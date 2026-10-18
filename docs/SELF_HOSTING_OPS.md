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

`restore.sh` refuses a backup that is missing any of these files.

The scripts use `docker compose` (or the older `docker-compose` when that is all the server has). The uploads volume is `<project>_storage-data`, where the project is resolved the way Compose resolves it: `-p`/`--project-name`, then `COMPOSE_PROJECT_NAME` from the environment or the project's `.env`, then the compose file's `name:` (so `rubricmaker` here). `backup.sh` stops with an error when that volume does not exist instead of archiving an empty one; set `STORAGE_VOLUME` to point the scripts at a different volume.

Tables, GRANTs, RLS policies, triggers (such as the one on `auth.users` that creates profiles) and the realtime publication are **not** in the backup: they come from the migrations the stack runs. A restore therefore never recreates them, and the REST API keeps its `anon`/`authenticated`/`service_role` permissions.

To restore, onto the same server or a new one:

1. Start the stack at the same or a newer app version (`docker compose up -d`). This runs `db_migrate`.
2. Run `./scripts/restore.sh <backup-dir>`. It refuses if the stack lacks a migration the backup was taken with.
3. The script first unpacks the uploaded files into a staging folder in the volume, so a corrupt archive stops the restore before anything is changed. It then empties and reloads all tables in a single transaction with `ON_ERROR_STOP`. Any error rolls everything back and the script exits non-zero, so you never end up with a half-restored database. Only after that are the live files swapped for the staged ones.
4. Run `docker compose restart app`.

Backups made before format 2 (a single `database.sql` dumped with `--no-acl`) are refused. Replaying them dropped every GRANT. Take a new backup with the current script.

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
- **`scripts/backup.sh` dumps and app JSON exports** are kept until you delete them. Rotate or prune them according to your school's retention policy, and do not restore an old dump over a database where students have since been erased without erasing them again.
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
anything. Before copying, it saves `volumes/functions` as `volumes/functions.bak-<timestamp>` and keeps
the newest five. It replaces only the directories the repository has, so the stack's own `main` router
is left alone. Finally it restarts the edge-runtime container and sends an `OPTIONS` request to every
function through `127.0.0.1:8000`. If a function fails to boot, it prints the command that restores
the backup.

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

Migration `089_client_logs_bounds.sql` schedules `client-logs-cleanup` at 03:35 every night. It deletes `client_logs` rows (the stress-test diagnostics written when the client build sets `VITE_STRESS_TEST_LOGGING=true`) older than 30 days. The same migration adds a size check that rejects oversized rows. The client logger clamps its fields to fit, so normal logging never hits the limit.

### Teacher email digest job (`scheduled-digest`)

Migration `059_scheduled_digest.sql` schedules a `teacher-email-digest` cron job that calls the `scheduled-digest` edge function nightly via `pg_net`'s `net.http_post` — the first pg_cron job in this repo that reaches out to an edge function instead of running plain SQL. It needs:

1. **The `pg_net` extension** — also enabled by that migration (`CREATE EXTENSION IF NOT EXISTS pg_net`), same "just works on Cloud, needs `shared_preload_libraries` self-hosted" caveat as `pg_cron` above.
2. **This project's URL and service-role key**, set once as database-level GUCs (a shared migration file can't hardcode per-deployment secrets):

    ```sql
    ALTER DATABASE postgres SET app.settings.project_url = 'https://<project-ref>.supabase.co';
    ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
    ```

    Until both are set, `current_setting(..., true)` returns `NULL` and the job's `net.http_post` calls fail silently — check `cron.job_run_details` for the `teacher-email-digest` jobname to confirm it's actually reaching the function.

3. **The `scheduled-digest` function deployed** — same deploy step as `nightly-backup` (copy `index.ts` into the official self-hosted stack's `volumes/functions/scheduled-digest/index.ts`, or deploy via Cloud).

The job only emails teachers who opted in via Settings → Email Digest (`digestEmailEnabled`); it's a no-op for everyone else.

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

| Symptom                       | First steps                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| SMTP / OTP email not arriving | Check `docker compose logs auth` for SMTP errors; verify `SMTP_HOST/PORT/USER/PASS` in `.env` |
| Cannot log in after restore   | Run `docker compose up -d db_migrate` to ensure migrations are applied; check `auth` logs     |
| Storage uploads fail          | Check `docker compose logs storage`; verify S3/local storage bucket config in `.env`          |
| pg_cron jobs not running      | See "Enabling pg_cron" above; confirm with `SELECT * FROM cron.job`                           |
| High memory usage             | Check `docker stats`; add connection pooling if `db` has many idle connections                |
| RLS errors in app             | Run `npm run db:reset` locally to reproduce; check for missing policies in latest migrations  |
| No admin can sign in          | See "Admin recovery" below                                                                    |

---

## Admin recovery

Roles live in `public.profiles.role` (`admin`, `teacher`, `student`). Inside the app, role changes are guarded by the `protect_role_changes()` trigger: only an admin can change another user's role, and the last admin cannot be demoted (Admin → Users and Onboarding both refuse it). Since migration `083_role_repair_last_admin.sql`, the same trigger lets an **operator** change any role: a direct database connection (Supabase Studio SQL editor, `psql`) or a request made with the service-role key.

To restore an admin, run this in the SQL editor or with `psql` (Docker Compose: `docker compose exec db psql -U supabase_admin -d postgres`):

```sql
-- Find the account
SELECT id, email, display_name, role FROM public.profiles WHERE lower(email) = lower('teacher@school.example');

-- Promote it
UPDATE public.profiles SET role = 'admin' WHERE lower(email) = lower('teacher@school.example');
```

The user gets admin rights after reloading the app (or signing out and back in).

**Deployments that have not applied migration 083 yet** still reject the update with "Only admins can change roles". Apply the migrations first (`docker compose up -d db_migrate`, or `supabase db push`). If that is not possible, wrap the update in a transaction that disables the trigger for that one statement:

```sql
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER enforce_role_protection;
UPDATE public.profiles SET role = 'admin' WHERE lower(email) = lower('teacher@school.example');
ALTER TABLE public.profiles ENABLE TRIGGER enforce_role_protection;
COMMIT;
```
