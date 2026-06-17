-- Migration 037: Compliance-grade audit log.
-- Tracks admin actions (3 yr), grade/rubric edits (1 yr), export & auth events (1 mo).
-- pg_cron is enabled here; also activates the anonymize_overdue_students() schedule
-- that has been commented out since migration 017.

-- ── 1. Enable pg_cron ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 2. audit_logs table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  category    text        NOT NULL
                          CHECK (category IN ('admin', 'grade', 'export', 'auth')),
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx    ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_category_idx ON public.audit_logs (category);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON public.audit_logs (created_at DESC);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins see every entry; teachers see only their own.
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- Authenticated users can only insert rows attributed to themselves.
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Deletion is cron-only; no user or app code deletes audit rows directly.
-- The cron job runs as postgres (superuser) and bypasses RLS.

-- ── 4. Retention cleanup (pg_cron) ───────────────────────────────────────────
SELECT cron.schedule(
  'audit-cleanup-admin',
  '15 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE category = 'admin'  AND created_at < now() - interval '3 years' $$
);

SELECT cron.schedule(
  'audit-cleanup-grade',
  '20 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE category = 'grade'  AND created_at < now() - interval '1 year' $$
);

SELECT cron.schedule(
  'audit-cleanup-export-auth',
  '25 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE category IN ('export','auth') AND created_at < now() - interval '1 month' $$
);

-- ── 5. Activate the long-pending student anonymization schedule ────────────────
-- anonymize_overdue_students() has existed since migration 017 but was never scheduled.
SELECT cron.schedule(
  'anonymize-overdue-students',
  '0 2 * * *',
  $$ SELECT public.anonymize_overdue_students() $$
);
