-- Migration 075: Comparative-grading matchup history.
--
-- Comparative Grading (ComparativeGrading.tsx) lets a teacher pair students up and
-- grade them head-to-head, capped at N matchups per student (Rubric.comparativeMatchupLimit)
-- so the pairing loop can't run forever. Until now that cap was enforced against an
-- in-memory Set that reset on every reload/session — this table makes each completed
-- comparison a durable, append-only row so the per-student/per-rubric count survives
-- reloads and follows the teacher across devices.
--
-- A row is written once (when a matchup is saved) and never updated — it's a log, not
-- a mutable counter — so there's no last-write-wins conflict to resolve on sync; two
-- devices recording different comparisons offline just produce a union of rows once
-- both reconnect.
--
-- Same jsonb-doc shape as notification_dismissals (066)/document_comments (062): one
-- table, owner-only RLS, no columns beyond id/owner_id needed since the client always
-- reads its own whole owner-scoped set (there's no server-side query by rubric/student).

CREATE TABLE IF NOT EXISTS public.comparative_matchups (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS comparative_matchups_owner_idx ON public.comparative_matchups(owner_id);

ALTER TABLE public.comparative_matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comparative_matchups_owner_all" ON public.comparative_matchups;
CREATE POLICY "comparative_matchups_owner_all"
  ON public.comparative_matchups FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── Realtime — same guarded pattern as 047/052/067 (ADD TABLE has no IF NOT EXISTS) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comparative_matchups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comparative_matchups;
  END IF;
END $$;

-- ── Include comparative_matchups in the nightly owner backup ────────────────────
-- Full replacement of export_owner_backup (066 was the last to touch it), same body
-- plus the new table appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flashes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flashes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flash_reads',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flash_reads t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('question_bank_items',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.question_bank_items t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('document_comments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.document_comments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('placement_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.placement_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('notification_dismissals',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.notification_dismissals t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comparative_matchups',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comparative_matchups t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;
