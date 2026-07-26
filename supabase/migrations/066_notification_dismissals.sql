-- Migration 066: Notification Center (roadmap Phase 30).
-- (Numbered 066/067, not 065 — 065 is taken by the concurrently-developed Phase 29 PR.)
--
-- 30.1: notification_dismissals is a per-owner snooze list for the two notification
-- types that had no persisted per-item state before this (overdue grading previously
-- used a localStorage-only dismissal, Phase 28.1; moderation-pending had no dismiss
-- concept at all). Unread messages need no new state here — Message.read_by_teacher
-- (050_messages.sql) is already real, owner-scoped, cross-device state, so "dismissing"
-- a message notification is just marking the message read via the existing path.
--
-- A dismissal is a snooze, not a resolve: it hides the notification until `fingerprint`
-- changes (e.g. the student is graded again and later goes overdue again; the second-
-- marker entry is re-submitted), mirroring the lastGradedAt-keyed dismissal semantics
-- Phase 28.1 established. id = '<type>:<entityId>' — globally unique since student ids
-- and student_rubrics ids are already unique across the whole app, not just per owner.
--
-- 30.2: get_overdue_grading_count()/get_unread_messages_count() extend the per-category
-- digest count helpers alongside the existing get_pending_moderation_count() (059).

-- ── 1. notification_dismissals table ─────────────────────────────────────────────
-- Same jsonb-doc shape as document_comments (062)/question_bank_items (061): one
-- table, owner-only RLS, no columns beyond id/owner_id needed since nothing here is
-- queried by type/entity_id server-side — the client reads the whole owner-scoped set.

CREATE TABLE IF NOT EXISTS public.notification_dismissals (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS notification_dismissals_owner_idx ON public.notification_dismissals(owner_id);

ALTER TABLE public.notification_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_dismissals_owner_all" ON public.notification_dismissals;
CREATE POLICY "notification_dismissals_owner_all"
  ON public.notification_dismissals FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 2. Digest count helpers (30.2), same SECURITY DEFINER/service_role-only shape ──
-- as get_pending_moderation_count (059_scheduled_digest.sql).

-- Mirrors useOverdueStudents.ts: most-recent graded_at per student (ISO-8601 strings,
-- so lexicographic MAX matches chronological MAX, same assumption messageThreads.ts's
-- createdAt.localeCompare sort already relies on), compared against the owner's own
-- Settings.overdueReminderThreshold (default 7, matching the client default).
CREATE OR REPLACE FUNCTION public.get_overdue_grading_count(target_owner uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH threshold AS (
    SELECT COALESCE(
      (SELECT (settings->>'overdueReminderThreshold')::int FROM public.user_settings WHERE user_id = target_owner),
      7
    ) AS days
  ),
  last_graded AS (
    SELECT student_id, MAX(data->>'gradedAt') AS graded_at
    FROM public.student_rubrics
    WHERE grader_id = target_owner AND is_peer_review = false AND data->>'gradedAt' IS NOT NULL
    GROUP BY student_id
  )
  SELECT count(*)::int
  FROM last_graded, threshold
  WHERE graded_at::timestamptz < now() - (threshold.days || ' days')::interval;
$$;

REVOKE ALL ON FUNCTION public.get_overdue_grading_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_grading_count(uuid) TO service_role;

-- Mirrors groupMessageThreads()/countUnreadByTeacher() (messageThreads.ts): counts
-- distinct (student_id, context_type, context_id) threads with at least one unread
-- student message, not raw unread message rows.
CREATE OR REPLACE FUNCTION public.get_unread_messages_count(target_owner uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT (student_id, context_type, context_id))::int
  FROM public.messages
  WHERE owner_id = target_owner AND sender = 'student' AND read_by_teacher = false;
$$;

REVOKE ALL ON FUNCTION public.get_unread_messages_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_messages_count(uuid) TO service_role;

-- ── 3. Include notification_dismissals in the nightly owner backup ─────────────
-- Full replacement of export_owner_backup (063 was the last to touch it), same body
-- plus the new table appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flashes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flashes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flash_reads',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flash_reads t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('question_bank_items',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.question_bank_items t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('document_comments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.document_comments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('placement_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.placement_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('notification_dismissals',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.notification_dismissals t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;
