-- Migration 016: Student data anonymization support
-- Adds anonymized_at column to the students JSONB store is already handled
-- client-side; this migration adds a Postgres function that the edge function
-- and pg_cron job use to bulk-anonymize students past their retention period.

-- ── 1. Anonymize a single student record ─────────────────────────────────────
-- Replaces name/email/studentNumber in the JSONB data blob with anonymous tokens,
-- and stamps anonymized_at so the record is never processed again.

CREATE OR REPLACE FUNCTION public.anonymize_student(p_student_id text, p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.students%ROWTYPE;
  v_seq   integer;
  v_token text;
BEGIN
  SELECT * INTO v_row FROM public.students
  WHERE data->>'id' = p_student_id
    AND owner_id = p_owner_id
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;
  IF (v_row.data->>'anonymizedAt') IS NOT NULL THEN RETURN; END IF;

  -- Generate a short opaque token (first 8 chars of sha256 of the id)
  v_token := substring(encode(sha256(p_student_id::bytea), 'hex'), 1, 8);

  UPDATE public.students
  SET data = data
    || jsonb_build_object(
         'name',          'Student-' || v_token,
         'email',         NULL,
         'studentNumber', NULL,
         'anonymizedAt',  now()::text
       )
  WHERE data->>'id' = p_student_id
    AND owner_id = p_owner_id;
END;
$$;

-- ── 2. Bulk-anonymize students past their school's retention period ────────────
-- Called nightly by pg_cron (or manually from the admin dashboard edge function).

CREATE OR REPLACE FUNCTION public.anonymize_overdue_students()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    RECORD;
  v_school     RECORD;
  v_student    RECORD;
  v_cutoff     timestamptz;
  v_count      integer := 0;
BEGIN
  -- Iterate every profile that belongs to a school
  FOR v_profile IN
    SELECT p.id AS owner_id, p.school_id
    FROM public.profiles p
    WHERE p.school_id IS NOT NULL
  LOOP
    SELECT retention_years INTO v_school
    FROM public.schools WHERE id = v_profile.school_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_cutoff := now() - (v_school.retention_years || ' years')::interval;

    -- Find students whose latest grade is older than the cutoff
    FOR v_student IN
      SELECT DISTINCT s.data->>'id' AS student_id
      FROM public.students s
      JOIN public.student_rubrics sr ON sr.data->>'studentId' = s.data->>'id'
        AND sr.owner_id = s.owner_id
      WHERE s.owner_id = v_profile.owner_id
        AND (s.data->>'anonymizedAt') IS NULL
        AND (sr.data->>'gradedAt')::timestamptz < v_cutoff
    LOOP
      PERFORM public.anonymize_student(v_student.student_id, v_profile.owner_id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 3. Schedule nightly via pg_cron (enable extension first if needed) ────────
-- Uncomment after enabling the pg_cron extension in the Supabase dashboard:
--
-- SELECT cron.schedule(
--   'anonymize-overdue-students',
--   '0 2 * * *',   -- 02:00 UTC every night
--   $$ SELECT public.anonymize_overdue_students() $$
-- );
