-- #1116-5 (finding #18): batch variants of the scheduled-digest count RPCs.
--
-- The nightly scheduled-digest edge function called get_pending_moderation_count /
-- get_overdue_grading_count / get_unread_messages_count once per opted-in teacher
-- (up to 3xN sequential round trips). These batch variants accept the full owner
-- id array and return per-owner counts in one query each (GROUP BY owner), so the
-- function needs exactly 3 RPC calls total.
--
-- Each mirrors its single-owner sibling row-for-row (059_scheduled_digest.sql,
-- 066_notification_dismissals.sql, 085_moderation_resolved.sql,
-- 086_overdue_grading_pending_work.sql) — same predicates, same guards — only
-- grouped. Same SECURITY DEFINER / service_role-only posture as the originals.

-- ── 1. Pending moderation, batched ──────────────────────────────────────────
-- Mirrors get_pending_moderation_count(target_owner) (085): open second-marker
-- reviews with a baseline grade, skipping moderationResolvedAt-stamped rows.
CREATE OR REPLACE FUNCTION public.get_pending_moderation_counts(target_owners uuid[])
RETURNS TABLE (owner_id uuid, count int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.grader_id AS owner_id, count(*)::int AS count
  FROM public.student_rubrics sr
  WHERE sr.grader_id = ANY (target_owners)
    AND sr.is_peer_review = true
    AND sr.data->>'gradedBy' IS NOT NULL
    AND sr.data->>'moderationResolvedAt' IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.owner_id = sr.grader_id AND s.id = sr.data->>'gradedBy'
    )
    AND EXISTS (
      SELECT 1 FROM public.student_rubrics baseline
      WHERE baseline.grader_id = sr.grader_id
        AND baseline.is_peer_review = false
        AND baseline.rubric_id = sr.rubric_id
        AND baseline.student_id = sr.student_id
    )
  GROUP BY sr.grader_id;
$$;

REVOKE ALL ON FUNCTION public.get_pending_moderation_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_moderation_counts(uuid[]) TO service_role;

-- ── 2. Overdue grading, batched ─────────────────────────────────────────────
-- Mirrors get_overdue_grading_count(target_owner) (086): handed-in tests/essays
-- past the per-owner overdueReminderThreshold, counted once per test/essay group.
CREATE OR REPLACE FUNCTION public.get_overdue_grading_counts(target_owners uuid[])
RETURNS TABLE (owner_id uuid, count int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH thresholds AS (
    SELECT u.owner AS owner_id,
           now() - (COALESCE(
             (SELECT CASE WHEN settings->>'overdueReminderThreshold' ~ '^\d{1,4}$'
                          THEN (settings->>'overdueReminderThreshold')::int END
              FROM public.user_settings WHERE user_id = u.owner),
             7
           ) || ' days')::interval AS cutoff
    FROM (SELECT DISTINCT unnest(target_owners) AS owner) u
  ),
  waiting_tests AS (
    SELECT st.owner_id AS owner_id, st.data->>'testId' AS test_id
    FROM public.student_tests st
    JOIN thresholds th ON th.owner_id = st.owner_id
    WHERE st.data->>'status' = 'submitted'
      AND public.try_timestamptz(st.data->>'submittedAt') <= th.cutoff
      AND st.data->>'studentId' IN (
        SELECT id FROM public.students s
        WHERE s.owner_id = st.owner_id AND COALESCE(s.data->>'archivedAt', '') = ''
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tests t
        WHERE t.id = st.data->>'testId'
          AND t.owner_id = st.owner_id
          AND t.data->>'mode' = 'practice'
      )
    GROUP BY st.owner_id, st.data->>'testId'
  ),
  waiting_essays AS (
    SELECT es.owner_id AS owner_id, es.data->>'teacherKey' AS teacher_key
    FROM public.essay_offline_submissions es
    JOIN thresholds th ON th.owner_id = es.owner_id
    WHERE public.try_timestamptz(es.data->>'submittedAt') <= th.cutoff
      AND es.data->>'assignmentStudentId' IN (
        SELECT id FROM public.students s
        WHERE s.owner_id = es.owner_id AND COALESCE(s.data->>'archivedAt', '') = ''
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.student_rubrics sr
        WHERE sr.grader_id = es.owner_id
          AND sr.is_peer_review = false
          AND sr.student_id = es.data->>'assignmentStudentId'
          AND sr.rubric_id = es.data->>'assignmentRubricId'
          AND COALESCE(sr.data->>'deletedAt', '') = ''
          AND sr.data->>'gradedAt' >= es.data->>'submittedAt'
      )
    GROUP BY es.owner_id, es.data->>'teacherKey'
  ),
  per_owner AS (
    SELECT owner_id, count(*)::int AS n FROM waiting_tests GROUP BY owner_id
    UNION ALL
    SELECT owner_id, count(*)::int AS n FROM waiting_essays GROUP BY owner_id
  )
  SELECT th.owner_id AS owner_id, COALESCE(sum(p.n), 0)::int AS count
  FROM thresholds th
  LEFT JOIN per_owner p ON p.owner_id = th.owner_id
  GROUP BY th.owner_id;
$$;

REVOKE ALL ON FUNCTION public.get_overdue_grading_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_grading_counts(uuid[]) TO service_role;

-- ── 3. Unread student messages, batched ─────────────────────────────────────
-- Mirrors get_unread_messages_count(target_owner) (066): distinct unread student
-- threads, not raw rows.
CREATE OR REPLACE FUNCTION public.get_unread_messages_counts(target_owners uuid[])
RETURNS TABLE (owner_id uuid, count int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.owner_id AS owner_id, count(DISTINCT (m.student_id, m.context_type, m.context_id))::int AS count
  FROM public.messages m
  WHERE m.owner_id = ANY (target_owners)
    AND m.sender = 'student'
    AND m.read_by_teacher = false
  GROUP BY m.owner_id;
$$;

REVOKE ALL ON FUNCTION public.get_unread_messages_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_messages_counts(uuid[]) TO service_role;
