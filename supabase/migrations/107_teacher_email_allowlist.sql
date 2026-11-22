-- Migration 107: only staff addresses may start as 'teacher'.
--
-- handle_new_user() (latest: 092-era bootstrap) gave role='teacher' to every sign-up that was not
-- anonymous and not on a teacher's roster, so any student at a school whose address the teacher had
-- not imported became a teacher. Teacher is now granted only when the email passes
-- site_config 'teacher_email_rules':
--   {"domains": ["academie-tien.nl"], "blockNumericLocalPart": true}
-- Everyone else starts as 'student' (no data access until a roster row matches their verified
-- email); an admin can still promote anybody by hand. With no rules row the old behaviour is kept,
-- so self-hosted deployments that do not set the key are unaffected.

CREATE OR REPLACE FUNCTION public.is_teacher_email(p_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules   jsonb;
  v_email   text := lower(btrim(p_email));
  v_local   text;
  v_domain  text;
BEGIN
  SELECT value INTO v_rules FROM public.site_config WHERE key = 'teacher_email_rules';
  IF v_rules IS NULL THEN
    RETURN true;
  END IF;

  IF v_email IS NULL OR position('@' IN v_email) = 0 THEN
    RETURN false;
  END IF;

  v_local  := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(v_rules->'domains', '[]'::jsonb)) d
    WHERE lower(btrim(d)) = v_domain
  ) THEN
    RETURN false;
  END IF;

  IF coalesce((v_rules->>'blockNumericLocalPart')::boolean, true) AND v_local ~ '^[0-9]' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_teacher_email(text) FROM PUBLIC, anon, authenticated;

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
    v_role := 'student';

  ELSIF new.email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.profiles owner_p ON owner_p.id = s.owner_id
    WHERE s.data->>'email' IS NOT NULL
      AND lower(s.data->>'email') = lower(new.email)
      AND owner_p.role IN ('teacher', 'admin')
  ) THEN
    v_role := 'student';

  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user:first_admin'));

    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE NOT (role = 'student' AND email IS NULL) LIMIT 1
      ) THEN 'admin'
      WHEN public.is_teacher_email(new.email) THEN 'teacher'
      ELSE 'student'
    END INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
