-- Migration 057: Curated news/resource flashes (roadmap 16.4).
--
-- Two tables following the jsonb-document pattern (033_tests_tables.sql), mirroring
-- the flashcards migration (051) exactly:
--
--   news_flashes       teacher-authored flashes
--   news_flash_reads   one row per (flash, student): read receipt, id = '<flashId>:<studentId>'
--
-- Students read via the portal with their own authenticated session, mirroring the
-- flashcard_reviews (051) read/trigger-resolved-owner write pattern. No email/digest
-- mechanism — the portal timeline + unread badge is the entire v1 delivery surface.

-- ── 1. Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.news_flashes (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS news_flashes_owner_idx ON public.news_flashes(owner_id);

CREATE TABLE IF NOT EXISTS public.news_flash_reads (
  id         TEXT  PRIMARY KEY,
  -- Nullable on purpose: a portal student's insert can't supply a trustworthy
  -- owner_id; the BEFORE INSERT trigger below resolves it from the roster row.
  owner_id   UUID  REFERENCES public.profiles(id) ON DELETE CASCADE,
  flash_id   TEXT  NOT NULL,
  student_id TEXT  NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS news_flash_reads_owner_idx ON public.news_flash_reads(owner_id);
CREATE INDEX IF NOT EXISTS news_flash_reads_flash_student_idx ON public.news_flash_reads(flash_id, student_id);

ALTER TABLE public.news_flashes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_flash_reads ENABLE ROW LEVEL SECURITY;

-- ── 2. Teacher (owner) policies ─────────────────────────────────────────────────

CREATE POLICY "news_flashes_owner_all"
  ON public.news_flashes FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "news_flash_reads_owner_all"
  ON public.news_flash_reads FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 3. Portal student: read flashes published by their own teacher ──────────────
-- Mirrors get_my_flashcard_deck_ids() (051), but news flashes aren't scoped to
-- explicit per-student assignments — every flash from a student's own teacher(s) is
-- visible, matched via get_my_student_ids() -> students.owner_id the same way
-- get_my_flashcard_assignment_ids() ultimately resolves ownership.

CREATE OR REPLACE FUNCTION public.get_my_news_flash_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nf.id
  FROM   public.news_flashes nf
  WHERE  nf.owner_id IN (
    SELECT DISTINCT s.owner_id FROM public.students s WHERE s.id IN (SELECT get_my_student_ids())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_news_flash_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_news_flash_ids() TO authenticated;

CREATE POLICY "news_flashes_student_select"
  ON public.news_flashes FOR SELECT
  USING (id IN (SELECT get_my_news_flash_ids()));

-- ── 4. Portal student: own read receipts (read + write) ─────────────────────────
-- owner_id is resolved server-side from the roster row, same rationale as
-- set_flashcard_review_owner (051).

CREATE OR REPLACE FUNCTION public.set_news_flash_read_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER news_flash_reads_set_owner
  BEFORE INSERT ON public.news_flash_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_news_flash_read_owner();

CREATE POLICY "news_flash_reads_student_select"
  ON public.news_flash_reads FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- Scoped to flashes actually visible to the student, so a student can't create
-- read receipts for arbitrary flash ids.
CREATE POLICY "news_flash_reads_student_insert"
  ON public.news_flash_reads FOR INSERT
  WITH CHECK (
    student_id IN (SELECT get_my_student_ids())
    AND flash_id IN (SELECT get_my_news_flash_ids())
  );

-- ── 5. Include the new tables in the nightly owner backup ──────────────────────
-- Full replacement of export_owner_backup (056 was the last to touch it, via
-- 055_test_assignments_mode.sql's ancestor 048) — same body plus the two
-- news_flash tables appended at the end.

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
