-- Migration 049: student_tests submission columns + duplicate-submission guard,
-- for the submit-test edge function (fixes the disconnected/never-authenticates
-- StudentTestPage DB-mode client flagged in migration 044's scope note).
--
-- Mirrors essay_submissions' real-column-for-identity/jsonb-for-everything-else
-- pattern (008/010), but deliberately does NOT copy essay's original
-- UNIQUE(assignment_id, student_user_id) guard (migration 010). That constraint
-- had to be replaced with UNIQUE(assignment_id, student_email) in migration 022
-- because an anonymous auth.uid() isn't stable across devices/cleared storage — a
-- student resubmitting from a second device got a fresh anon user and slipped past
-- the guard. A test_assignments row is already 1:1 with one student (unlike
-- essay_assignments' shared-per-class link), so assignment_id alone already scopes
-- to exactly one student — no email/user_id pairing needed. student_user_id is
-- kept only for the submit-test rate-limit query, not for uniqueness.

ALTER TABLE public.student_tests
  ADD COLUMN IF NOT EXISTS assignment_id   TEXT REFERENCES public.test_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_user_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS student_tests_assignment_uniq
  ON public.student_tests (assignment_id)
  WHERE assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_tests_student_user_idx ON public.student_tests(student_user_id);

-- No new RLS insert policy: submit-test writes exclusively via the service-role
-- client, so a client-facing insert policy would be dead code from day one
-- (unlike essay_submissions_student_insert, which predates the edge-function
-- design and is kept only defensively).
