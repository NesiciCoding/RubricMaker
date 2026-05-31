-- Migration 015: Auto-assign 'student' role when a new user's email
-- matches an existing student record.
--
-- Before this change, every new sign-up got role='user' and had to be
-- manually demoted to 'student' by an admin before the student portal
-- would activate.  Now the trigger detects the match at sign-in time.
--
-- The function already runs as SECURITY DEFINER so it can read public.students
-- without RLS restrictions.

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

  -- Auto-detect students: email present and matches a teacher-imported student record.
  IF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    v_role := 'student';
  ELSE
    -- First user ever becomes admin; every subsequent user starts as 'user'.
    SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'user' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
