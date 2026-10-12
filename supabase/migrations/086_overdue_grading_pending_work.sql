-- #665: "overdue grading" now means handed-in work that is still waiting for a grade past the
-- teacher's threshold, counted once per test or essay. It used to count every student whose most
-- recent grade was older than the threshold, which flagged nearly the whole roster and never
-- included students who had handed something in but were never graded.
--
-- Mirrors findPendingGrading() (src/utils/pendingGrading.ts):
--   * tests: student_tests rows with status 'submitted' (not yet graded), submittedAt past the
--     threshold, one group per testId;
--   * essays: offline essay submissions with no live, non-peer grade for that student and rubric
--     given at or after the hand-in, one group per teacherKey;
--   * archived students are left out.
-- ISO-8601 timestamps compare correctly as text, as in the client.

CREATE OR REPLACE FUNCTION public.get_overdue_grading_count(target_owner uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH threshold AS (
    SELECT now() - (COALESCE(
      (SELECT (settings->>'overdueReminderThreshold')::int FROM public.user_settings WHERE user_id = target_owner),
      7
    ) || ' days')::interval AS cutoff
  ),
  active_students AS (
    SELECT id
    FROM public.students
    WHERE owner_id = target_owner AND COALESCE(data->>'archivedAt', '') = ''
  ),
  waiting_tests AS (
    SELECT DISTINCT st.data->>'testId' AS test_id
    FROM public.student_tests st, threshold
    WHERE st.owner_id = target_owner
      AND st.data->>'status' = 'submitted'
      AND st.data->>'submittedAt' IS NOT NULL
      AND (st.data->>'submittedAt')::timestamptz <= threshold.cutoff
      AND st.data->>'studentId' IN (SELECT id FROM active_students)
  ),
  waiting_essays AS (
    SELECT DISTINCT es.data->>'teacherKey' AS teacher_key
    FROM public.essay_offline_submissions es, threshold
    WHERE es.owner_id = target_owner
      AND es.data->>'submittedAt' IS NOT NULL
      AND (es.data->>'submittedAt')::timestamptz <= threshold.cutoff
      AND es.data->>'assignmentStudentId' IN (SELECT id FROM active_students)
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_rubrics sr
        WHERE sr.grader_id = target_owner
          AND sr.is_peer_review = false
          AND sr.student_id = es.data->>'assignmentStudentId'
          AND sr.rubric_id = es.data->>'assignmentRubricId'
          AND COALESCE(sr.data->>'deletedAt', '') = ''
          AND sr.data->>'gradedAt' >= es.data->>'submittedAt'
      )
  )
  SELECT ((SELECT count(*) FROM waiting_tests) + (SELECT count(*) FROM waiting_essays))::int;
$$;

REVOKE ALL ON FUNCTION public.get_overdue_grading_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_grading_count(uuid) TO service_role;
