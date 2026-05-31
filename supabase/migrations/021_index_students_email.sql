-- Migration 021: Functional index for student email lookups during signup.
--
-- handle_new_user() runs lower(data->>'email') = lower(new.email) on every
-- signup.  Without an index this is a full table scan with per-row JSONB
-- extraction, which degrades as the students table grows.

CREATE INDEX IF NOT EXISTS idx_students_email_lower
  ON public.students (lower(data->>'email'))
  WHERE data->>'email' IS NOT NULL;
