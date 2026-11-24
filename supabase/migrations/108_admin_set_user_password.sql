-- Migration 108: admin_set_user_password() — an admin sets a login password and confirms the address.
--
-- Supabase's OTP/confirmation mail is often filtered (Outlook, school relays), which locks people
-- out. set-student-password covers a teacher's own roster through an edge function, but the Docker
-- stack has no functions runtime and teachers/admins are out of its scope, so this RPC lets an
-- admin do the same from SQL or the client with the same guarantees: admin role only, exact-match
-- email, rate limited, audited (the password itself is never logged).
--
-- Usage: SELECT public.admin_set_user_password('teacher@school.example', 'NewTempPassword123!');

CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  p_email           text,
  p_password        text,
  p_confirm_email   boolean DEFAULT true,
  p_revoke_sessions boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_email    text := lower(btrim(p_email));
  v_target   uuid;
  v_matches  int;
BEGIN
  IF v_uid IS NULL
     OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     OR coalesce(public.get_my_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'Missing or invalid email' USING ERRCODE = '22023';
  END IF;

  -- bcrypt only reads the first 72 bytes, so a longer password would silently be truncated.
  IF p_password IS NULL OR char_length(p_password) < 8 OR octet_length(p_password) > 72 THEN
    RAISE EXCEPTION 'Password must be 8 to 72 bytes long' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_set_user_password:' || v_uid::text, 0));

  IF (
    SELECT count(*) FROM public.audit_logs a
    WHERE a.actor_id = v_uid AND a.action = 'admin_set_user_password' AND a.created_at > now() - interval '1 minute'
  ) >= 20 THEN
    RAISE EXCEPTION 'Too many requests, try again later' USING ERRCODE = '54000';
  END IF;

  SELECT count(*), min(u.id) INTO v_matches, v_target
  FROM auth.users u
  WHERE lower(u.email) = v_email;

  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'No single account matches that email' USING ERRCODE = 'P0002';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      email_confirmed_at = CASE WHEN p_confirm_email THEN coalesce(email_confirmed_at, now()) ELSE email_confirmed_at END,
      updated_at         = now()
  WHERE id = v_target;

  -- Signing the caller out of their own session would be a surprising side effect of resetting
  -- someone else's password, and pointless when they reset their own.
  IF p_revoke_sessions AND v_target <> v_uid THEN
    DELETE FROM auth.sessions WHERE user_id = v_target;
  END IF;

  INSERT INTO public.audit_logs (actor_id, category, action, entity_type, entity_id, details)
  VALUES (
    v_uid, 'admin', 'admin_set_user_password', 'user', v_target::text,
    jsonb_build_object('confirmed_email', p_confirm_email, 'revoked_sessions', p_revoke_sessions AND v_target <> v_uid)
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_target);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_password(text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_password(text, text, boolean, boolean) TO authenticated;
