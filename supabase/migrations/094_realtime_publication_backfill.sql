-- Migration 094: Publish the tables StorageSync already subscribes to.
--
-- StorageSync's REALTIME_TABLES list grew as features landed, but only 047/052/067/075
-- ever added tables to the supabase_realtime publication. Six subscribed tables were
-- never published: messages, standard_mastery_targets, news_flashes, news_flash_reads,
-- question_bank_items and document_comments. A table outside the publication delivers
-- no postgres_changes events at all (and Realtime rejects the subscription), so those
-- features only ever refreshed on reconnect or next login — and because every table
-- shares one channel, a rejected binding is what #1005's folder changes would have run
-- into as well.
--
-- Same guarded pattern as 047/052/067/075 — ALTER PUBLICATION ... ADD TABLE has no
-- IF NOT EXISTS form and errors on a table that's already a member.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'messages', 'standard_mastery_targets', 'news_flashes', 'news_flash_reads',
    'question_bank_items', 'document_comments'
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
