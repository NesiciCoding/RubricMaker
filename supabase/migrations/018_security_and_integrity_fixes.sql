-- Migration 018: Security and data-integrity fixes
-- 1. CHECK (retention_years > 0) on schools
-- 2. UNIQUE(profile_id) on school_members (one school per user)
-- 3. Public school-lookup RPC for onboarding join flow
-- 4. REVOKE EXECUTE from PUBLIC on SECURITY DEFINER functions
-- 5. Fix anonymize_overdue_students to use MAX(gradedAt) per student

-- ── 1. Positive-retention constraint ─────────────────────────────────────────

ALTER TABLE public.schools
  ADD CONSTRAINT schools_retention_range CHECK (retention_years BETWEEN 1 AND 20);

-- ── 2. One-school-per-user constraint ────────────────────────────────────────
-- A profile may only belong to a single school at a time.

ALTER TABLE public.school_members
  ADD CONSTRAINT school_members_profile_unique UNIQUE (profile_id);

-- ── 3. Public school-lookup function ─────────────────────────────────────────
-- Lets an unauthenticated or not-yet-member user verify a school ID before
-- joining, without bypassing the schools SELECT RLS policy.

CREATE OR REPLACE FUNCTION public.lookup_school_by_id(p_school_id uuid)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name FROM public.schools s WHERE s.id = p_school_id;
$$;

-- Only authenticated users may call this; PUBLIC and anon cannot.
REVOKE EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) TO authenticated;

-- ── 4. Revoke PUBLIC execute on existing SECURITY DEFINER functions ───────────
-- By default Postgres grants EXECUTE to PUBLIC for every new function.
-- Restrict both functions to the service role only (edge functions and pg_cron
-- use the service role; authenticated users must not call these directly).

REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students()  FROM PUBLIC;

-- ── 5. Fix anonymize_overdue_students to use MAX(gradedAt) ───────────────────
-- The previous version anonymized a student if ANY grade record was older than
-- the cutoff. The correct check is that the student's LATEST grade is older.

CREATE OR REPLACE FUNCTION public.anonymize_overdue_students()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_school   RECORD;
  v_student  RECORD;
  v_cutoff   timestamptz;
  v_count    integer := 0;
BEGIN
  FOR v_profile IN
    SELECT p.id AS owner_id, p.school_id
    FROM public.profiles p
    WHERE p.school_id IS NOT NULL
  LOOP
    SELECT retention_years INTO v_school
    FROM public.schools WHERE id = v_profile.school_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_cutoff := now() - (v_school.retention_years || ' years')::interval;

    -- Only anonymize students whose LATEST grade is before the cutoff.
    FOR v_student IN
      SELECT s.data->>'id' AS student_id
      FROM public.students s
      WHERE s.owner_id = v_profile.owner_id
        AND (s.data->>'anonymizedAt') IS NULL
        AND (
          SELECT MAX((sr.data->>'gradedAt')::timestamptz)
          FROM public.student_rubrics sr
          WHERE sr.data->>'studentId' = s.data->>'id'
            AND sr.owner_id = s.owner_id
        ) < v_cutoff
    LOOP
      PERFORM public.anonymize_student(v_student.student_id, v_profile.owner_id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Re-apply the revoke after OR REPLACE (OR REPLACE resets grants to default).
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students() FROM PUBLIC;
