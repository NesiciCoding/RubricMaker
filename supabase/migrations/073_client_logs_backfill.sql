-- Migration 073: best-effort backfill of client_logs.path for rows written
-- before migration 072 added the column (those rows have path = NULL).
--
-- The `path` column only exists from migration 072, so older rows are NULL.
-- Most cannot be reconstructed (meta holds ids/counts/durations, never the
-- URL), and the `pageview`/`metric` categories never existed before 072 —
-- those are forward-looking only. The Performance & Web Vitals dashboard
-- therefore shows data from the first deploy of the instrumented build;
-- historical usage is covered by the Application Usage & Data Health
-- dashboard, which reads the domain tables directly.
--
-- What this migration DOES recover for the rows that carry the information:
--   * any row whose meta already stored a route under meta->>'path'
--   * essay events (StudentEssayPage at /essay/:code): the route param IS
--     the teacherKey, and essay_* events log it, so path = /essay/<teacherKey>
--   * test events (StudentTestPage at /test/:code): meta holds the testId,
--     not the URL code, so path = /test (page-level only)
-- Everything else stays NULL and is simply excluded from per-page panels.
-- Idempotent: only touches rows where path IS NULL, safe to re-run.

update public.client_logs
set path = coalesce(
    nullif(meta->>'path', ''),
    case
        when name like 'essay_%' and meta->>'teacherKey' is not null then '/essay/' || meta->>'teacherKey'
        when name like 'essay_%' then '/essay'
        when name like 'test_%' then '/test'
    end
)
where path is null
  and (
      (meta is not null and meta ? 'path' and nullif(meta->>'path', '') is not null)
      or name like 'essay_%'
      or name like 'test_%'
  );
