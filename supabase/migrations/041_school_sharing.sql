-- Migration 041: Department rubric & comment bank libraries (school-scoped)
--
-- Lets a teacher mark a rubric or comment bank item read-only-visible to every
-- other teacher in their school. The flag lives inside the existing `data`
-- jsonb column (Rubric.sharedWithSchool / CommentBankItem.sharedWithSchool) —
-- no new column, since `data` already round-trips the whole entity on every save.
--
-- Cannot join through two school_members rows the way marketplace_listings_select
-- (migration 040) does: that policy only ever reads the QUERYING user's own
-- school_members row (profile_id = auth.uid()), which their own RLS
-- (school_members_select, migration 016) always allows. A second school_members
-- row for the RUBRIC'S OWNER, looked up by a non-admin colleague, is exactly the
-- case school_members_select hides — so a `me JOIN owner_sm` shape here always
-- evaluates to false for anyone but the owner. Reading the owner's `school_id` off
-- `profiles` instead works because profiles_read_users_and_admins (migration 037)
-- already lets any teacher/admin read every profile.

CREATE POLICY rubrics_school_select ON public.rubrics FOR SELECT TO authenticated
  USING (
    data->'sharedWithSchool' = 'true'::jsonb
    AND EXISTS (
      SELECT 1 FROM public.school_members me
      JOIN public.profiles owner_p ON owner_p.id = rubrics.owner_id
      WHERE me.profile_id = (SELECT auth.uid())
        AND me.school_id = owner_p.school_id
    )
  );

CREATE POLICY comment_bank_school_select ON public.comment_bank FOR SELECT TO authenticated
  USING (
    data->'sharedWithSchool' = 'true'::jsonb
    AND EXISTS (
      SELECT 1 FROM public.school_members me
      JOIN public.profiles owner_p ON owner_p.id = comment_bank.owner_id
      WHERE me.profile_id = (SELECT auth.uid())
        AND me.school_id = owner_p.school_id
    )
  );
