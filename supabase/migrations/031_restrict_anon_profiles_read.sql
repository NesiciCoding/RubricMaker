-- Migration 027: Block anonymous sign-in users from reading all profiles
--
-- The handle_new_user() trigger assigns role='user' to every new auth user,
-- including those created by signInAnonymously(). This caused the
-- profiles_read_users_and_admins policy (migration 009) to let anonymous
-- sessions enumerate ALL teacher email addresses via the REST API, because
-- get_my_role() returns 'user' for them.
--
-- Fix: add an is_anonymous guard to the read policy. Supabase sets
-- is_anonymous=true in the JWT for sessions created with signInAnonymously().
-- The existing profiles_read_own policy (also migration 009) still allows
-- an anonymous user to read their own profile row, which is all they need.

DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;

CREATE POLICY "profiles_read_users_and_admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND get_my_role() IN ('user', 'admin')
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
