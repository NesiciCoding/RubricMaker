-- Migration 009: Enrich handle_new_user() for OAuth providers
-- Updates the trigger so display_name is populated from Google / Microsoft metadata
-- on first sign-in, instead of remaining empty.

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
  -- First user ever becomes admin; everyone else starts as user.
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'user' ELSE 'admin' END
    INTO v_role;

  -- Extract display name from OAuth provider metadata.
  -- Google sets full_name; Microsoft sets name; email is the final fallback.
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
