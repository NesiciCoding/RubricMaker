-- Migration 023: Student-scoped essay assignment and submission access
--
-- Adds a SECURITY DEFINER helper function + RLS policies so that student-role
-- users can read their own essay assignments and submission status from the portal.
-- Follows the same pattern as migration 014 (get_my_student_ids etc.).

-- ── 1. Helper: assignment IDs belonging to the current student ────────────────

CREATE OR REPLACE FUNCTION public.get_my_essay_assignment_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ea.id
  FROM   public.essay_assignments ea
  WHERE  ea.student_id IN (SELECT get_my_student_ids())
$$;

-- ── 2. Students can read their own assignments ────────────────────────────────
-- The existing "essay_assignments_student_select" (any authenticated user) stays
-- in place — anonymous essay-page users still need it for assignment validation.
-- This new policy is additive and more specific for portal-logged-in students.

CREATE POLICY "essay_assignments_student_self"
  ON public.essay_assignments FOR SELECT
  USING (id IN (SELECT get_my_essay_assignment_ids()));

-- ── 3. Students can read their own submissions (for portal completion status) ──
-- Matches on both assignment ownership (via helper) and on student_email matching
-- the authenticated user's verified email so students can't read each other's work.

CREATE POLICY "essay_submissions_student_self"
  ON public.essay_submissions FOR SELECT
  USING (
    assignment_id IN (SELECT get_my_essay_assignment_ids())
    AND lower(student_email) = lower(
      (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );
