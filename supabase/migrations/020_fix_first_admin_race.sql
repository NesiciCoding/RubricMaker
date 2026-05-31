-- Migration 020: Serialize first-admin assignment with an advisory lock.
--
-- Two concurrent sign-ups could both see an empty profiles table and both get
-- role='admin'.  The lock is acquired before ANY role check so student and
-- non-student races are also serialized.
--
-- The admin existence test excludes student profiles so a student being the
-- very first signup does not prevent a teacher/admin from ever being created.

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

  -- Serialize all concurrent sign-ups so student and non-student paths don't race.
  PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user.first_admin')::bigint);

  -- Auto-detect students: email present and matches a teacher-imported student record.
  IF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    v_role := 'student';
  ELSE
    -- First non-student ever becomes admin; ignore student rows when checking.
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE role <> 'student' LIMIT 1
    ) THEN 'user' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
