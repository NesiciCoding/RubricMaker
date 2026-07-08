-- Migration 056: allow multiple submissions per test_assignments row for practice-mode
-- tests (Test.allowMultipleAttempts), without weakening the existing one-shot guard for
-- assessment-mode tests.
--
-- 049's student_tests_assignment_uniq (UNIQUE on assignment_id alone) hard-blocks a second
-- submit-test insert for the same assignment, full stop. Practice-mode retakes need more
-- than one student_tests row per assignment_id, so the guard is widened to
-- UNIQUE(assignment_id, attempt_number) — submit-test (application code, not this migration)
-- still inserts attempt_number = 1 for assessment-mode assignments, so the original
-- one-submission behavior is unchanged there; it only computes attempt_number > 1 when the
-- assignment's denormalized mode = 'practice'.

ALTER TABLE public.student_tests
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS public.student_tests_assignment_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS student_tests_assignment_attempt_uniq
  ON public.student_tests (assignment_id, attempt_number)
  WHERE assignment_id IS NOT NULL;
