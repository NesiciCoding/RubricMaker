-- Migration 077: Scope profile reads and check who grade rows are written for.
--
-- profiles: teachers read their own row, non-student profiles in a school they belong to,
-- and the colleagues they share a rubric or class with. Admins keep reading every profile.
-- Looking up a colleague by email for sharing goes through find_profile_by_email().
--
-- student_rubrics: a row can only be written by a teacher/admin who owns the student or is
-- an editor on the student's class. The student portal only shows rows from those graders.

-- ── 1. profiles ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_collaborator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_shares rs JOIN public.rubrics r ON r.id = rs.rubric_id
    WHERE (r.owner_id = auth.uid() AND rs.user_id = p_user_id)
       OR (r.owner_id = p_user_id AND rs.user_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.class_members cm JOIN public.classes c ON c.id = cm.class_id
    WHERE (c.owner_id = auth.uid() AND cm.user_id = p_user_id)
       OR (c.owner_id = p_user_id AND cm.user_id = auth.uid())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_collaborator(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_collaborator(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_scoped" ON public.profiles;
CREATE POLICY "profiles_read_scoped" ON public.profiles FOR SELECT TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'teacher'
      AND role <> 'student'
      AND (
        school_id IN (SELECT sm.school_id FROM public.school_members sm WHERE sm.profile_id = (SELECT auth.uid()))
        OR public.is_collaborator(id)
      )
    )
  );

-- Exact-address lookup for sharing. Returns only teacher/admin accounts, is logged to
-- audit_logs, and is capped per caller.
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email text)
RETURNS TABLE (id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL OR coalesce(get_my_role(), '') NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF (
    SELECT count(*) FROM public.audit_logs a
    WHERE a.actor_id = v_uid AND a.action = 'profile_lookup' AND a.created_at > now() - interval '10 minutes'
  ) >= 30 THEN
    RAISE EXCEPTION 'Too many lookups, try again later' USING ERRCODE = '54000';
  END IF;

  SELECT p.id, p.display_name INTO v_id, v_name
  FROM public.profiles p
  WHERE lower(p.email) = lower(btrim(p_email))
    AND p.role IN ('teacher', 'admin')
  LIMIT 1;

  INSERT INTO public.audit_logs (actor_id, category, action, entity_type, entity_id)
  VALUES (v_uid, 'auth', 'profile_lookup', 'profile', v_id::text);

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_name;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_profile_by_email(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.find_profile_by_email(text) TO authenticated;

-- ── 2. student_rubrics ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_grade_student(p_student_id text, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (
        s.owner_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM public.class_members cm
          WHERE cm.class_id = s.class_id AND cm.user_id = p_user_id AND cm.role = 'editor'
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_grade_student(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_grade_student(text, uuid) TO authenticated;

DROP POLICY IF EXISTS "sr_grader_all" ON public.student_rubrics;
CREATE POLICY "sr_grader_all" ON public.student_rubrics FOR ALL
  USING ((SELECT auth.uid()) = grader_id)
  WITH CHECK (
    (SELECT auth.uid()) = grader_id
    AND get_my_role() IN ('teacher', 'admin')
    AND public.can_grade_student(student_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "student_rubrics_self_by_email" ON public.student_rubrics;
CREATE POLICY "student_rubrics_self_by_email" ON public.student_rubrics FOR SELECT
  USING (
    student_id IN (SELECT get_my_student_ids())
    AND public.can_grade_student(student_id, grader_id)
  );

CREATE OR REPLACE FUNCTION public.get_my_rubric_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT sr.rubric_id
  FROM   public.student_rubrics sr
  JOIN   public.students s ON s.id = sr.student_id
  WHERE  s.data->>'email' IS NOT NULL
    AND  lower(s.data->>'email') = public.get_my_verified_email()
    AND  public.can_grade_student(sr.student_id, sr.grader_id)
$$;
