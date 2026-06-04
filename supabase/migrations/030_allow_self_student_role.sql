-- Migration 026: Allow users to set their own role to 'student'
-- Teachers who log in and choose "Student" in onboarding can self-assign the
-- student role without admin intervention. All other role changes still require
-- an admin (e.g. promoting someone to 'admin' or 'user').

CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Allow a user to downgrade their own role from 'user' to 'student'.
    -- This supports the onboarding "I'm a student" flow.
    IF NEW.id = auth.uid() AND OLD.role = 'user' AND NEW.role = 'student' THEN
      RETURN NEW;
    END IF;
    -- All other role changes require admin privileges.
    IF get_my_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
