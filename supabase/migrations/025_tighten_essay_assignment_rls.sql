-- Migration 025: Narrow the essay_assignments student SELECT policy.
--
-- Migration 008 created a broad policy that allows ANY authenticated user to
-- SELECT any assignment row (needed so anonymous essay-page users can read
-- the assignment they're about to submit). Because Supabase ORs all matching
-- policies, this made the scoped policy added in migration 023 (student_self)
-- redundant — portal students could still read every assignment.
--
-- Fix: replace the broad policy with one that allows:
--   a) anonymous users  (email gate / SEB flow — no email in JWT)
--   b) portal students reading their own assignments (via get_my_essay_assignment_ids)
--   c) teachers (already covered by the owner policy — unchanged)
--
-- The is_anonymous claim is set by Supabase when signInAnonymously() is used.

DROP POLICY IF EXISTS "essay_assignments_student_select" ON public.essay_assignments;

CREATE POLICY "essay_assignments_student_select"
    ON public.essay_assignments FOR SELECT
    USING (
        -- Anonymous session: essay page needs to read the assignment for validation
        coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = true
        -- Portal student: may only see their own assignments
        OR id IN (SELECT get_my_essay_assignment_ids())
    );
