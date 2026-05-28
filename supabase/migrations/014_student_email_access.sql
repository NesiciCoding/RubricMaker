-- Migration 014: Allow student users to read their own data by email match
--
-- When a Supabase user has role='student', the App.tsx login gate matches their
-- auth email against the email stored on teacher-created Student records.  Without
-- these policies, fetchStudents() returns an empty array for student-role users,
-- causing the "No student account linked to this email" screen even when the
-- teacher DID import that student's email address.
--
-- The helper functions use SECURITY DEFINER so they bypass RLS internally and
-- avoid policy-recursion errors (same pattern as migration 013).

-- ── 1. Helper: all student record IDs whose email matches the current user ─────

CREATE OR REPLACE FUNCTION public.get_my_student_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id
  FROM   public.students s
  JOIN   public.profiles p ON lower(s.data->>'email') = lower(p.email)
  WHERE  p.id              = auth.uid()
    AND  s.data->>'email'  IS NOT NULL
    AND  p.email           IS NOT NULL
$$;

-- ── 2. Helper: class IDs containing that student ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_class_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT s.class_id
  FROM   public.students s
  JOIN   public.profiles p ON lower(s.data->>'email') = lower(p.email)
  WHERE  p.id              = auth.uid()
    AND  s.data->>'email'  IS NOT NULL
    AND  p.email           IS NOT NULL
$$;

-- ── 3. Helper: rubric IDs used in that student's grades ───────────────────────

CREATE OR REPLACE FUNCTION public.get_my_rubric_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT sr.rubric_id
  FROM   public.student_rubrics sr
  JOIN   public.students s ON s.id = sr.student_id
  JOIN   public.profiles p ON lower(s.data->>'email') = lower(p.email)
  WHERE  p.id              = auth.uid()
    AND  s.data->>'email'  IS NOT NULL
    AND  p.email           IS NOT NULL
$$;

-- ── 4. Students: student can read their own record ────────────────────────────

CREATE POLICY "students_self_by_email"
  ON public.students FOR SELECT
  USING (
    data->>'email' IS NOT NULL
    AND (SELECT email FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
    AND lower(data->>'email') = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
  );

-- ── 5. Student rubrics: student can read their own grades ─────────────────────

CREATE POLICY "student_rubrics_self_by_email"
  ON public.student_rubrics FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- ── 6. Rubrics: student can read rubrics used in their grades ─────────────────

CREATE POLICY "rubrics_student_self"
  ON public.rubrics FOR SELECT
  USING (id IN (SELECT get_my_rubric_ids_as_student()));

-- ── 7. Classes: student can read their own class ──────────────────────────────

CREATE POLICY "classes_student_self"
  ON public.classes FOR SELECT
  USING (id IN (SELECT get_my_class_ids_as_student()));
