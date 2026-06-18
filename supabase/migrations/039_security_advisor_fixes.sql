-- Migration 036: Fix two real Supabase advisor security warnings
--
-- 1. rls_policy_always_true — client_logs INSERT
--    WITH CHECK (true) lets any authenticated user insert rows with an arbitrary
--    user_id (spoofing another user's identity in the log). Constrain user_id to
--    the calling user: either NULL (anonymous/unauthenticated context) or their
--    own auth.uid().
--
-- 2. pg_graphql_anon_table_exposed — _migrations
--    The _migrations table is Supabase CLI bookkeeping. It has no business being
--    discoverable or queryable via the PostgREST/GraphQL API. Revoke SELECT from
--    both anon and authenticated.

-- ── 1. Tighten client_logs INSERT policy ─────────────────────────────────────

DROP POLICY IF EXISTS "client_logs_insert" ON public.client_logs;

CREATE POLICY "client_logs_insert"
  ON public.client_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));

-- ── 2. Hide _migrations from the API ─────────────────────────────────────────
-- The table only exists in cloud Supabase projects; local stacks skip it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_migrations'
  ) THEN
    REVOKE SELECT ON TABLE public._migrations FROM anon;
    REVOKE SELECT ON TABLE public._migrations FROM authenticated;
  END IF;
END;
$$;
