-- Migration 026: Security and performance hardening
--
-- Addresses three classes of Supabase advisor warnings:
--
-- 1. auth_rls_initplan (PERFORMANCE/WARN)
--    auth.uid() called bare in RLS USING expressions causes Postgres to re-evaluate
--    it as a correlated subplan for every scanned row. Wrapping it in
--    (SELECT auth.uid()) promotes it to an uncorrelated InitPlan that executes
--    exactly once per statement. Affects all owner/member policies across 17 tables.
--
-- 2. function_search_path_mutable (SECURITY/WARN)
--    public.update_updated_at() was created in migration 005 without SET search_path,
--    leaving it open to search_path injection. Recreate with a fixed path.
--
-- 3. anon_security_definer_function_executable (SECURITY/WARN)
--    CREATE OR REPLACE FUNCTION resets a function's ACL to the PostgreSQL default
--    (EXECUTE granted to PUBLIC). Migrations 007, 013, 014, and 023 created or
--    replaced SECURITY DEFINER helpers without a subsequent REVOKE, so anon users
--    can invoke trigger functions and internal RLS helpers as REST RPCs.
--    Fix: REVOKE from PUBLIC, then GRANT to the minimum required role.
--
-- Also adds a covering index for the unindexed schools.created_by foreign key.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Performance: (SELECT auth.uid()) in all affected RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Rubrics ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rubrics_owner_all"    ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_shared_select" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_shared_update" ON public.rubrics;

CREATE POLICY "rubrics_owner_all" ON public.rubrics FOR ALL
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "rubrics_shared_select" ON public.rubrics FOR SELECT
  USING (has_rubric_share(id, (SELECT auth.uid())));

CREATE POLICY "rubrics_shared_update" ON public.rubrics FOR UPDATE
  USING (has_rubric_share_edit(id, (SELECT auth.uid())));

-- ── Classes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "classes_owner_all"    ON public.classes;
DROP POLICY IF EXISTS "classes_member_select" ON public.classes;

CREATE POLICY "classes_owner_all" ON public.classes FOR ALL
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "classes_member_select" ON public.classes FOR SELECT
  USING (is_class_member(id, (SELECT auth.uid())));

-- ── Class members ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_members_owner_all"    ON public.class_members;
DROP POLICY IF EXISTS "class_members_self_select"   ON public.class_members;

CREATE POLICY "class_members_owner_all" ON public.class_members FOR ALL
  USING (is_class_owner(class_id, (SELECT auth.uid())));

CREATE POLICY "class_members_self_select" ON public.class_members FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ── Students ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "students_owner_all"           ON public.students;
DROP POLICY IF EXISTS "students_class_member_select"  ON public.students;
DROP POLICY IF EXISTS "students_self_by_email"        ON public.students;

CREATE POLICY "students_owner_all" ON public.students FOR ALL
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "students_class_member_select" ON public.students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_members
      WHERE class_id = students.class_id
        AND user_id = (SELECT auth.uid())
    )
  );

-- Student portal: read own record by email match
CREATE POLICY "students_self_by_email" ON public.students FOR SELECT
  USING (
    data->>'email' IS NOT NULL
    AND (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid())) IS NOT NULL
    AND lower(data->>'email') = lower(
        (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

-- ── Student rubrics ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sr_grader_all"          ON public.student_rubrics;
DROP POLICY IF EXISTS "sr_class_member_select"  ON public.student_rubrics;

CREATE POLICY "sr_grader_all" ON public.student_rubrics FOR ALL
  USING ((SELECT auth.uid()) = grader_id);

CREATE POLICY "sr_class_member_select" ON public.student_rubrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.class_members cm ON cm.class_id = s.class_id
      WHERE s.id = student_rubrics.student_id
        AND cm.user_id = (SELECT auth.uid())
    )
  );

-- ── Single-owner tables ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "attachments_own"        ON public.attachments;
DROP POLICY IF EXISTS "grade_scales_own"       ON public.grade_scales;
DROP POLICY IF EXISTS "comment_snippets_own"   ON public.comment_snippets;
DROP POLICY IF EXISTS "comment_bank_own"       ON public.comment_bank;
DROP POLICY IF EXISTS "export_templates_own"   ON public.export_templates;
DROP POLICY IF EXISTS "favorite_standards_own" ON public.favorite_standards;
DROP POLICY IF EXISTS "self_assessments_own"   ON public.self_assessments;
DROP POLICY IF EXISTS "speaking_sessions_own"  ON public.speaking_sessions;
DROP POLICY IF EXISTS "analysis_results_own"   ON public.analysis_results;
DROP POLICY IF EXISTS "user_settings_own"      ON public.user_settings;

CREATE POLICY "attachments_own"        ON public.attachments        FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "grade_scales_own"       ON public.grade_scales       FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "comment_snippets_own"   ON public.comment_snippets   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "comment_bank_own"       ON public.comment_bank       FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "export_templates_own"   ON public.export_templates   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "favorite_standards_own" ON public.favorite_standards FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "self_assessments_own"   ON public.self_assessments   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "speaking_sessions_own"  ON public.speaking_sessions  FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "analysis_results_own"   ON public.analysis_results   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "user_settings_own"      ON public.user_settings      FOR ALL USING ((SELECT auth.uid()) = user_id);

-- ── Rubric shares ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rubric_shares_owner_all"   ON public.rubric_shares;
DROP POLICY IF EXISTS "rubric_shares_self_select"  ON public.rubric_shares;

CREATE POLICY "rubric_shares_owner_all" ON public.rubric_shares FOR ALL
  USING (is_rubric_owner(rubric_id, (SELECT auth.uid())));

CREATE POLICY "rubric_shares_self_select" ON public.rubric_shares FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ── Profiles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"             ON public.profiles;

-- Users and admins can read all profiles (rubric/class sharing by email).
CREATE POLICY "profiles_read_users_and_admins" ON public.profiles FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND get_my_role() IN ('user', 'admin')
  );

-- Any authenticated user can always read their own profile.
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

-- Users can update their own profile (role change blocked by trigger).
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

-- Belt-and-suspenders for direct inserts (trigger handles the normal path).
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

-- ── Site config ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "site_config_admin_write" ON public.site_config;

CREATE POLICY "site_config_admin_write" ON public.site_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- ── Essay assignments ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "essay_assignments_owner_all"       ON public.essay_assignments;
DROP POLICY IF EXISTS "essay_assignments_student_select"   ON public.essay_assignments;

CREATE POLICY "essay_assignments_owner_all" ON public.essay_assignments FOR ALL
  USING  ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- Replaces migration 025's version: same logic, auth.jwt() wrapped for initplan.
CREATE POLICY "essay_assignments_student_select" ON public.essay_assignments FOR SELECT
  USING (
    -- Anonymous session (SEB / email-gate flow): needs to read the assignment
    coalesce(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) = true
    -- Portal student: may only see their own assignments
    OR id IN (SELECT get_my_essay_assignment_ids())
  );

-- ── Essay submissions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "essay_submissions_teacher_select"  ON public.essay_submissions;
DROP POLICY IF EXISTS "essay_submissions_teacher_delete"  ON public.essay_submissions;
DROP POLICY IF EXISTS "essay_submissions_student_insert"  ON public.essay_submissions;
DROP POLICY IF EXISTS "essay_submissions_student_self"    ON public.essay_submissions;

CREATE POLICY "essay_submissions_teacher_select" ON public.essay_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "essay_submissions_teacher_delete" ON public.essay_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = (SELECT auth.uid())
    )
  );

-- Students may only insert their own submission row (migration 009 logic).
CREATE POLICY "essay_submissions_student_insert" ON public.essay_submissions FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND student_user_id = (SELECT auth.uid())
  );

-- Portal students can read their own submissions (migration 023 logic).
CREATE POLICY "essay_submissions_student_self" ON public.essay_submissions FOR SELECT
  USING (
    assignment_id IN (SELECT get_my_essay_assignment_ids())
    AND lower(student_email) = lower(
        (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Security: fix update_updated_at missing SET search_path
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Performance: index for unindexed schools.created_by foreign key
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS schools_created_by_idx ON public.schools(created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Security: revoke PUBLIC EXECUTE on all SECURITY DEFINER helpers
--
-- CREATE OR REPLACE FUNCTION silently resets ACLs to the Postgres default
-- (EXECUTE granted to PUBLIC). Each migration that used OR REPLACE without a
-- following REVOKE left these functions callable as REST RPCs by anon users.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger functions — must never be callable as RPCs
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_role_changes()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()     FROM PUBLIC;

-- Role helper — authenticated users need it for admin-bypass RLS policies
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Student-data helpers (migrations 014, 023) — authenticated students only
REVOKE EXECUTE ON FUNCTION public.get_my_student_ids()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_class_ids_as_student()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_rubric_ids_as_student()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_essay_assignment_ids()   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_student_ids()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_ids_as_student()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rubric_ids_as_student()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_essay_assignment_ids()   TO authenticated;

-- Cross-table RLS helpers (migration 013) — authenticated users only
REVOKE EXECUTE ON FUNCTION public.is_class_owner(text, uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_class_member(text, uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_rubric_owner(text, uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share(text, uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share_edit(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_class_owner(text, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_member(text, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_rubric_owner(text, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_rubric_share(text, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_rubric_share_edit(text, uuid) TO authenticated;

-- Anonymization functions — service_role / pg_cron only (re-confirm migration 018)
REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students()    FROM PUBLIC;

-- School lookup — authenticated only for onboarding join flow (re-confirm migration 018)
REVOKE EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) TO authenticated;
