-- Migration 070: Idempotent + safe rewrite of the flashcard_decks policies from 068.
--
-- Two forward-only fixes to the policies migration 068 introduced (068 is already
-- applied, so it can't be edited):
--
-- 1. Idempotency — 068 drops the legacy `flashcard_decks_owner_all` but then runs bare
--    `CREATE POLICY` for its eight replacement policies. A second run of the concatenated
--    bootstrap.sql raises `42710` (policy already exists) and aborts. Each CREATE below is
--    guarded by a matching DROP ... IF EXISTS.
--
-- 2. Safe JSON boolean — the teacher SELECT policy tested `(data->>'sharedWithTeacher')::boolean`.
--    `data` is student-writable, so non-boolean text there raises an invalid-input error that
--    breaks a teacher's deck query. `data @> '{"sharedWithTeacher": true}'::jsonb` matches the
--    JSON boolean directly and never throws.

DROP POLICY IF EXISTS "flashcard_decks_owner_all" ON public.flashcard_decks;

DROP POLICY IF EXISTS "flashcard_decks_owner_select" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_owner_select"
  ON public.flashcard_decks FOR SELECT
  USING (
    (SELECT auth.uid()) = owner_id
    AND (student_id IS NULL OR data @> '{"sharedWithTeacher": true}'::jsonb)
  );

DROP POLICY IF EXISTS "flashcard_decks_owner_insert" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_owner_insert"
  ON public.flashcard_decks FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = owner_id AND student_id IS NULL);

DROP POLICY IF EXISTS "flashcard_decks_owner_update" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_owner_update"
  ON public.flashcard_decks FOR UPDATE
  USING      ((SELECT auth.uid()) = owner_id AND student_id IS NULL)
  WITH CHECK ((SELECT auth.uid()) = owner_id AND student_id IS NULL);

DROP POLICY IF EXISTS "flashcard_decks_owner_delete" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_owner_delete"
  ON public.flashcard_decks FOR DELETE
  USING ((SELECT auth.uid()) = owner_id AND student_id IS NULL);

DROP POLICY IF EXISTS "flashcard_decks_student_own_select" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_student_own_select"
  ON public.flashcard_decks FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

DROP POLICY IF EXISTS "flashcard_decks_student_own_insert" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_student_own_insert"
  ON public.flashcard_decks FOR INSERT
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));

DROP POLICY IF EXISTS "flashcard_decks_student_own_update" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_student_own_update"
  ON public.flashcard_decks FOR UPDATE
  USING      (student_id IN (SELECT get_my_student_ids()))
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));

DROP POLICY IF EXISTS "flashcard_decks_student_own_delete" ON public.flashcard_decks;
CREATE POLICY "flashcard_decks_student_own_delete"
  ON public.flashcard_decks FOR DELETE
  USING (student_id IN (SELECT get_my_student_ids()));
