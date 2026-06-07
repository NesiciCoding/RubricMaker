-- Migration 027: Revoke anon/authenticated execute on internal SECURITY DEFINER helpers
--
-- Supabase grants EXECUTE to anon, authenticated, and service_role individually
-- (not via PUBLIC), so REVOKE FROM PUBLIC in migration 026 had no effect.
-- This migration targets each role explicitly.
--
-- Rules:
--   anon          — should never call any of these helpers directly via /rpc/
--   authenticated — may call helpers that back RLS policies; must NOT call
--                   trigger-only functions or anonymization functions
--   service_role  — kept on anonymization functions (pg_cron / Edge Functions)

-- ── Trigger functions: no RPC access for anyone ───────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_role_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()    FROM anon, authenticated;

-- ── Anonymization: service_role only ─────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students()   FROM anon, authenticated;

-- ── RLS helpers: authenticated only (anon should not call these via /rpc/) ────
REVOKE EXECUTE ON FUNCTION public.get_my_role()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_student_ids()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_class_ids_as_student()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_rubric_ids_as_student()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_essay_assignment_ids()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_class_owner(text, uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_class_member(text, uuid)       FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_rubric_owner(text, uuid)       FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share(text, uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share_edit(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lookup_school_by_id(uuid)         FROM anon;
