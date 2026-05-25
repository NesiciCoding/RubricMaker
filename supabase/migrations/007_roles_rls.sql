-- Migration 007: Role-based access control
-- Adds a `role` column to profiles, a stable helper function, and admin-bypass
-- RLS policies so that admin users can see all data across the project.

-- ── 1. Role column ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user', 'student'));

-- ── 2. First-user-becomes-admin trigger (replaces migration 004) ───────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- The very first user in the project becomes admin; everyone else starts as user.
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'user' ELSE 'admin' END
    INTO v_role;

  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 3. Stable role-lookup helper (cached per statement by Postgres) ────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ── 4. Trigger: prevent non-admins from changing any user's role ──────────────

CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF get_my_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_protection ON public.profiles;
CREATE TRIGGER enforce_role_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_changes();

-- ── 5. Profiles RLS (replace old single policy with granular ones) ────────────

DROP POLICY IF EXISTS "profiles_own" ON public.profiles;

-- Any authenticated user can read all profiles (needed for sharing by email/ID).
CREATE POLICY "profiles_read_authenticated"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can update their own profile (role change is blocked by the trigger).
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any profile (required for role assignment).
CREATE POLICY "profiles_admin_update_all"
  ON public.profiles FOR UPDATE
  USING (get_my_role() = 'admin');

-- Trigger already handles insert; belt-and-suspenders for direct inserts.
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── 6. Admin SELECT bypass for all data tables ────────────────────────────────
-- These are additive (OR-combined with existing owner policies), so they only
-- expand access for admins and never restrict existing access.

CREATE POLICY "rubrics_admin_select"
  ON public.rubrics FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "classes_admin_select"
  ON public.classes FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "students_admin_select"
  ON public.students FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "student_rubrics_admin_select"
  ON public.student_rubrics FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "attachments_admin_select"
  ON public.attachments FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "grade_scales_admin_select"
  ON public.grade_scales FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "comment_bank_admin_select"
  ON public.comment_bank FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "export_templates_admin_select"
  ON public.export_templates FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "favorite_standards_admin_select"
  ON public.favorite_standards FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "self_assessments_admin_select"
  ON public.self_assessments FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "speaking_sessions_admin_select"
  ON public.speaking_sessions FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "analysis_results_admin_select"
  ON public.analysis_results FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "user_settings_admin_select"
  ON public.user_settings FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "rubric_shares_admin_select"
  ON public.rubric_shares FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "class_members_admin_select"
  ON public.class_members FOR SELECT
  USING (get_my_role() = 'admin');
