-- Migration 028: Assign role='student' to anonymous sign-in users
--
-- The handle_new_user() trigger previously fell through to role='user' for
-- anonymous sign-ins because they have no email and are not the first user.
-- role='user' caused profiles_read_users_and_admins to let anonymous sessions
-- enumerate all teacher email addresses via the REST API.
--
-- Fix: detect new.is_anonymous (set by Supabase for signInAnonymously()) and
-- assign role='student'. Students cannot read all profiles (that policy requires
-- 'user' or 'admin'). Migration 027 adds a belt-and-suspenders is_anonymous
-- guard to the same policy.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  IF new.is_anonymous THEN
    -- Anonymous sign-ins are always essay-submitting students.
    -- Give them 'student' role so they cannot enumerate teacher profiles.
    v_role := 'student';

  ELSIF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    -- Email matches a teacher-imported student record.
    v_role := 'student';

  ELSE
    -- First real user ever becomes admin; all others start as teacher ('user').
    -- Advisory lock prevents two concurrent first sign-ups both seeing "no profiles"
    -- and both committing as admin. Lock is released automatically at transaction end.
    PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user:first_admin'));

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE NOT (
        -- Ignore profiles created for anonymous users when counting first-admin
        -- (they have no email and were just assigned 'student').
        role = 'student' AND email IS NULL
      ) LIMIT 1
    ) THEN 'user' ELSE 'admin' END
    INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
