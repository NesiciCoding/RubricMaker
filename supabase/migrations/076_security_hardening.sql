-- Migration 076: Tighten a few write paths that relied on client behaviour.
--
-- Each change is a guard trigger or a narrower grant rather than a policy rewrite,
-- so existing client flows keep working. Triggers only constrain requests that carry
-- a user JWT (auth.uid() IS NOT NULL); service-role and definer paths are unaffected.

-- ── 1. profiles: identity columns are not client-editable ────────────────────
-- profiles.email feeds roster matching; changing it must not be possible from a client.
CREATE OR REPLACE FUNCTION public.protect_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Profile id cannot be changed';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Profile email cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_identity ON public.profiles;
CREATE TRIGGER profiles_protect_identity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_identity();

REVOKE EXECUTE ON FUNCTION public.protect_profile_identity() FROM PUBLIC, anon, authenticated;

-- ── 2. Student identity comes from the confirmed auth email ──────────────────
CREATE OR REPLACE FUNCTION public.get_my_verified_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(u.email)
  FROM   auth.users u
  WHERE  u.id = auth.uid()
    AND  u.email IS NOT NULL
    AND  u.email_confirmed_at IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_verified_email() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_verified_email() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_student_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id
  FROM   public.students s
  WHERE  s.data->>'email' IS NOT NULL
    AND  lower(s.data->>'email') = public.get_my_verified_email()
$$;

CREATE OR REPLACE FUNCTION public.get_my_class_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT s.class_id
  FROM   public.students s
  WHERE  s.data->>'email' IS NOT NULL
    AND  lower(s.data->>'email') = public.get_my_verified_email()
$$;

CREATE OR REPLACE FUNCTION public.get_my_rubric_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT sr.rubric_id
  FROM   public.student_rubrics sr
  JOIN   public.students s ON s.id = sr.student_id
  WHERE  s.data->>'email' IS NOT NULL
    AND  lower(s.data->>'email') = public.get_my_verified_email()
$$;

-- ── 3. New accounts match the roster only against teacher/admin-owned rows ───
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

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE NOT (
        role = 'student' AND email IS NULL
      ) LIMIT 1
    ) THEN 'teacher' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 4. rubrics: shared editors cannot reassign ownership ─────────────────────
CREATE OR REPLACE FUNCTION public.protect_rubric_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.id IS DISTINCT FROM OLD.id)
     AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Only the owner can change rubric ownership';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rubrics_protect_owner ON public.rubrics;
CREATE TRIGGER rubrics_protect_owner
  BEFORE UPDATE ON public.rubrics
  FOR EACH ROW EXECUTE FUNCTION public.protect_rubric_owner();

REVOKE EXECUTE ON FUNCTION public.protect_rubric_owner() FROM PUBLIC, anon, authenticated;

-- ── 5. marketplace_listings: only descriptive columns are updatable ──────────
-- Migration 053's blanket grant re-opened table-level UPDATE; restore the column list from 040.
REVOKE UPDATE ON public.marketplace_listings FROM authenticated;
GRANT UPDATE (name, subject, description, attribution) ON public.marketplace_listings TO authenticated;

-- ── 6. messages: a student may only change read_by_student ───────────────────
CREATE OR REPLACE FUNCTION public.protect_message_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN
    IF (to_jsonb(NEW) - 'read_by_student') IS DISTINCT FROM (to_jsonb(OLD) - 'read_by_student') THEN
      RAISE EXCEPTION 'Students can only update the read state of a message';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_protect_columns ON public.messages;
CREATE TRIGGER messages_protect_columns
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_columns();

REVOKE EXECUTE ON FUNCTION public.protect_message_columns() FROM PUBLIC, anon, authenticated;

-- ── 7. attachments: the creation time used by retention is server-set ───────
CREATE OR REPLACE FUNCTION public.set_attachment_created_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attachments_set_created_at ON public.attachments;
CREATE TRIGGER attachments_set_created_at
  BEFORE INSERT ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_attachment_created_at();
