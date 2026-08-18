# Grafana Dashboards

The standalone observability stack (`docker-compose.observability.yml`)
auto-provisions four dashboards into a **RubricMaker** folder in Grafana, on
top of the Loki and Postgres datasources described in
`README.md` → "Observability". This page explains what each panel shows and
how to extend them.

---

## 1. Web & Container Logs

**Source:** Loki (always provisioned — works in every deployment).

| Panel | Query | What it tells you |
|---|---|---|
| Error log rate | `sum(rate({job=~"webserver\|docker"} \|~ "(?i)error" [5m]))` | Lines/sec containing "error" across web server and container logs, last 5 minutes. |
| HTTP 5xx rate | `sum(rate({job="webserver"} \|~ " 5[0-9][0-9] " [5m]))` | Server-error response rate from access logs. Spikes here usually mean a backend or proxy problem, not a client bug. |
| Log volume by source | `sum by (job) (rate({job=~"webserver\|docker"}[1m]))` | Relative traffic between `webserver` (Apache/Nginx access+error logs) and `docker` (combined-stack container stdout/stderr). Useful for spotting a job that's gone silent. |
| Total log lines (1h) | `sum(count_over_time({job=~"webserver\|docker"}[1h]))` | Overall log throughput — a sudden drop to zero usually means Promtail lost its source, not that errors stopped. |
| Warning rate | `sum(rate({job=~"webserver\|docker"} \|~ "(?i)warn" [5m]))` | Same idea as the error rate panel, one severity down. |
| Recent errors & warnings | `{job=~"webserver\|docker"} \|~ "(?i)(error\|warn\|exception\|traceback)"` | Raw log lines — click through from a spike in the panels above to read what actually happened. |

If `RUBRICMAKER_LOG_DIR` doesn't point at any `*access*.log` / `*error*.log`
files (see `.env.observability.example`), the `webserver` job has nothing to
scrape and these panels stay empty — that's a Promtail config issue, not a
Grafana one. Use **Explore** with the Loki datasource to confirm log lines
are arriving before debugging the dashboard.

---

## 2. Client Diagnostics (`client_logs`)

**Source:** the "Supabase Postgres (client_logs)" datasource, provisioned
only when `SUPABASE_DB_HOST` (and the other `SUPABASE_DB_*` vars) are set in
`.env.observability`. Panels populate only while the app is built with
`VITE_STRESS_TEST_LOGGING=true` — see README → "Stress-test logging" for what
gets logged and the privacy guarantees (ids/counts/durations only, never
free-text content).

If the Postgres datasource isn't configured, every panel on this dashboard
shows a "datasource not found" error — that's expected for deployments that
don't use the stress-test logging feature.

| Panel | What it shows |
|---|---|
| Active sessions | Distinct `session_id` values seen in the selected time range — roughly "how many browser tabs were active". |
| Actions logged | Count of `category = 'action'` rows — every dispatched `AppContext` action (see `summarizeAction` in `src/context/AppContext.tsx`). |
| Sync errors | Count of `category = 'sync' AND level = 'error'` — failed pushes/hydration to Supabase. This should stay at 0; the panel turns red at 1 or more. |
| JS errors | Count of `category = 'error'` — unhandled rejections (`src/main.tsx`) and React error boundary catches (`src/components/ui/ErrorBoundary.tsx`). This should stay at 0; the panel turns red at 1 or more. |
| Essay submissions | Count of `name = 'essay_submitted'` from `StudentEssayPage`. |
| Essay submit errors | Count of `name = 'essay_submit_error'`. Compare against essay submissions to gauge the failure rate. |
| Events per minute by category | Time series of `action` / `sync` / `error` / `lifecycle` event volume — shows overall usage shape during a pilot window (e.g. a class period). |
| Sync push latency (avg ms) | Average `meta->>'ms'` for `pushOne:<entity>:<action>` sync events (`StorageSync.ts`) — rising latency over a session can indicate Supabase-side slowdowns under load. |
| Top action types | The most frequent action names in the selected range — what teachers/students are actually doing during the pilot. |
| Recent warnings & errors | Raw rows for `level IN ('warn', 'error')`, including the `meta` JSON (error messages, entity ids, durations) for debugging a specific failure. |

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
  for `client_logs` use `{"type": "postgres", "uid": "client_logs_postgres"}`.
  Both UIDs are fixed in `docker/observability/grafana-datasources.yml` so
  dashboard JSON can reference them directly.

---

## 3. Application Usage & Data Health

**Source:** the "Supabase Postgres (client_logs)" datasource (despite the
name, it reaches the whole Supabase schema). No app instrumentation required —
this dashboard reads the domain tables directly, so it works for any
deployment with a reachable database (including existing/legacy data),
regardless of `VITE_STRESS_TEST_LOGGING`.

| Panel | What it shows |
|---|---|
| Stat rows (18 panels) | Total row counts per domain: teachers, schools, classes, students, rubrics, grades, tests, test attempts, essay assignments/submissions, flashcard decks/reviews, marketplace listings, messages, question-bank items, peer reviews, grading tasks — plus distinct active teachers in the time range. |
| Daily activity — content created | Rubrics created, grades recorded (`gradedAt`/`updatedAt`), essay submissions, and test attempts per day — the shape of teacher/student work over time. |
| Signups & marketplace per day | New `profiles` and published marketplace listings per day. |
| Entity counts by domain | One table ranking every domain by row count, so a silent table (e.g. a broken sync path that stopped writing) is visible at a glance. |
| Students & grades per school | Multi-tenant breakdown — students and grades attributable to each school. |
| Most active teachers (grades) | Teachers ranked by grades recorded, with last-graded timestamp. |
| Latest activity per domain | Most recent write per domain — spot a domain whose last activity is stale. |

Many of the jsonb-document tables (`student_rubrics`, `tests`,
`student_tests`, `flashcard_*`) have no real `created_at` column, so these
panels cast the ISO timestamps inside the `data` jsonb (`data->>'gradedAt'`,
`data->>'startedAt'`, `data->>'updatedAt'`). The queries are defensive
(`IS NOT NULL` + `COALESCE` fallbacks) so rows missing a field are simply
excluded rather than erroring.

---

## 4. Performance & Web Vitals

**Source:** the "Supabase Postgres (client_logs)" datasource, reading the
`pageview` and `metric` categories from `client_logs`. Requires
`VITE_STRESS_TEST_LOGGING=true` **and** migration
`072_client_logs_observability.sql`.

| Panel | What it shows |
|---|---|
| Pageviews / Active sessions / Distinct pages | Usage volume in the selected range, from `category = 'pageview'`. |
| Avg page load / p75 LCP / p75 FID | Headline performance numbers from `meta->>'value'` of `page_load` / `lcp` / `fid`. |
| Pageviews per minute by page | Time series of traffic per route — which screens get used when. |
| Web vitals (p75, ms) | LCP / FCP / FID / page-load 75th percentile over time — watch for regressions after a deploy. |
| Slowest pages (avg page load) | Routes ranked by average `page_load` — the pages worth optimizing first. |
| Web vitals summary | Per-metric sample count, mean, p75, and max. Note `cls` is a unitless score, not ms. |
| Sessions by role | Sessions and event volume per `role`. |
| Recent pageviews | Raw pageview rows for debugging a specific session. |

---

See [Observability on a HestiaCP subdomain](OBSERVABILITY_HESTIACP.md) for
deploying this stack behind HTTPS.
