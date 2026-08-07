-- Migration 068: Student-created flashcard decks (roadmap Phase 41.4).
--
-- Lets a portal-authenticated student author their own decks. A student deck is
-- stored in the same `flashcard_decks` table, distinguished by a non-null
-- `student_id`; its `owner_id` is still the teacher (resolved server-side from the
-- roster, same trigger pattern as flashcard_reviews in 051) so it participates in
-- the owner-scoped backup, but the teacher only *sees* it once the student shares
-- it (data->>'sharedWithTeacher' = true). Private student decks stay invisible to
-- the teacher; teacher-authored decks (student_id IS NULL) are unchanged.

-- ── 1. Ownership column ─────────────────────────────────────────────────────────

ALTER TABLE public.flashcard_decks ADD COLUMN IF NOT EXISTS student_id TEXT;
CREATE INDEX IF NOT EXISTS flashcard_decks_student_idx ON public.flashcard_decks(student_id);

-- ── 2. Resolve owner_id from the roster for a student-authored insert ────────────
-- owner_id is NOT NULL; a portal student can't supply a trustworthy one, so the
-- BEFORE INSERT trigger fills it from the student's roster row before the
-- constraint is checked (mirrors set_flashcard_review_owner in 051).

CREATE OR REPLACE FUNCTION public.set_flashcard_deck_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL AND NEW.student_id IS NOT NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flashcard_decks_set_owner ON public.flashcard_decks;
CREATE TRIGGER flashcard_decks_set_owner
  BEFORE INSERT ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public.set_flashcard_deck_owner();

-- ── 3. Rework the teacher policy to hide private student decks ───────────────────
-- The old "flashcard_decks_owner_all" (FOR ALL, auth.uid() = owner_id) would expose
-- every student deck owned by the teacher. Split it: read own decks + shared student
-- decks; write only own (student_id IS NULL) decks.

DROP POLICY IF EXISTS "flashcard_decks_owner_all" ON public.flashcard_decks;

CREATE POLICY "flashcard_decks_owner_select"
  ON public.flashcard_decks FOR SELECT
  USING (
    (SELECT auth.uid()) = owner_id
    AND (student_id IS NULL OR (data->>'sharedWithTeacher')::boolean IS TRUE)
  );

CREATE POLICY "flashcard_decks_owner_insert"
  ON public.flashcard_decks FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = owner_id AND student_id IS NULL);

CREATE POLICY "flashcard_decks_owner_update"
  ON public.flashcard_decks FOR UPDATE
  USING      ((SELECT auth.uid()) = owner_id AND student_id IS NULL)
  WITH CHECK ((SELECT auth.uid()) = owner_id AND student_id IS NULL);

CREATE POLICY "flashcard_decks_owner_delete"
  ON public.flashcard_decks FOR DELETE
  USING ((SELECT auth.uid()) = owner_id AND student_id IS NULL);

-- ── 4. Portal student: full CRUD over their own decks ───────────────────────────
-- Scoped to the caller's roster ids so a crafted request can't touch another
-- student's decks. INSERT omits owner_id (filled by the trigger above).

CREATE POLICY "flashcard_decks_student_own_select"
  ON public.flashcard_decks FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

CREATE POLICY "flashcard_decks_student_own_insert"
  ON public.flashcard_decks FOR INSERT
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));

CREATE POLICY "flashcard_decks_student_own_update"
  ON public.flashcard_decks FOR UPDATE
  USING      (student_id IN (SELECT get_my_student_ids()))
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));

CREATE POLICY "flashcard_decks_student_own_delete"
  ON public.flashcard_decks FOR DELETE
  USING (student_id IN (SELECT get_my_student_ids()));
