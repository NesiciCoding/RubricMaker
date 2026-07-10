-- Migration 058: Rubric version history as its own table (roadmap 18.4).
--
-- Every rubric save used to embed a capped-at-20 array of full-rubric snapshots
-- directly in rubrics.data (Rubric.versions), so each save/hydrate carried ~20x
-- the rubric's real payload. rubric_versions moves that history into its own
-- append-only, jsonb-document table (033_tests_tables.sql pattern), fetched only
-- when the version-history UI opens rather than on every hydrate.
--
-- Owner-only: no student-facing use case, so (unlike flashcards/news flashes)
-- there's no portal read policy or trigger-resolved owner_id.

-- ── 1. Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rubric_versions (
  id         TEXT  PRIMARY KEY,
  owner_id   UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rubric_id  TEXT  NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS rubric_versions_owner_idx ON public.rubric_versions(owner_id);
CREATE INDEX IF NOT EXISTS rubric_versions_rubric_idx ON public.rubric_versions(rubric_id);

ALTER TABLE public.rubric_versions ENABLE ROW LEVEL SECURITY;

-- ── 2. Owner policies ─────────────────────────────────────────────────────────
-- Append-only in practice (the app never updates or deletes a version row
-- directly — cleanup happens via the rubric_id FK's ON DELETE CASCADE), but
-- FOR ALL matches every other owner-scoped table in this schema rather than
-- inventing a narrower grant for one table.

CREATE POLICY "rubric_versions_owner_all"
  ON public.rubric_versions FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 3. Include the new table in the nightly owner backup ───────────────────────
-- Full replacement of export_owner_backup (057 was the last to touch it) — same
-- body plus rubric_versions appended at the end.

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
  result := result || jsonb_build_object('rubric_versions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubric_versions t WHERE t.owner_id = target_owner));
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
  -- essay_assignments/essay_submissions have no localStorage mirror at all (unlike the
  -- tables above, which are also cached client-side) — this is their only backup copy.
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
  RETURN result;
END;
$$;
