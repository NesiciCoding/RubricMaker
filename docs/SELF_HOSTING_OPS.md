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

### Off-site backups

`backup.sh` writes to `./backups` on the same disk as the database, so losing the server (hardware failure, ransomware, a provider incident, a mistaken `docker volume rm`) loses the backups with it. The off-site scripts keep encrypted copies in an S3-compatible bucket at **another provider** and prove regularly that they restore.

| Script                        | What it does                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/scheduled-backup.sh` | The nightly job: `backup.sh`, then upload, then keep the `LOCAL_KEEP` newest local backups, then ping `BACKUP_HEARTBEAT_URL`. Any failure exits non-zero and skips the ping. |
| `scripts/offsite-backup.sh`   | `push <dir>` (upload, verify against the local files, prune to `OFFSITE_KEEP`), `list`, `pull latest\|<name> [dir]` (download and verify checksums)                          |
| `scripts/restore-drill.sh`    | Restores the newest off-site backup (or a local one) into a throwaway Compose project and checks it, then removes the project                                                |

Uploads go through [rclone](https://rclone.org) (run from the pinned `rclone/rclone` image, so nothing is installed on the host) with a `crypt` remote. File contents **and** names are encrypted on this server with `BACKUP_ENCRYPTION_PASSPHRASE` before they leave it, so the bucket provider only ever stores ciphertext. That matters for the GDPR position: the provider holds no readable student data. After each upload, rclone's `cryptcheck` compares the uploaded copy with the local files.

#### Set up

1. Create a bucket at a provider other than the one hosting the server. Cloudflare R2 (no egress fees), Backblaze B2 and Wasabi all work, and an EU region keeps the data in the EU. Create an API key scoped to that bucket only.
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
- Additionally, enable object versioning or object lock (B2 and Wasabi support object lock; R2 supports bucket locks) so even an overwrite keeps the previous version for the retention period.

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

To restore an admin, run this in the SQL editor or with `psql` (Docker Compose: `docker compose exec -e PGHOST=127.0.0.1 db psql -U supabase_admin -d postgres`):

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
