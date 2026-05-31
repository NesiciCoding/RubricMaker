-- Migration 020: Serialize first-admin assignment with an advisory lock.
--
-- Two concurrent first sign-ups could both see an empty profiles table and
-- both get role='admin'.  pg_advisory_xact_lock serializes the EXISTS check
-- within a transaction so only one session wins the admin slot.

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
    -- Serialize first-admin assignment: only one session evaluates this at a time.
    PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user.first_admin')::bigint);
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
