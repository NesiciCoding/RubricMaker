-- Migration 078: make the nightly retention job actually run (#627).
--
-- anonymize_overdue_students() (last redefined in 018, scheduled by 038) referenced
-- student_rubrics.owner_id, which does not exist (the column is grader_id), so every
-- 02:00 run raised and no school's retention_years was ever applied. It also only looked
-- at profiles.school_id, skipping teachers who joined through school_members.
--
-- This version:
--   * keys grades on the real student_rubrics.student_id column (any grader's latest
--     grade counts, so co-graded students are not anonymized early);
--   * resolves a teacher's school from profiles.school_id OR school_members;
--   * stamps data.updatedAt so last-write-wins sync on a teacher's device cannot push the
--     pre-anonymization record back over it;
--   * isolates per-student failures and records every run in audit_logs.

-- ── 1. Lenient timestamp cast ───────────────────────────────────────────────────
-- gradedAt lives in jsonb; one malformed value must not abort the whole nightly run.
CREATE OR REPLACE FUNCTION public.try_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN p_value::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_timestamptz(text) FROM PUBLIC, anon, authenticated;

-- ── 2. Anonymize one student ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_student(p_student_id text, p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := substring(encode(sha256(p_student_id::bytea), 'hex'), 1, 8);
  v_now   text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  UPDATE public.students
  SET data = data || jsonb_build_object(
        'name',          'Student-' || v_token,
        'email',         NULL,
        'studentNumber', NULL,
        'anonymizedAt',  v_now,
        'updatedAt',     v_now
      )
  WHERE id = p_student_id
    AND owner_id = p_owner_id
    AND (data->>'anonymizedAt') IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Bulk job ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_overdue_students()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student    RECORD;
  v_count      integer := 0;
  v_failed     integer := 0;
  v_last_error text;
BEGIN
  FOR v_student IN
    WITH owner_school AS (
      SELECT p.id AS owner_id, COALESCE(p.school_id, sm.school_id) AS school_id
      FROM public.profiles p
      LEFT JOIN public.school_members sm ON sm.profile_id = p.id
      WHERE COALESCE(p.school_id, sm.school_id) IS NOT NULL
    )
    SELECT s.id, s.owner_id
    FROM public.students s
    JOIN owner_school os ON os.owner_id = s.owner_id
    JOIN public.schools sc ON sc.id = os.school_id
    WHERE (s.data->>'anonymizedAt') IS NULL
      AND (
        SELECT MAX(public.try_timestamptz(sr.data->>'gradedAt'))
        FROM public.student_rubrics sr
        WHERE sr.student_id = s.id
      ) < now() - make_interval(years => sc.retention_years)
  LOOP
    BEGIN
      PERFORM public.anonymize_student(v_student.id, v_student.owner_id);
      v_count := v_count + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      v_last_error := SQLERRM;
      RAISE WARNING 'anonymize_overdue_students: student % failed: %', v_student.id, SQLERRM;
    END;
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, category, action, entity_type, details)
  VALUES (
    NULL, 'admin', 'retention_anonymize', 'student',
    jsonb_build_object('anonymized', v_count, 'failed', v_failed, 'last_error', v_last_error)
  );

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students() FROM PUBLIC, anon, authenticated;
