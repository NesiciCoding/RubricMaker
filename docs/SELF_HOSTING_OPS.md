# RubricMaker — Self-Hosting Operations Guide

This document covers day-two operations for self-hosted RubricMaker deployments: backup, restore, upgrades, resource sizing, and pg_cron activation. For initial setup see [HESTIACP_SETUP.md](HESTIACP_SETUP.md) or [VIRTUALMIN_SETUP.md](VIRTUALMIN_SETUP.md). For monitoring see [OBSERVABILITY_HESTIACP.md](OBSERVABILITY_HESTIACP.md).

---

## Backup and Restore

### PostgreSQL dump (recommended)

```bash
# Dump all data
docker-compose exec db pg_dump -U supabase_admin -d postgres -Fc -f /tmp/rubricmaker.dump
docker cp $(docker-compose ps -q db):/tmp/rubricmaker.dump ./backups/rubricmaker-$(date +%Y%m%d).dump

# Restore into a clean stack
docker-compose down
docker volume rm rubricmaker_db-data   # destroys existing data
docker-compose up -d db
sleep 10
docker cp ./backups/rubricmaker-YYYYMMDD.dump $(docker-compose ps -q db):/tmp/restore.dump
docker-compose exec db pg_restore -U supabase_admin -d postgres /tmp/restore.dump
docker-compose up -d
```

### Volume snapshot (faster, filesystem-level)

If your VPS provider supports volume snapshots (Hetzner, DigitalOcean, etc.) stop the stack first to avoid partial writes:

```bash
docker-compose stop db
# take snapshot in your provider's control panel
docker-compose start db
```

### JSON export (lightweight, app-level)

RubricMaker's Settings → Database tab can export all data as JSON. This is not a replacement for pg_dump but is useful for migrating between accounts or taking a quick snapshot before a risky change.

---

## Upgrade Path

RubricMaker's `docker-compose.yml` pins image versions. To upgrade:

1. Pull the new `docker-compose.yml` from the repository (or edit image tags manually).
2. Take a database backup before upgrading.
3. Apply any new migrations:
   ```bash
   docker-compose up -d --build db_migrate
   docker-compose logs db_migrate
   ```
4. Restart remaining services:
   ```bash
   docker-compose up -d --build
   ```

**Supabase component upgrades** (postgres, auth, rest, storage images) should be done one at a time. Check the [Supabase Docker changelog](https://github.com/supabase/supabase/releases) for breaking changes before bumping image tags.

---

## Resource Sizing

| Users / Students | RAM | vCPU | Disk | Notes |
|---|---|---|---|---|
| 1 teacher / up to 50 students | 1 GB | 1 | 10 GB | Minimum; no recording storage |
| 1–5 teachers / up to 500 students | 2 GB | 2 | 20 GB | Comfortable for daily use |
| 5–20 teachers / up to 5 000 students | 4 GB | 2–4 | 50 GB | Enable connection pooling (PgBouncer) |
| 20+ teachers | 8 GB | 4+ | 100 GB+ | Add PgBouncer; consider managed Supabase |

**Storage note:** Each speaking-session recording is up to 50 MB (enforced in the app). Budget ~1 GB of storage per 20 students who regularly use recordings.

**Connection pooling:** PostgreSQL defaults to 100 max connections. With more than ~15 concurrent users add PgBouncer in front of `db`. Set `pool_mode = transaction` and point `rest` at PgBouncer's port.

---

## Enabling pg_cron (Audit Log + Auto-Anonymization)

Migration `037_audit_logs.sql` calls `CREATE EXTENSION IF NOT EXISTS pg_cron` and registers cleanup jobs. pg_cron requires two things on self-hosted deployments:

1. **Add `pg_cron` to `shared_preload_libraries`** in `postgresql.conf`:
   ```
   shared_preload_libraries = 'pg_cron'
   cron.database_name = 'postgres'
   ```
   With the Docker stack this is set via the `POSTGRES_EXTRA_FLAGS` or a mounted `postgresql.conf`.

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

---

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

| Symptom | First steps |
|---|---|
| SMTP / OTP email not arriving | Check `docker-compose logs auth` for SMTP errors; verify `SMTP_HOST/PORT/USER/PASS` in `.env` |
| Cannot log in after restore | Run `docker-compose up -d db_migrate` to ensure migrations are applied; check `auth` logs |
| Storage uploads fail | Check `docker-compose logs storage`; verify S3/local storage bucket config in `.env` |
| pg_cron jobs not running | See "Enabling pg_cron" above; confirm with `SELECT * FROM cron.job` |
| High memory usage | Check `docker stats`; add connection pooling if `db` has many idle connections |
| RLS errors in app | Run `npm run db:reset` locally to reproduce; check for missing policies in latest migrations |
