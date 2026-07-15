-- Migration 059: pg_cron-triggered teacher-facing email digest infrastructure (Phase 21.6).
-- Every prior email this app sends (notify-student-graded, notify-student-message) is
-- fired synchronously from a frontend action and addressed to a student. This is the
-- first scheduled, teacher-facing send, so it needs its own dispatch path: pg_cron calls
-- OUT to an edge function via pg_net (raw SQL can't reach the auth mailer the edge
-- function uses), same service-role bearer-token pattern as nightly-backup.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Approximates ModerationQueuePage's pending-dispute count for the digest: a peer-review
-- (second-marker) grade exists whose gradedBy isn't one of the owner's own students
-- (mirrors isSecondMarkerEntry's colleague-vs-student fallback heuristic in
-- coGradingModerationQueue.ts) and a baseline grade exists for the same rubric/student.
-- Deliberately does not recompute the point-delta threshold — that's a client-only,
-- unpersisted UI setting on /moderation — so this counts every open second-marker
-- review, a reasonable "you have work waiting" digest number even where it's wider than
-- the in-app filtered list.
CREATE OR REPLACE FUNCTION public.get_pending_moderation_count(target_owner uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.student_rubrics sr
  WHERE sr.grader_id = target_owner
    AND sr.is_peer_review = true
    AND sr.data->>'gradedBy' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.owner_id = target_owner AND s.id = sr.data->>'gradedBy'
    )
    AND EXISTS (
      SELECT 1 FROM public.student_rubrics baseline
      WHERE baseline.grader_id = target_owner
        AND baseline.is_peer_review = false
        AND baseline.rubric_id = sr.rubric_id
        AND baseline.student_id = sr.student_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_pending_moderation_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_moderation_count(uuid) TO service_role;

-- ── Nightly schedule: call the scheduled-digest edge function ────────────────────────
-- net.http_post needs this project's URL and service-role key, which aren't available
-- to a shared migration file. Set them once per deployment (see docs/SELF_HOSTING_OPS.md
-- for the self-hosted steps; on Supabase Cloud run this from the SQL Editor after
-- deploying the function):
--   ALTER DATABASE postgres SET app.settings.project_url = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
-- Until those are set, current_setting(..., true) returns NULL and the job's http_post
-- calls fail silently (visible in cron.job_run_details) rather than blocking this migration.
SELECT cron.schedule(
  'teacher-email-digest',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.project_url', true) || '/functions/v1/scheduled-digest',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
  $$
);
