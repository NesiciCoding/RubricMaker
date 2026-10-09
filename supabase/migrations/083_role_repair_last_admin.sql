-- Migration 083: let operators repair roles, and never leave the instance without an admin (#629).
--
-- protect_role_changes() (latest: 037) required get_my_role() = 'admin', which reads auth.uid().
-- A direct database connection (Supabase SQL editor, psql) or the service-role key has no user,
-- so an operator could not repair a role at all, and the last admin demoting themselves (Users tab,
-- or picking Student in onboarding) locked everyone out.
--
-- Operator requests are recognised by their request claims: a direct connection has none, and the
-- service-role key carries role = 'service_role'. PostgREST always sets the claims for API requests,
-- so a signed-in or anonymous client can never look like an operator. Operators skip both checks.

CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  IF v_request_role IS NULL OR v_request_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.id = auth.uid() AND OLD.role = 'teacher' AND NEW.role = 'student')
     AND get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;

  IF OLD.role = 'admin' THEN
    -- Serialises concurrent demotions so two admins cannot remove each other at the same time.
    PERFORM pg_advisory_xact_lock(hashtext('public.protect_role_changes:last_admin'));
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE role = 'admin' AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot remove the last admin'
        USING HINT = 'Promote another user to admin first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_role_changes() FROM PUBLIC, anon, authenticated;
