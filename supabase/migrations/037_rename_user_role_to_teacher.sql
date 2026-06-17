-- Migration 036: Rename role value 'user' → 'teacher' throughout profiles.
-- The old value 'user' was ambiguous; 'teacher' is the explicit, correct label.

-- ── 1. Drop the existing CHECK constraint (auto-named in migration 007) ────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ── 2. Migrate existing data ──────────────────────────────────────────────────
UPDATE public.profiles SET role = 'teacher' WHERE role = 'user';

-- ── 3. New default + CHECK constraint ─────────────────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'teacher';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'teacher', 'student'));

-- ── 4. Update RLS policy that hard-coded 'user' in the IN list ───────────────
-- Migration 009 created profiles_read_users_and_admins with IN ('user','admin').
DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;
CREATE POLICY "profiles_read_users_and_admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND get_my_role() IN ('teacher', 'admin')
  );

-- ── 5. Replace handle_new_user() — assigns 'teacher' instead of 'user' ────────
-- Replaces migration 028's version; changes: 'user' → 'teacher' in fallback role
-- and lock name; preserves the is_anonymous → 'student' branch from migration 028.
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
    v_role := 'student';

  ELSIF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
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

-- ── 6. Update protect_role_changes() — allow 'teacher' → 'student' self-downgrade
-- Replaces migration 030's version which checked OLD.role = 'user'.
CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Allow a user to downgrade their own role from 'teacher' to 'student'.
    IF NEW.id = auth.uid() AND OLD.role = 'teacher' AND NEW.role = 'student' THEN
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
