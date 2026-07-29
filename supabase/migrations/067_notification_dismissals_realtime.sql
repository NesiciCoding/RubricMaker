-- Migration 067: Add notification_dismissals to the supabase_realtime publication.
--
-- Same gap 052_flashcards_realtime.sql fixed for the flashcard tables: 066 added
-- notification_dismissals to StorageSync's client-side REALTIME_TABLES list, but
-- never published it, so the realtime channel would subscribe to postgres_changes
-- for a table Postgres doesn't recognize as part of the publication. Same guarded
-- pattern as 047/052 — ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form
-- and errors on a table that's already a member.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notification_dismissals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_dismissals;
  END IF;
END $$;
