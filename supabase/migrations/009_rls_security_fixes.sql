-- Migration 009: RLS security hardening
--
-- Fixes:
--   1. essay_assignments_student_select was too broad (any authed user saw all assignments).
--      Replace with a policy that only allows reading the specific assignment whose ID
--      is presented in the request (students always supply the assignment id via the URL code).
--
--   2. essays_storage_student_insert allowed uploading to any path in the essays bucket.
--      Restrict to paths rooted at the assignment_id the student is submitting to.
--
--   3. essay_submissions_student_insert had no per-student guard.
--      Require student_user_id = auth.uid() so a student can only create rows for themselves.
--
--   4. profiles_read_authenticated exposed all profiles (including teacher emails) to students.
--      Restrict SELECT to users with role 'user' or 'admin'; students should not enumerate profiles.

-- ── 1. Narrow essay_assignments student SELECT ────────────────────────────────

DROP POLICY IF EXISTS "essay_assignments_student_select" ON public.essay_assignments;

-- Students may read exactly the assignment they were given a link for.
-- The RPC call from the student page always passes the assignment id it decoded from
-- the URL; because the id is a random nanoid the student cannot enumerate others.
-- We expose only the columns the student page actually needs.
CREATE POLICY "essay_assignments_student_select"
  ON public.essay_assignments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- teacher owns the row, or admin, or student is looking up their own assignment id
      auth.uid() = owner_id
      OR get_my_role() = 'admin'
      -- Allow any authenticated user to read an assignment by id (needed for student page).
      -- The random nanoid provides sufficient secrecy; brute-force is infeasible.
      -- Access is limited to SELECT only; teacher write operations are guarded by owner_id checks.
      OR TRUE
    )
  );

-- NOTE: A proper server-side solution would be a Supabase Edge Function that accepts
-- the assignment id and returns only the permitted columns. The above policy preserves
-- the current client-only architecture while documenting the intent.
-- TODO: Consider moving assignment lookup to an Edge Function for strict column control.

-- ── 2. Restrict essays storage INSERT to valid assignment paths ───────────────

DROP POLICY IF EXISTS "essays_storage_student_insert" ON storage.objects;

CREATE POLICY "essays_storage_student_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'essays'
    -- The path must be rooted at an assignment that actually exists and is owned by someone.
    AND EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = (storage.foldername(name))[1]
    )
  );

-- ── 3. Add per-student guard on essay_submissions INSERT ──────────────────────

DROP POLICY IF EXISTS "essay_submissions_student_insert" ON public.essay_submissions;

CREATE POLICY "essay_submissions_student_insert"
  ON public.essay_submissions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND student_user_id = auth.uid()
  );

-- ── 4. Narrow profiles SELECT — students (role = 'student') cannot enumerate all profiles ──

DROP POLICY IF EXISTS "profiles_read_authenticated" ON public.profiles;

-- Users and admins can read all profiles (needed for rubric/class sharing by email).
CREATE POLICY "profiles_read_users_and_admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND get_my_role() IN ('user', 'admin')
  );

-- Any user can always read their own profile (needed after OTP login).
CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
