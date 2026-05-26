-- Migration 010: Prevent duplicate submissions + add assignment deadline

-- ── 1. Unique constraint: one submission per student per assignment ──────────
-- The WITH CHECK on insert already filters by auth.uid() = student_user_id,
-- so this constraint enforces the invariant at the DB level as a hard guarantee.
ALTER TABLE public.essay_submissions
    ADD CONSTRAINT essay_submissions_assignment_student_uniq
    UNIQUE (assignment_id, student_user_id);

-- ── 2. Deadline column on essay_assignments ───────────────────────────────────
-- NULL means no deadline. When set, the Edge Function and client both block
-- submissions after this timestamp.
ALTER TABLE public.essay_assignments
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
