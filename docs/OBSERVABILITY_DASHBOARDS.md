# Grafana Dashboards

The standalone observability stack (`docker-compose.observability.yml`)
auto-provisions two dashboards into a **RubricMaker** folder in Grafana, on
top of the Loki and `client_logs` Postgres datasources described in
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
| Sync errors | Count of `category = 'sync' AND level = 'error'` — failed pushes/hydration to Supabase. Should be 0; red threshold at 1. |
| JS errors | Count of `category = 'error'` — unhandled rejections (`src/main.tsx`) and React error boundary catches (`src/components/ui/ErrorBoundary.tsx`). Should be 0; red threshold at 1. |
| Essay submissions | Count of `name = 'essay_submitted'` from `StudentEssayPage`. |
| Essay submit errors | Count of `name = 'essay_submit_error'`. Compare against essay submissions to gauge the failure rate. |
| Events per minute by category | Time series of `action` / `sync` / `error` / `lifecycle` event volume — shows overall usage shape during a pilot window (e.g. a class period). |
| Sync push latency (avg ms) | Average `meta->>'ms'` for `pushOne:<entity>:<action>` sync events (`StorageSync.ts`) — rising latency over a session can indicate Supabase-side slowdowns under load. |
| Top action types | The most frequent action names in the selected range — what teachers/students are actually doing during the pilot. |
| Recent warnings & errors | Raw rows for `level IN ('warn', 'error')`, including the `meta` JSON (error messages, entity ids, durations) for debugging a specific failure. |

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

See [Observability on a HestiaCP subdomain](OBSERVABILITY_HESTIACP.md) for
deploying this stack behind HTTPS.
