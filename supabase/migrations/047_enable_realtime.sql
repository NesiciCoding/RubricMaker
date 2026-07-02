-- Adds every user-data table to the supabase_realtime publication so connected
-- clients get notified of changes made on other devices/sessions, instead of only
-- picking them up on next login or network reconnect (see StorageSync.startRealtimeSync).
-- RLS still applies to postgres_changes payloads, so this does not widen access —
-- a client only receives change events for rows it could already SELECT.
--
-- Unlike CREATE TABLE/INDEX, `ALTER PUBLICATION ... ADD TABLE` has no IF NOT EXISTS
-- form and errors (not a no-op) if a table is already a member — so a retry or a
-- table added manually beforehand would abort this migration. Guard each one.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rubrics', 'classes', 'students', 'student_rubrics', 'attachments',
    'grade_scales', 'comment_snippets', 'comment_bank', 'export_templates',
    'favorite_standards', 'self_assessments', 'speaking_sessions', 'analysis_results',
    'tests', 'student_tests', 'essay_templates', 'grading_tasks',
    'essay_batch_assignments', 'essay_offline_submissions', 'user_templates', 'user_settings'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
