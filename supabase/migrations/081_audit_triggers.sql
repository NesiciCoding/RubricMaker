-- Migration 081: server-side audit entries for sensitive changes (#621).
--
-- Client-side logAuditEvent is fire-and-forget and runs even when RLS silently
-- turned an update/delete into a no-op, so it can record changes that never
-- happened and misses changes made elsewhere (Studio, SQL, other clients).
-- These AFTER triggers write the entry in the same transaction as the change,
-- so an entry exists exactly when the change committed. Actor = auth.uid()
-- (NULL for service/cron/SQL sessions without a profile).
--
-- Covered: role changes and school join/leave on profiles, school membership
-- additions/removals, school create/update/delete, rubric shares and class
-- collaborators (grant/change/revoke), school sharing of rubrics and comment
-- bank items, and site_config changes (key only — values can hold API keys). Student password changes and erase_my_data already write their
-- own entries server-side (set-student-password edge function, migration 080).

CREATE OR REPLACE FUNCTION public.write_audit_entry(
  p_category    text,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_details     jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, category, action, entity_type, entity_id, details)
  VALUES (
    (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid()),
    p_category, p_action, p_entity_type, p_entity_id, p_details
  );
EXCEPTION WHEN others THEN
  -- Auditing must never block the change it describes.
  RAISE WARNING 'audit entry % failed: %', p_action, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_audit_entry(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── profiles: role changes and school join/leave ─────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_profiles_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.write_audit_entry('admin', 'role_change', 'user', NEW.id::text,
      jsonb_build_object('from', OLD.role, 'to', NEW.role));
  END IF;
  IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    PERFORM public.write_audit_entry('admin',
      CASE WHEN NEW.school_id IS NULL THEN 'school_leave' ELSE 'school_join' END,
      'user', NEW.id::text,
      jsonb_build_object('from', OLD.school_id, 'to', NEW.school_id));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_profiles_change ON public.profiles;
CREATE TRIGGER audit_profiles_change
  AFTER UPDATE OF role, school_id ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.school_id IS DISTINCT FROM NEW.school_id)
  EXECUTE FUNCTION public.audit_profiles_change();

-- ── school_members: members added / removed ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_school_members_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_entry('admin', 'member_added', 'school', NEW.school_id::text,
      jsonb_build_object('profile_id', NEW.profile_id));
  ELSE
    PERFORM public.write_audit_entry('admin', 'member_removed', 'school', OLD.school_id::text,
      jsonb_build_object('profile_id', OLD.profile_id));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_school_members_change ON public.school_members;
CREATE TRIGGER audit_school_members_change
  AFTER INSERT OR DELETE ON public.school_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_members_change();

-- ── schools: create / update / delete ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_schools_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit_entry('admin', 'school_create', 'school', NEW.id::text,
      jsonb_build_object('name', NEW.name, 'retention_years', NEW.retention_years));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.write_audit_entry('admin', 'school_update', 'school', NEW.id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'name', CASE WHEN NEW.name IS DISTINCT FROM OLD.name
                     THEN jsonb_build_object('from', OLD.name, 'to', NEW.name) END,
        'retention_years', CASE WHEN NEW.retention_years IS DISTINCT FROM OLD.retention_years
                     THEN jsonb_build_object('from', OLD.retention_years, 'to', NEW.retention_years) END)));
  ELSE
    PERFORM public.write_audit_entry('admin', 'school_delete', 'school', OLD.id::text,
      jsonb_build_object('name', OLD.name));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_schools_change ON public.schools;
CREATE TRIGGER audit_schools_change
  AFTER INSERT OR DELETE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.audit_schools_change();

DROP TRIGGER IF EXISTS audit_schools_update ON public.schools;
CREATE TRIGGER audit_schools_update
  AFTER UPDATE OF name, retention_years ON public.schools
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.retention_years IS DISTINCT FROM NEW.retention_years)
  EXECUTE FUNCTION public.audit_schools_change();

-- ── rubrics / comment bank: shared with or withdrawn from the school ─────────
CREATE OR REPLACE FUNCTION public.audit_school_share_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shared boolean := COALESCE(NEW.data->'sharedWithSchool' = 'true'::jsonb, false);
BEGIN
  PERFORM public.write_audit_entry('admin',
    CASE WHEN v_shared THEN 'school_share' ELSE 'school_unshare' END,
    TG_ARGV[0], NEW.id::text,
    jsonb_build_object('owner_id', NEW.owner_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_rubrics_share ON public.rubrics;
CREATE TRIGGER audit_rubrics_share
  AFTER UPDATE OF data ON public.rubrics
  FOR EACH ROW
  WHEN (COALESCE(OLD.data->'sharedWithSchool' = 'true'::jsonb, false)
        IS DISTINCT FROM COALESCE(NEW.data->'sharedWithSchool' = 'true'::jsonb, false))
  EXECUTE FUNCTION public.audit_school_share_change('rubric');

DROP TRIGGER IF EXISTS audit_comment_bank_share ON public.comment_bank;
CREATE TRIGGER audit_comment_bank_share
  AFTER UPDATE OF data ON public.comment_bank
  FOR EACH ROW
  WHEN (COALESCE(OLD.data->'sharedWithSchool' = 'true'::jsonb, false)
        IS DISTINCT FROM COALESCE(NEW.data->'sharedWithSchool' = 'true'::jsonb, false))
  EXECUTE FUNCTION public.audit_school_share_change('comment_bank');

-- ── rubric_shares / class_members: per-user share grants ─────────────────────
-- TG_ARGV: entity type, column holding the shared entity's id, column holding the access level.
CREATE OR REPLACE FUNCTION public.audit_share_grant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   jsonb := to_jsonb(COALESCE(NEW, OLD));
  v_old   jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new   jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
BEGIN
  IF TG_OP = 'UPDATE' AND v_old->>TG_ARGV[2] IS NOT DISTINCT FROM v_new->>TG_ARGV[2] THEN
    RETURN NULL;
  END IF;
  PERFORM public.write_audit_entry('admin',
    CASE TG_OP WHEN 'INSERT' THEN 'share_grant' WHEN 'UPDATE' THEN 'share_change' ELSE 'share_revoke' END,
    TG_ARGV[0], v_row->>TG_ARGV[1],
    jsonb_strip_nulls(jsonb_build_object(
      'user_id', v_row->>'user_id',
      'from', v_old->>TG_ARGV[2],
      'to', v_new->>TG_ARGV[2])));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_rubric_shares_change ON public.rubric_shares;
CREATE TRIGGER audit_rubric_shares_change
  AFTER INSERT OR DELETE OR UPDATE OF mode ON public.rubric_shares
  FOR EACH ROW EXECUTE FUNCTION public.audit_share_grant_change('rubric', 'rubric_id', 'mode');

DROP TRIGGER IF EXISTS audit_class_members_change ON public.class_members;
CREATE TRIGGER audit_class_members_change
  AFTER INSERT OR DELETE OR UPDATE OF role ON public.class_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_share_grant_change('class', 'class_id', 'role');

-- ── site_config: any change (key only) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_site_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_audit_entry('admin', 'site_config_' || lower(TG_OP), 'site_config',
    COALESCE(NEW.key, OLD.key), NULL);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_site_config_change ON public.site_config;
CREATE TRIGGER audit_site_config_change
  AFTER INSERT OR UPDATE OR DELETE ON public.site_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_site_config_change();
