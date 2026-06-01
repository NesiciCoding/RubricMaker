-- Migration 022: Change essay duplicate guard from (assignment_id, student_user_id)
-- to (assignment_id, student_email).
--
-- With anonymous Supabase auth (SEB-compatible flow) each browser session gets a
-- new user ID, making the old constraint useless as a duplicate guard. Using the
-- student-provided email instead gives a stable identifier that survives SEB
-- session resets while still preventing the same student from submitting twice.

ALTER TABLE public.essay_submissions
    DROP CONSTRAINT IF EXISTS essay_submissions_assignment_student_uniq;

ALTER TABLE public.essay_submissions
    ADD CONSTRAINT essay_submissions_assignment_email_uniq
    UNIQUE (assignment_id, student_email);
