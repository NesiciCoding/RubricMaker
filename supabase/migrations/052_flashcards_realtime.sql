-- Migration 052: Add the flashcard tables to the supabase_realtime publication.
--
-- 051_flashcards.sql added flashcard_decks/flashcard_assignments/flashcard_reviews
-- to StorageSync's client-side REALTIME_TABLES list, but never published them
-- (047_enable_realtime.sql only covered the tables that existed at the time) —
-- so every session's realtime channel was subscribing to postgres_changes for
-- three tables Postgres doesn't recognize as part of the publication. Same
-- guarded pattern as 047: ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS
-- form and errors on a table that's already a member.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'flashcard_decks', 'flashcard_assignments', 'flashcard_reviews'
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
