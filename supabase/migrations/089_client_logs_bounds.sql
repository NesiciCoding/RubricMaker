-- #638: client_logs grew without bound — nothing purged it (unlike audit_logs, 038) and any
-- signed-in client could insert rows of any size.
--
-- 1. Oversized rows are rejected. The limits are in bytes and set at 4x the character limits the
--    client logger clamps to (src/services/logging/clientLogger.ts), so clamped multibyte text
--    always fits. NOT VALID: existing rows are left alone; only new writes are checked.
-- 2. Rows older than 30 days are deleted nightly by pg_cron (enabled in 038). The diagnostics are
--    for reconstructing a pilot class, not for long-term storage.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_logs_bounded') THEN
    ALTER TABLE public.client_logs
      ADD CONSTRAINT client_logs_bounded CHECK (
        octet_length(session_id) <= 128
        AND octet_length(category) <= 64
        AND octet_length(name) <= 512
        AND octet_length(level) <= 32
        AND (role IS NULL OR octet_length(role) <= 128)
        AND (school_id IS NULL OR octet_length(school_id) <= 256)
        AND (path IS NULL OR octet_length(path) <= 2048)
        AND (app_version IS NULL OR octet_length(app_version) <= 128)
        AND (meta IS NULL OR pg_column_size(meta) <= 16384)
      ) NOT VALID;
  END IF;
END;
$$;

SELECT cron.schedule(
  'client-logs-cleanup',
  '35 3 * * *',
  $$ DELETE FROM public.client_logs WHERE created_at < now() - interval '30 days' $$
);
