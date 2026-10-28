# Grafana Dashboards

The standalone observability stack (`docker-compose.observability.yml`)
auto-provisions six dashboards into a **RubricMaker** folder in Grafana, on
top of the Loki, Prometheus and Postgres datasources described in
`README.md` → "Observability". This page explains what each panel shows and
how to extend them.

---

## 1. Web & Container Logs

**Source:** Loki (always provisioned — works in every deployment).

| Panel                    | Query                                                                                              | What it tells you                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error log rate           | `sum(rate({job=~"webserver\|docker"} \|~ "(?i)error" [5m]))`                                       | Lines/sec containing "error" across web server and container logs, last 5 minutes.                                                                                         |
| HTTP 5xx rate            | ``sum(rate({job="webserver"} \|~ `HTTP/[0-9.]+" 5[0-9][0-9] \|HTTP/[0-9.]+ "5[0-9][0-9]"` [5m]))`` | Server-error response rate from access logs. Spikes here usually mean a backend or proxy problem, not a client bug.                                                        |
| Log volume by source     | `sum by (job) (rate({job=~"webserver\|docker"}[1m]))`                                              | Relative traffic between `webserver` (Apache/Nginx access+error logs) and `docker` (combined-stack container stdout/stderr). Useful for spotting a job that's gone silent. |
| Total log lines (1h)     | `sum(count_over_time({job=~"webserver\|docker"}[1h]))`                                             | Overall log throughput — a sudden drop to zero usually means Alloy lost its source, not that errors stopped.                                                               |
| Warning rate             | `sum(rate({job=~"webserver\|docker"} \|~ "(?i)warn" [5m]))`                                        | Same idea as the error rate panel, one severity down.                                                                                                                      |
| Recent errors & warnings | `{job=~"webserver\|docker"} \|~ "(?i)(error\|warn\|exception\|traceback)"`                         | Raw log lines — click through from a spike in the panels above to read what actually happened.                                                                             |

Alloy reads `*access*.log` / `*error*.log` files under `RUBRICMAKER_LOG_DIR`,
plus HestiaCP's `<domain>.log` access logs in any `logs/` or `domains/` dir
below it. If there are none (see `.env.observability.example`), the
`webserver` job has nothing to scrape and these panels stay empty — that's an
Alloy config issue, not a Grafana one. The `docker` job only covers the
compose projects in `ALLOY_DOCKER_PROJECTS` (default `rubricmaker`, this
repo's combined stack); add the official Supabase stack's project name to see
its containers. Use **Explore** with the Loki datasource to confirm log lines
are arriving before debugging the dashboard.

---

## 2. Client Diagnostics (`client_logs`)

**Source:** the "Supabase Postgres (client_logs)" datasource, always listed by
Grafana. Set `SUPABASE_DB_HOST` (and the other `SUPABASE_DB_*` vars) in
`.env.observability` so its health check can pass. Panels populate only while
the app is built with `VITE_STRESS_TEST_LOGGING=true` — see README →
"Stress-test logging" for what gets logged and the privacy guarantees
(ids/counts/durations only, never free-text content). `client_logs` has
row-level security; migration `092_monitoring_dashboard_reads.sql` adds the
read policy for `pg_monitor`, so the role in `SUPABASE_DB_USER` needs
`IN ROLE pg_monitor` (a `GRANT SELECT` alone still returns no rows).

If those variables are unset the datasource stays listed but its health check
fails, so these panels cannot query `client_logs` — expected for deployments
that don't use the stress-test logging feature. The Loki dashboards on this
stack are unaffected.

| Panel                         | What it shows                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active sessions               | Distinct `session_id` values seen in the selected time range — roughly "how many browser tabs were active".                                                                                              |
| Actions logged                | Count of `category = 'action'` rows — every dispatched `AppContext` action (see `summarizeAction` in `src/context/AppContext.tsx`).                                                                      |
| Sync errors                   | Count of `category = 'sync' AND level = 'error'` — failed pushes/hydration to Supabase. This should stay at 0; the panel turns red at 1 or more.                                                         |
| JS errors                     | Count of `category = 'error'` — unhandled rejections (`src/main.tsx`) and React error boundary catches (`src/components/ui/ErrorBoundary.tsx`). This should stay at 0; the panel turns red at 1 or more. |
| Essay submissions             | Count of `name = 'essay_submitted'` from `StudentEssayPage`.                                                                                                                                             |
| Essay submit errors           | Count of `name = 'essay_submit_error'`. Compare against essay submissions to gauge the failure rate.                                                                                                     |
| Events per minute by category | Time series of `action` / `sync` / `error` / `lifecycle` event volume — shows overall usage shape during a pilot window (e.g. a class period).                                                           |
| Sync push latency (avg ms)    | Average `meta->>'ms'` for `pushOne:<entity>:<action>` sync events (`StorageSync.ts`) — rising latency over a session can indicate Supabase-side slowdowns under load.                                    |
| Top action types              | The most frequent action names in the selected range — what teachers/students are actually doing during the pilot.                                                                                       |
| Recent warnings & errors      | Raw rows for `level IN ('warn', 'error')`, including the `meta` JSON (error messages, entity ids, durations) for debugging a specific failure.                                                           |

Since migration `072_client_logs_observability.sql`, every row also carries a
`path` column (the hash-router route the event happened on), and two new
categories are emitted alongside the original `action`/`sync`/`error`/
`lifecycle`:

- `pageview` — one row per in-app route change (`logPageView`, fired by the
  `PageViewLogger` component on every route).
- `metric` — numeric measurements (`logMetric`): `page_load` (Navigation
  Timing), and the Web Vitals `lcp` / `fcp` / `fid` (ms) and `cls` (unitless
  score), all recorded in `meta->>'value'`.

These power the **Performance & Web Vitals** dashboard below.

### Historical data

Migration `073_client_logs_backfill.sql` best-effort backfills `path` for rows
written before migration 072 (when the column didn't exist yet): it recovers
the route from `meta->>'path'` where present, maps `essay_*` events to
`/essay/<teacherKey>` (the `:code` route param is the teacherKey), and maps
`test_*` events to `/test` (their `meta` holds the testId, not the URL code).
The `pageview`/`metric` categories themselves can't be reconstructed — they
were never captured before 072 — so the **Performance & Web Vitals** dashboard
is forward-looking (data from the first deploy of the instrumented build),
while the **Application Usage & Data Health** dashboard covers history via the
domain tables.

### Reading `meta`

`meta` is a JSON column with different shapes per event:

- `sync` events: `{ "id": "...", "ms": 123 }` (success) or `{ "id": "...", "error": "..." }` (failure).
- `error` events: `{ "message": "..." }` or similar — never includes essay/comment/grade text.
- `essay_submitted` / `essay_submit_error`: `{ "teacherKey": "...", "wordCount": N }`.

In the "Recent warnings & errors" table, expand a row to inspect `meta` for
the specific entity id or error string.

---

## Customizing dashboards

The dashboards are provisioned as files
(`docker/observability/dashboards/*.json`, registered via
`docker/observability/grafana-dashboards-provider.yml`), not created through
the UI, so they survive a `docker compose down -v`.

- **Quick exploration**: edit panels in the Grafana UI freely — changes are
  kept (in `grafana-data`) but won't be reflected back into the JSON files.
- **Permanent changes**: edit the JSON directly, or make changes in the UI
  and use **Dashboard settings → JSON Model** to copy the updated panel
  definitions back into the corresponding file under
  `docker/observability/dashboards/`. Grafana reloads provisioned dashboards
  every 30 seconds (`updateIntervalSeconds`), so no restart is needed.
- **New panels against `client_logs`**: use `$__timeFilter(created_at)` and
  `$__timeGroup(created_at, '<interval>')` in raw SQL so the panel respects
  the dashboard's time range and zoom level (see existing panels for
  examples).
- **New panels against Loki**: reference datasource `{"type": "loki", "uid": "loki"}`;
  for metrics use `{"type": "prometheus", "uid": "prometheus"}`; for
  `client_logs` use `{"type": "postgres", "uid": "client_logs_postgres"}`.
  All three UIDs are fixed in `docker/observability/grafana-datasources.yml` so
  dashboard JSON can reference them directly.

---

## 3. Application Usage & Data Health

**Source:** the "Supabase Postgres (client_logs)" datasource, through the
`monitoring.app_*` functions (migration `092_monitoring_dashboard_reads.sql`).
No app instrumentation required, so it works for any deployment with a
reachable database (including existing/legacy data), regardless of
`VITE_STRESS_TEST_LOGGING`.

The app's tables have row-level security keyed on the signed-in user, so a
plain query from Grafana's database role sees no rows. The functions run as
their owner and return only what the panels show: counts, per-day counts,
latest timestamps, per-school totals and the top graders' display names (or a
masked email initial). They live in the `monitoring` schema, which the REST
API does not expose, and only `pg_monitor` members may call them, so the role
in `SUPABASE_DB_USER` needs `IN ROLE pg_monitor` and nothing else. New panels
need a new function in a migration; don't query the tables directly or give
the role `BYPASSRLS`.

| Panel                            | What it shows                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stat rows (18 panels)            | Total row counts per domain: teachers, schools, classes, students, rubrics, grades, tests, test attempts, essay assignments/submissions, flashcard decks/reviews, marketplace listings, messages, question-bank items, peer reviews, grading tasks — plus distinct active teachers in the time range. |
| Daily activity — content created | Rubrics created, grades recorded (`gradedAt`/`updatedAt`), essay submissions, and test attempts per day — the shape of teacher/student work over time.                                                                                                                                                |
| Signups & marketplace per day    | New `profiles` and published marketplace listings per day.                                                                                                                                                                                                                                            |
| Entity counts by domain          | One table ranking every domain by row count, so a silent table (e.g. a broken sync path that stopped writing) is visible at a glance.                                                                                                                                                                 |
| Students & grades per school     | Multi-tenant breakdown — students and grades attributable to each school.                                                                                                                                                                                                                             |
| Most active teachers (grades)    | Teachers ranked by grades recorded, with last-graded timestamp.                                                                                                                                                                                                                                       |
| Latest activity per domain       | Most recent write per domain — spot a domain whose last activity is stale.                                                                                                                                                                                                                            |

Many of the jsonb-document tables (`student_rubrics`, `tests`,
`student_tests`, `flashcard_*`) have no real `created_at` column, so the
functions cast the ISO timestamps inside the `data` jsonb (`data->>'gradedAt'`,
`data->>'startedAt'`, `data->>'updatedAt'`). The queries are defensive
(`IS NOT NULL` + `COALESCE` fallbacks) so rows missing a field are simply
excluded rather than erroring.

---

## 4. Performance & Web Vitals

**Source:** the "Supabase Postgres (client_logs)" datasource, reading the
`pageview` and `metric` categories from `client_logs`. Requires
`VITE_STRESS_TEST_LOGGING=true` **and** migration
`072_client_logs_observability.sql`.

| Panel                                        | What it shows                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pageviews / Active sessions / Distinct pages | Usage volume in the selected range, from `category = 'pageview'`.                             |
| Avg page load / p75 LCP / p75 FID            | Headline performance numbers from `meta->>'value'` of `page_load` / `lcp` / `fid`.            |
| Pageviews per minute by page                 | Time series of traffic per route — which screens get used when.                               |
| Web vitals (p75, ms)                         | LCP / FCP / FID / page-load 75th percentile over time — watch for regressions after a deploy. |
| Slowest pages (avg page load)                | Routes ranked by average `page_load` — the pages worth optimizing first.                      |
| Web vitals summary                           | Per-metric sample count, mean, p75, and max. Note `cls` is a unitless score, not ms.          |
| Sessions by role                             | Sessions and event volume per `role`.                                                         |
| Recent pageviews                             | Raw pageview rows for debugging a specific session.                                           |

---

## 5. Host & Containers

**Source:** Prometheus. Alloy's built-in node_exporter reads the host's
`/proc`, `/sys` and filesystems (mounted read-only), and its built-in cAdvisor
reads every Docker container on the host — including the app and Postgres
when they run in another Compose project.

| Panel                               | What it shows                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fullest disk (% used)               | The highest used share across real filesystems. Attachments, speaking recordings (up to 50 MB each), backups and Loki/Prometheus data all grow on the same disk as Postgres. |
| Days until the fullest disk is full | Free space divided by the growth of the last 6 hours: "the disk is 92% full and will stop Postgres in two days" in one number.                                               |
| Memory used / CPU used / Load       | Headline host pressure. Load per core above 1 means work is queuing.                                                                                                         |
| CPU steal                           | CPU time the hypervisor gave to other VMs. On a VPS with shared vCores, sustained steal means busy neighbours, not an overloaded server.                                     |
| Disk used / free by mountpoint      | Per-filesystem trend, to see which one is filling.                                                                                                                           |
| CPU by mode, Memory, Network        | Host time series.                                                                                                                                                            |
| CPU / Memory by container           | Which container is using the host: Postgres, the app, Loki, Grafana…                                                                                                         |
| Scrape targets (1 = up)             | Every target Alloy collects. A `0` means that part of the stack stopped reporting.                                                                                           |

## 6. Postgres

**Source:** Prometheus, from `postgres-exporter`, which connects with the same
`SUPABASE_DB_*` settings as the `client_logs` datasource (see
`.env.observability.example`). Until those are set, **Postgres reachable**
shows DOWN and the other panels stay empty.

| Panel                     | What it shows                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connections used          | Open connections as a share of `max_connections` (100 on the bundled image). New logins fail at 100%; see SELF_HOSTING_OPS.md → Resource Sizing for the ~15 users note. |
| Cache hit ratio           | Share of reads served from memory. Persistently below ~95% on a busy database means RAM or `shared_buffers` is too small.                                               |
| Database size             | Size of the `postgres` database.                                                                                                                                        |
| Longest open transaction  | A transaction open for minutes holds locks and blocks vacuum.                                                                                                           |
| Connections by state      | `active`, `idle`, `idle in transaction`… against `max_connections`.                                                                                                     |
| Transactions per second   | Commits and rollbacks.                                                                                                                                                  |
| Locks by mode / Deadlocks | Lock contention; any deadlock is worth a look in the Postgres logs.                                                                                                     |

## Metrics retention and sizing

Prometheus keeps metrics for `PROMETHEUS_RETENTION_TIME` (default `30d`) or
until they reach `PROMETHEUS_RETENTION_SIZE` (default `2GB`), whichever comes
first. The stack collects about 9,000 series at a 30-second interval, roughly
40 MB a day, so the 30 days fit comfortably inside the size cap.

Measured on a test host with the stack idle (memory as reported by
`docker stats`):

| Service           | Memory   |
| ----------------- | -------- |
| Alloy             | ~130 MiB |
| Grafana           | ~220 MiB |
| Loki              | ~65 MiB  |
| Prometheus        | ~55 MiB  |
| postgres-exporter | ~8 MiB   |

`docker stats` shows Alloy at ~400 MiB because it also counts ~185 MiB of
file-backed pages (mostly Alloy's own large executable), which the kernel
drops and re-reads under memory pressure. Its own memory (`RssAnon`) is the
~130 MiB above. In total the stack needs roughly 0.5 GiB next to Postgres
and the app.

---

## Alerting

Dashboards only help when someone is looking. Grafana evaluates the rules in
`docker/observability/alerting/alert-rules.yml` every minute and sends firing
alerts to the `rubricmaker-oncall` contact point (folder **RubricMaker alerts**
under **Alerting → Alert rules**).

| Rule                                  | Fires when                                                               | Severity |
| ------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Disk almost full                      | A disk is over 90% full for 10 minutes                                   | critical |
| Disk full within 2 days               | At the growth rate of the last 6 hours, a disk is full within 2 days     | warning  |
| Monitoring target down                | Alloy cannot scrape a target (Loki, Grafana, Prometheus, exporters)      | warning  |
| Host metrics stopped arriving         | No host metrics for 10 minutes (Alloy or Prometheus is down)             | critical |
| CPU steal high                        | Over 10% of CPU time is stolen by the hypervisor for 15 minutes          | warning  |
| Postgres unreachable                  | postgres-exporter cannot connect (only once `SUPABASE_DB_HOST` is set)   | critical |
| Postgres connections nearly exhausted | Over 80% of `max_connections` in use for 5 minutes                       | warning  |
| Scheduled database job failed         | A `pg_cron` run failed in the last 24 hours                              | warning  |
| Scheduled HTTP call failed            | A `pg_net` call made by a scheduled job (e.g. the teacher digest) failed | warning  |
| Burst of HTTP 5xx errors              | More than 25 server errors in the web server logs within 5 minutes       | warning  |

The thresholds are plain numbers in the rule queries; edit the file and
restart Grafana to tune them.

### Receiving alerts

Set these in `.env.observability`, then `up -d` again:

- `ALERT_EMAIL` — who gets the alerts (comma-separate several addresses).
- `ALERT_SMTP_ENABLED=true` with `ALERT_SMTP_HOST` (`host:port`),
  `ALERT_SMTP_USER`, `ALERT_SMTP_PASSWORD` and `ALERT_SMTP_FROM`. The same
  provider as the app's login emails works.

Until then alerts still appear in Grafana but go nowhere. `ALERT_EMAIL`
defaults to an undeliverable `alerts@rubricmaker.invalid` placeholder, because
Grafana will not start with an empty address. Check delivery with **Alerting
→ Contact points → rubricmaker-oncall → Test**.

For a chat channel, add a second receiver to
`docker/observability/alerting/contact-points.yml`, for example Microsoft
Teams (a Workflows webhook URL), Slack, Discord or Telegram:

```yaml
- uid: rubricmaker-oncall-teams
  type: teams # or slack / discord (settings: url), telegram (settings: bottoken, chatid)
  settings:
      url: '${ALERT_TEAMS_WEBHOOK_URL}'
```

and pass `ALERT_TEAMS_WEBHOOK_URL` to the `grafana` service in
`docker-compose.observability.yml`. Leave it out entirely when unused: like
the email address, an empty URL stops Grafana from starting.

### Database job alerts

The two scheduled-job rules call `monitoring.failed_jobs()` (migration
`091_monitoring_job_failures.sql`) through the `client_logs` datasource. A
plain query would not work: pg_cron's row-level security shows a role only
its own jobs, and the jobs belong to the migrator. The function returns two
counts and nothing else, lives in a schema the REST API does not expose, and
may only be called by members of `pg_monitor`, so the role in
`SUPABASE_DB_USER` needs `IN ROLE pg_monitor` (see `.env.observability.example`).
Without it the rules stay normal.

### Heartbeats for scheduled jobs

The rules above live on the same server they watch, and a job that never
runs produces no error to alert on. Each scheduled job therefore pings a
dead-man's-switch URL after every **clean** run; create one check per job in
an external service (Healthchecks.io, Better Stack, a self-hosted Uptime Kuma
push monitor) with its expected schedule, and a missed ping alerts you:

| Job                                             | Where to set the URL                           |
| ----------------------------------------------- | ---------------------------------------------- |
| `scripts/scheduled-backup.sh` (off-site backup) | `BACKUP_HEARTBEAT_URL` in `.env.backup`        |
| `scripts/restore-drill.sh` (monthly)            | `RESTORE_DRILL_HEARTBEAT_URL` in `.env.backup` |
| `scripts/delete-old-attachments.sh`             | `CLEANUP_HEARTBEAT_URL` in `.env`              |
| `nightly-backup` edge function                  | `NIGHTLY_BACKUP_HEARTBEAT_URL` function secret |
| `delete-old-attachments` edge function          | `CLEANUP_HEARTBEAT_URL` function secret        |
| `scheduled-digest` edge function                | `DIGEST_HEARTBEAT_URL` function secret         |

Function secrets are set with `supabase secrets set NAME=value` (Cloud), or in
the official self-hosted stack's functions environment. A failed ping never
fails the job itself.

On the official self-hosted stack, edge functions are not deployed from this
repository automatically: the three functions only ping once their updated
`index.ts` **and** `supabase/functions/_shared/heartbeat.ts` are copied into
that stack's `volumes/functions/` (keeping the `_shared/` folder next to the
function folders). Until then, set up the heartbeat checks for the scripts
only, or a missing ping will alert from day one.

### Off-box uptime checks

Grafana runs on the server it monitors, so if that server goes down, so do the
alerts. Add an external uptime monitor (UptimeRobot, Better Stack or
Healthchecks.io all have free tiers) that probes from outside your network:

- `https://<your site>/` — the app itself.
- `https://<your site>/auth/v1/health` — Supabase Auth behind the same proxy
  (returns JSON when the backend is up).

Point it at the same email or chat channel. Once real schools depend on the
service, the same providers can publish a simple public status page from these
checks.

---

See [Observability on a HestiaCP subdomain](OBSERVABILITY_HESTIACP.md) for
deploying this stack behind HTTPS.
