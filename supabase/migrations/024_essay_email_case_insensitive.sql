-- Migration 024: Make the essay duplicate guard case-insensitive.
--
-- Migration 022 added UNIQUE (assignment_id, student_email) which treats
-- alice@school.nl and Alice@school.nl as different submitters, while every
-- other email comparison in the system uses lower(). Replace the plain UNIQUE
-- constraint with a functional unique index on lower(student_email).
--
-- Pre-condition: migration 022 already enforced strict UNIQUE(assignment_id,
-- student_email), so no case-variant duplicate rows can exist at this point.
-- If this migration is ever run on a fresh dataset that skipped 022, check for
-- duplicates first:
--
--   SELECT assignment_id, lower(student_email), count(*)
--   FROM public.essay_submissions
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
-- Note: CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction, and
-- Supabase migrations are transactional. The plain form is used here; it will
-- briefly lock writes on essay_submissions. Because 022 has already been live
-- and the table is small (one row per student per assignment), this is safe.

ALTER TABLE public.essay_submissions
    DROP CONSTRAINT IF EXISTS essay_submissions_assignment_email_uniq;

CREATE UNIQUE INDEX essay_submissions_assignment_email_uniq
    ON public.essay_submissions (assignment_id, lower(student_email));
