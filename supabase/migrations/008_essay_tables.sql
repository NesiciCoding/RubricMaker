-- Migration 008: Essay assignment and submission tables + storage bucket
-- Teacher creates assignments; students submit essays directly to the database.

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.essay_assignments (
  id               TEXT        PRIMARY KEY,          -- nanoid (= teacherKey)
  owner_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rubric_id        TEXT        NOT NULL,
  student_id       TEXT        NOT NULL,             -- local app student ID
  title            TEXT        NOT NULL,
  prompt           TEXT,
  min_words        INTEGER,
  max_words        INTEGER,
  time_limit_minutes INTEGER,
  require_seb      BOOLEAN     NOT NULL DEFAULT FALSE,
  read_only_after_submit BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS essay_assignments_owner_idx ON public.essay_assignments(owner_id);
CREATE INDEX IF NOT EXISTS essay_assignments_rubric_student_idx ON public.essay_assignments(rubric_id, student_id);

CREATE TABLE IF NOT EXISTS public.essay_submissions (
  id               TEXT        PRIMARY KEY,          -- nanoid
  assignment_id    TEXT        NOT NULL REFERENCES public.essay_assignments(id) ON DELETE CASCADE,
  student_email    TEXT,                             -- OTP-verified email
  student_user_id  UUID,                             -- Supabase auth user ID (nullable for anonymous fallback)
  word_count       INTEGER     NOT NULL DEFAULT 0,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_path     TEXT        NOT NULL              -- path in 'essays' bucket
);

CREATE INDEX IF NOT EXISTS essay_submissions_assignment_idx ON public.essay_submissions(assignment_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.essay_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_submissions  ENABLE ROW LEVEL SECURITY;

-- Teacher owns their assignments
CREATE POLICY "essay_assignments_owner_all"
  ON public.essay_assignments FOR ALL
  USING  (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Admin can read all assignments
CREATE POLICY "essay_assignments_admin_select"
  ON public.essay_assignments FOR SELECT
  USING (get_my_role() = 'admin');

-- Any authenticated user can read an assignment (student page needs title/prompt/limits)
CREATE POLICY "essay_assignments_student_select"
  ON public.essay_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any authenticated user can submit an essay (FK to essay_assignments enforces validity)
CREATE POLICY "essay_submissions_student_insert"
  ON public.essay_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Teacher can read submissions for their own assignments
CREATE POLICY "essay_submissions_teacher_select"
  ON public.essay_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = auth.uid()
    )
  );

-- Teacher can delete submissions for their own assignments
CREATE POLICY "essay_submissions_teacher_delete"
  ON public.essay_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = auth.uid()
    )
  );

-- Admin can read all submissions
CREATE POLICY "essay_submissions_admin_select"
  ON public.essay_submissions FOR SELECT
  USING (get_my_role() = 'admin');

-- ── 3. Storage bucket ─────────────────────────────────────────────────────────
-- Run these in the Supabase dashboard (Storage > New bucket) or via the CLI:
--   supabase storage create essays --private
--
-- The INSERT/SELECT policies below match what the CLI or dashboard would generate.
-- Path convention: {assignmentId}/{submissionId}.html

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'essays', 'essays', FALSE,
  5242880,  -- 5 MB per file
  ARRAY['text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated user (student) can upload an essay file
CREATE POLICY "essays_storage_student_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'essays');

-- Teacher can read files whose top-level folder matches one of their assignment IDs
-- (path = {assignmentId}/{submissionId}.html → foldername[1] = assignmentId)
CREATE POLICY "essays_storage_teacher_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'essays'
    AND EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = (storage.foldername(name))[1]
        AND ea.owner_id = auth.uid()
    )
  );

-- Teacher can delete files for their assignments
CREATE POLICY "essays_storage_teacher_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'essays'
    AND EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = (storage.foldername(name))[1]
        AND ea.owner_id = auth.uid()
    )
  );
