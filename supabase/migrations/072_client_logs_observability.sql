-- Migration 072: observability enrichment for client_logs.
-- Adds a `path` column (the hash-router route, e.g. /rubrics or /essay/<code>)
-- so dashboards can break activity and performance down per page, and a
-- composite index that keeps category+time and pageview+time queries cheap.
-- Only written when the client build sets VITE_STRESS_TEST_LOGGING=true.

alter table if exists public.client_logs
  add column if not exists path text;

create index if not exists client_logs_category_created_idx
  on public.client_logs (category, created_at);

create index if not exists client_logs_path_created_idx
  on public.client_logs (path, created_at);
