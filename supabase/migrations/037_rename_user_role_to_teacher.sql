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
-- Replaces migration 020's version; logic is identical except 'user' → 'teacher'.
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

  PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user.first_admin')::bigint);

  IF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    v_role := 'student';
  ELSE
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE role <> 'student' LIMIT 1
    ) THEN 'teacher' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
