-- Migration 051: Anki-like vocabulary flashcards (roadmap 14.4).
--
-- Three tables following the jsonb-document pattern (033_tests_tables.sql): real
-- columns only for identity/ownership/filtering, everything else in `data`.
--
--   flashcard_decks        teacher-authored decks (cards embedded in data, like Test.questions)
--   flashcard_assignments  one row per (deck, student), id = '<deckId>:<studentId>'
--   flashcard_reviews      one row per (deck, student): the student's FSRS spaced-repetition
--                          state for that deck, id = '<deckId>:<studentId>'
--
-- Students study via the portal with their own authenticated session, mirroring the
-- test_assignments (044) read pattern and the messages (050) trigger-resolved-owner
-- write pattern.

-- ── 1. Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flashcard_decks (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS flashcard_decks_owner_idx ON public.flashcard_decks(owner_id);

CREATE TABLE IF NOT EXISTS public.flashcard_assignments (
  id         TEXT  PRIMARY KEY,
  owner_id   UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id    TEXT  NOT NULL,
  student_id TEXT  NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS flashcard_assignments_owner_idx ON public.flashcard_assignments(owner_id);
CREATE INDEX IF NOT EXISTS flashcard_assignments_deck_student_idx ON public.flashcard_assignments(deck_id, student_id);

CREATE TABLE IF NOT EXISTS public.flashcard_reviews (
  id         TEXT  PRIMARY KEY,
  -- Nullable on purpose: a portal student's insert can't supply a trustworthy
  -- owner_id; the BEFORE INSERT trigger below resolves it from the roster row.
  owner_id   UUID  REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id    TEXT  NOT NULL,
  student_id TEXT  NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS flashcard_reviews_owner_idx ON public.flashcard_reviews(owner_id);
CREATE INDEX IF NOT EXISTS flashcard_reviews_deck_student_idx ON public.flashcard_reviews(deck_id, student_id);

ALTER TABLE public.flashcard_decks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews     ENABLE ROW LEVEL SECURITY;

-- ── 2. Teacher (owner) policies ─────────────────────────────────────────────────

CREATE POLICY "flashcard_decks_owner_all"
  ON public.flashcard_decks FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "flashcard_assignments_owner_all"
  ON public.flashcard_assignments FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "flashcard_reviews_owner_all"
  ON public.flashcard_reviews FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 3. Portal student: read own assignments, read assigned decks ────────────────
-- Mirrors get_my_test_assignment_ids() (044).

CREATE OR REPLACE FUNCTION public.get_my_flashcard_assignment_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fa.id
  FROM   public.flashcard_assignments fa
  WHERE  fa.student_id IN (SELECT get_my_student_ids())
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_flashcard_assignment_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_flashcard_assignment_ids() TO authenticated;

CREATE POLICY "flashcard_assignments_student_select"
  ON public.flashcard_assignments FOR SELECT
  USING (id IN (SELECT get_my_flashcard_assignment_ids()));

CREATE OR REPLACE FUNCTION public.get_my_flashcard_deck_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT fa.deck_id
  FROM   public.flashcard_assignments fa
  WHERE  fa.student_id IN (SELECT get_my_student_ids())
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_flashcard_deck_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_flashcard_deck_ids() TO authenticated;

CREATE POLICY "flashcard_decks_student_select"
  ON public.flashcard_decks FOR SELECT
  USING (id IN (SELECT get_my_flashcard_deck_ids()));

-- ── 4. Portal student: own review state (read + write) ──────────────────────────
-- owner_id is resolved server-side from the roster row, same rationale as
-- set_message_owner_from_student (050): the app-level Student type has no owner_id,
-- and trusting a client-sent one would let a crafted INSERT attach rows to another
-- teacher's account.

CREATE OR REPLACE FUNCTION public.set_flashcard_review_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER flashcard_reviews_set_owner
  BEFORE INSERT ON public.flashcard_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_flashcard_review_owner();

CREATE POLICY "flashcard_reviews_student_select"
  ON public.flashcard_reviews FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- Scoped to decks actually assigned to the student, so a student can't create
-- review rows for arbitrary deck ids.
CREATE POLICY "flashcard_reviews_student_insert"
  ON public.flashcard_reviews FOR INSERT
  WITH CHECK (
    student_id IN (SELECT get_my_student_ids())
    AND deck_id IN (SELECT get_my_flashcard_deck_ids())
  );

CREATE POLICY "flashcard_reviews_student_update"
  ON public.flashcard_reviews FOR UPDATE
  USING      (student_id IN (SELECT get_my_student_ids()))
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));

-- ── 5. Include the new tables in the nightly owner backup ──────────────────────
-- Full replacement of export_owner_backup (048) — same body plus the three
-- flashcard tables appended at the end.

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
  RETURN result;
END;
$$;
