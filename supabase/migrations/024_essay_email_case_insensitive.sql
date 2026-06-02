-- Migration 024: Make the essay duplicate guard case-insensitive.
--
-- Migration 022 added UNIQUE (assignment_id, student_email) which treats
-- alice@school.nl and Alice@school.nl as different submitters, while every
-- other email comparison in the system uses lower(). Replace the plain UNIQUE
-- constraint with a functional unique index on lower(student_email).

ALTER TABLE public.essay_submissions
    DROP CONSTRAINT IF EXISTS essay_submissions_assignment_email_uniq;

CREATE UNIQUE INDEX essay_submissions_assignment_email_uniq
    ON public.essay_submissions (assignment_id, lower(student_email));
