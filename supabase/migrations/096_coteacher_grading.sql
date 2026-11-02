-- Co-teacher grading: a teacher who shares a class (class_members) can grade that class with the
-- class's rubrics and tests, and an `editor` can change ANY grade or test result for its students,
-- not only the ones they gave themselves.
--
-- Who may change a grade/result for a student: the student's owner, or an `editor` on the
-- student's class — exactly can_grade_student() from 077. Rows keep their original grader/owner
-- (protect_coteacher_edit puts it back) and record the last editor in data->'lastEditedBy'.
--
-- What a co-teacher may READ to grade (any class_members role, teacher/admin only):
--   rubrics  — linked to a shared class (classes.data->'rubricIds') or used by a grade of one of
--              its students; also rubrics a co-teacher used on the caller's own students.
--   tests    — assigned to, or taken by, a student of a shared class or one of the caller's students.
--   results  — student_rubrics / student_tests / test_assignments of those students.
-- Editing a colleague's rubric or test itself stays governed by material sharing (095).
--
-- Assigning: a class editor may create test_assignments for a test they can read, but the row is
-- owned by the TEST's owner (owner_id), because tests_student_select and the get-test-assignment /
-- submit-test functions require assignment owner = test owner; results therefore land with the
-- test owner and reach the co-teacher through the policies below.

-- ── 1. Helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
$$;

-- The caller owns the student, or is a member (any role) of the student's class.
CREATE OR REPLACE FUNCTION public.can_view_student_work(p_student_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_teacher_or_admin() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (
        s.owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.class_members cm WHERE cm.class_id = s.class_id AND cm.user_id = auth.uid())
      )
  )
$$;

-- The caller owns the student or is an editor on the student's class.
CREATE OR REPLACE FUNCTION public.can_edit_student_work(p_student_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_teacher_or_admin() AND public.can_grade_student(p_student_id, auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.rubric_in_coteaching(p_rubric_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_teacher_or_admin() AND (
    EXISTS (
      SELECT 1 FROM public.class_members cm JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.user_id = auth.uid()
        AND jsonb_typeof(c.data->'rubricIds') = 'array'
        AND c.data->'rubricIds' ? p_rubric_id
    )
    OR EXISTS (
      SELECT 1 FROM public.student_rubrics sr JOIN public.students s ON s.id = sr.student_id
      WHERE sr.rubric_id = p_rubric_id
        AND (
          s.owner_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.class_members cm WHERE cm.class_id = s.class_id AND cm.user_id = auth.uid())
        )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.test_in_coteaching(p_test_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_teacher_or_admin() AND (
    EXISTS (
      SELECT 1 FROM public.test_assignments ta
      WHERE ta.test_id = p_test_id AND public.can_view_student_work(ta.student_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.student_tests st
      WHERE st.data->>'testId' = p_test_id AND public.can_view_student_work(st.data->>'studentId')
    )
  )
$$;

-- A co-teacher may write an assignment row owned by the test's owner when they can edit the
-- student's work, can read the test, and the test owner can grade the student too (so the
-- results land with someone who has that student).
CREATE OR REPLACE FUNCTION public.can_assign_colleague_test(p_test_id text, p_owner uuid, p_student_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_owner IS DISTINCT FROM auth.uid()
    AND public.can_edit_student_work(p_student_id)
    AND public.can_grade_student(p_student_id, p_owner)
    AND EXISTS (
      SELECT 1 FROM public.tests t
      WHERE t.id = p_test_id AND t.owner_id = p_owner
        AND (
          public.material_access(t.owner_id, t.data->'sharing', t.data->>'folderId') IS NOT NULL
          OR public.test_in_coteaching(t.id)
        )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.is_teacher_or_admin()                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_student_work(text)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_student_work(text)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rubric_in_coteaching(text)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.test_in_coteaching(text)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_assign_colleague_test(text, uuid, text)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_teacher_or_admin()                            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_view_student_work(text)                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_edit_student_work(text)                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rubric_in_coteaching(text)                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.test_in_coteaching(text)                         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_assign_colleague_test(text, uuid, text)      TO authenticated;

-- ── 2. Grades (student_rubrics) ──────────────────────────────────────────────

DROP POLICY IF EXISTS sr_student_owner_select ON public.student_rubrics;
CREATE POLICY sr_student_owner_select ON public.student_rubrics FOR SELECT TO authenticated
  USING (NOT is_peer_review AND public.can_view_student_work(student_id));

DROP POLICY IF EXISTS sr_coteacher_update ON public.student_rubrics;
CREATE POLICY sr_coteacher_update ON public.student_rubrics FOR UPDATE TO authenticated
  USING (NOT is_peer_review AND public.can_edit_student_work(student_id))
  WITH CHECK (NOT is_peer_review AND public.can_edit_student_work(student_id));

-- ── 3. Test results, assignments and the tests themselves ────────────────────

DROP POLICY IF EXISTS student_tests_coteacher_select ON public.student_tests;
CREATE POLICY student_tests_coteacher_select ON public.student_tests FOR SELECT TO authenticated
  USING (public.can_view_student_work(data->>'studentId'));

DROP POLICY IF EXISTS student_tests_coteacher_update ON public.student_tests;
CREATE POLICY student_tests_coteacher_update ON public.student_tests FOR UPDATE TO authenticated
  USING (public.can_edit_student_work(data->>'studentId'))
  WITH CHECK (public.can_edit_student_work(data->>'studentId'));

DROP POLICY IF EXISTS test_assignments_coteacher_select ON public.test_assignments;
CREATE POLICY test_assignments_coteacher_select ON public.test_assignments FOR SELECT TO authenticated
  USING (public.can_view_student_work(student_id));

DROP POLICY IF EXISTS test_assignments_coteacher_insert ON public.test_assignments;
CREATE POLICY test_assignments_coteacher_insert ON public.test_assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_assign_colleague_test(test_id, owner_id, student_id));

DROP POLICY IF EXISTS test_assignments_coteacher_update ON public.test_assignments;
CREATE POLICY test_assignments_coteacher_update ON public.test_assignments FOR UPDATE TO authenticated
  USING (public.can_assign_colleague_test(test_id, owner_id, student_id))
  WITH CHECK (public.can_assign_colleague_test(test_id, owner_id, student_id));

DROP POLICY IF EXISTS rubrics_coteaching_select ON public.rubrics;
CREATE POLICY rubrics_coteaching_select ON public.rubrics FOR SELECT TO authenticated
  USING (owner_id <> (SELECT auth.uid()) AND public.rubric_in_coteaching(id));

DROP POLICY IF EXISTS tests_coteaching_select ON public.tests;
CREATE POLICY tests_coteaching_select ON public.tests FOR SELECT TO authenticated
  USING (owner_id <> (SELECT auth.uid()) AND public.test_in_coteaching(id));

-- ── 4. Keep the original grader/owner; record who last changed it ────────────
-- An upsert from a co-teacher's client proposes their own id as grader_id/owner_id; the row keeps
-- the original one instead. lastEditedBy is only stamped when the content really changed, so a
-- client re-pushing an unchanged row doesn't claim it.

CREATE OR REPLACE FUNCTION public.protect_coteacher_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'student_rubrics' THEN
    IF v_me IS DISTINCT FROM OLD.grader_id THEN
      NEW.grader_id := OLD.grader_id;
      NEW.is_peer_review := OLD.is_peer_review;
    END IF;
  ELSIF v_me IS DISTINCT FROM OLD.owner_id THEN
    NEW.owner_id := OLD.owner_id;
  END IF;
  IF (NEW.data - 'lastEditedBy') IS DISTINCT FROM (OLD.data - 'lastEditedBy') THEN
    NEW.data := jsonb_set(NEW.data, '{lastEditedBy}', to_jsonb(v_me::text));
  ELSIF OLD.data ? 'lastEditedBy' THEN
    NEW.data := jsonb_set(NEW.data, '{lastEditedBy}', OLD.data->'lastEditedBy');
  ELSE
    NEW.data := NEW.data - 'lastEditedBy';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_coteacher_edit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS student_rubrics_protect_coteacher ON public.student_rubrics;
CREATE TRIGGER student_rubrics_protect_coteacher
  BEFORE UPDATE ON public.student_rubrics
  FOR EACH ROW EXECUTE FUNCTION public.protect_coteacher_edit();

DROP TRIGGER IF EXISTS student_tests_protect_coteacher ON public.student_tests;
CREATE TRIGGER student_tests_protect_coteacher
  BEFORE UPDATE ON public.student_tests
  FOR EACH ROW EXECUTE FUNCTION public.protect_coteacher_edit();

-- ── 5. List the rubrics/tests a co-teacher can grade with ────────────────────
-- Redefined from 095: the test branch now returns every test RLS lets the caller read (shared via
-- 095 or used in a co-taught class), like the rubric branch already did.

CREATE OR REPLACE FUNCTION public.list_shared_materials(p_kind text)
RETURNS TABLE (id text, owner_id uuid, owner_name text, item_kind text, data jsonb, access text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_kind NOT IN ('rubric', 'test') THEN
    RETURN;
  END IF;

  IF p_kind = 'rubric' THEN
    RETURN QUERY
      SELECT r.id, r.owner_id, COALESCE(NULLIF(p.display_name, ''), p.email, '')::text, 'rubric'::text, r.data,
        CASE
          WHEN EXISTS (SELECT 1 FROM public.rubric_shares rs
                       WHERE rs.rubric_id = r.id AND rs.user_id = v_me AND rs.mode = 'edit') THEN 'edit'
          ELSE COALESCE(public.material_access(r.owner_id, r.data->'sharing', r.data->>'folderId'), 'view')
        END
      FROM public.rubrics r
      LEFT JOIN public.profiles p ON p.id = r.owner_id
      WHERE r.owner_id <> v_me;
  ELSE
    RETURN QUERY
      SELECT t.id, t.owner_id, COALESCE(NULLIF(p.display_name, ''), p.email, '')::text, 'test'::text, t.data,
        COALESCE(public.material_access(t.owner_id, t.data->'sharing', t.data->>'folderId'), 'view')
      FROM public.tests t
      LEFT JOIN public.profiles p ON p.id = t.owner_id
      WHERE t.owner_id <> v_me
        AND public.is_teacher_or_admin();
  END IF;

  RETURN QUERY
    SELECT f.id, f.owner_id, COALESCE(NULLIF(p.display_name, ''), p.email, '')::text, 'folder'::text, f.data,
      public.material_access(f.owner_id, f.data->'sharing', f.data->>'parentId')
    FROM public.folders f
    LEFT JOIN public.profiles p ON p.id = f.owner_id
    WHERE f.owner_id <> v_me AND f.data->>'kind' = p_kind;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_shared_materials(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_shared_materials(text) TO authenticated;
