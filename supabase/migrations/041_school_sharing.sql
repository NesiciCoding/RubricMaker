-- Migration 041: Department rubric & comment bank libraries (school-scoped)
--
-- Lets a teacher mark a rubric or comment bank item read-only-visible to every
-- other teacher in their school, reusing the existing schools / school_members
-- tables (same join pattern as marketplace_listings_select in migration 040).
-- The flag lives inside the existing `data` jsonb column (Rubric.sharedWithSchool /
-- CommentBankItem.sharedWithSchool) — no new column, since `data` already round-trips
-- the whole entity on every save.

CREATE POLICY rubrics_school_select ON public.rubrics FOR SELECT TO authenticated
  USING (
    (data->>'sharedWithSchool')::boolean IS TRUE
    AND EXISTS (
      SELECT 1 FROM public.school_members me
      JOIN public.school_members owner_sm ON owner_sm.school_id = me.school_id
      WHERE me.profile_id = (SELECT auth.uid())
        AND owner_sm.profile_id = rubrics.owner_id
    )
  );

CREATE POLICY comment_bank_school_select ON public.comment_bank FOR SELECT TO authenticated
  USING (
    (data->>'sharedWithSchool')::boolean IS TRUE
    AND EXISTS (
      SELECT 1 FROM public.school_members me
      JOIN public.school_members owner_sm ON owner_sm.school_id = me.school_id
      WHERE me.profile_id = (SELECT auth.uid())
        AND owner_sm.profile_id = comment_bank.owner_id
    )
  );
