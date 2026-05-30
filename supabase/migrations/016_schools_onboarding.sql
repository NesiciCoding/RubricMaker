-- Migration 015: Schools, school members, onboarding support
-- Adds multi-school infrastructure: schools table, school_members join table,
-- and school_id on profiles so the onboarding flow can assign users to a school.
--
-- NOTE: school_members is created BEFORE the schools SELECT policy because that
-- policy references school_members in its USING clause. PostgreSQL validates the
-- expression at CREATE POLICY time, so school_members must already exist.

-- ── 1. Schools table (no SELECT policy yet — added after school_members) ──────

CREATE TABLE IF NOT EXISTS public.schools (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  retention_years integer     NOT NULL DEFAULT 3,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- ── 2. School members table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (school_id, profile_id)
);

ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;

-- ── 3. Schools policies (school_members now exists) ───────────────────────────

-- Members of the school can read it
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = schools.id
        AND sm.profile_id = (SELECT auth.uid())
    )
    OR (SELECT auth.uid()) = created_by
  );

-- Any authenticated user can create a school (they become the creator)
CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

-- Only admins can update schools
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING  (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Only admins can delete schools
CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ── 4. School_members policies ────────────────────────────────────────────────

-- Members can read their own memberships; admins see all
CREATE POLICY school_members_select ON public.school_members FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- Users can join a school themselves; admins can add anyone
CREATE POLICY school_members_insert ON public.school_members FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- Users can remove themselves; admins can remove anyone
CREATE POLICY school_members_delete ON public.school_members FOR DELETE TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- ── 5. Add school_id to profiles ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

-- ── 6. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS school_members_school_id_idx  ON public.school_members (school_id);
CREATE INDEX IF NOT EXISTS school_members_profile_id_idx ON public.school_members (profile_id);
CREATE INDEX IF NOT EXISTS profiles_school_id_idx        ON public.profiles (school_id);

-- ── 7. Grant API access ──────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools        TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.school_members TO authenticated;
