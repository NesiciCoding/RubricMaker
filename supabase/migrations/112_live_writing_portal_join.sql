-- Migration 112: Portal join for live writing (Phase 43.8, #851)
--
-- Students signed in to the student portal already have a verified email that
-- matches their roster row (get_my_student_ids, migration 014). With
-- `portal_join` enabled on a session, such a student can type the class code in
-- the portal and land in the room bound to their own roster identity — no name
-- picker, and no way to pick someone else.
--
-- The setting is per session and off by default: the public code + name picker
-- stays the normal path, and a school that shares portal links can keep the
-- authenticated shortcut off.

ALTER TABLE public.live_writing_sessions
  ADD COLUMN IF NOT EXISTS portal_join boolean NOT NULL DEFAULT false;

-- Same payload as join_live_writing_session, but the caller's identity comes
-- from their authenticated email instead of a client-supplied student id.
create or replace function public.join_live_writing_portal(p_code text)
RETURNS TABLE (
    participant_id uuid,
    join_token text,
    title text,
    status text,
    current_round int,
    round_count int,
    minutes_per_round int,
    min_words int,
    max_words int,
    scaffold_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text := public.live_writing_normalize_code(p_code);
    v_session public.live_writing_sessions;
    v_student_id text;
    v_name text;
    v_participant public.live_writing_participants;
    v_token text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    PERFORM public.live_writing_rate_check(p_code, false);
    SELECT * INTO v_session FROM public.live_writing_sessions WHERE join_code = v_code;

    IF v_code = '' OR NOT FOUND
        OR v_session.join_code_expires_at < now()
        OR v_session.status NOT IN ('lobby', 'writing')
        OR (v_session.status = 'writing' AND v_session.lock_after_start)
    THEN
        PERFORM public.live_writing_rate_check(p_code, true);
        RAISE EXCEPTION 'invalid_code';
    END IF;

    -- The teacher opts in per session; without it the portal must use the public
    -- picker so the session behaves exactly as configured.
    IF NOT v_session.portal_join THEN
        RAISE EXCEPTION 'portal_join_disabled';
    END IF;

    -- Same identity seam as get_my_student_ids() (migration 014): the portal
    -- profile's email against the roster row's email. One email can match
    -- several roster rows (a re-import), so only this session's class and owner
    -- are eligible.
    SELECT s.id, coalesce(s.data ->> 'name', 'Student')
      INTO v_student_id, v_name
    FROM public.students s
    JOIN public.profiles p ON lower(s.data ->> 'email') = lower(p.email)
    WHERE p.id = auth.uid()
      AND s.class_id = v_session.class_id
      AND s.owner_id = v_session.owner_id
      AND s.data ->> 'archivedAt' IS NULL
      AND s.data ->> 'email' IS NOT NULL
      AND p.email IS NOT NULL
    ORDER BY s.id
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'student_not_in_class';
    END IF;

    -- A fresh token per join, exactly like the public flow: a lost or shared
    -- device is recovered by signing in again, which replaces the token, not the row.
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.live_writing_participants(session_id, student_id, display_name, join_token)
    VALUES (v_session.id, v_student_id, v_name, v_token)
    ON CONFLICT (session_id, student_id) DO UPDATE
        SET join_token = EXCLUDED.join_token,
            display_name = EXCLUDED.display_name,
            last_seen_at = now()
    RETURNING * INTO v_participant;

    RETURN QUERY SELECT
        v_participant.id,
        v_participant.join_token,
        v_session.title,
        v_session.status,
        v_session.current_round,
        v_session.round_count,
        v_session.minutes_per_round,
        v_session.min_words,
        v_session.max_words,
        v_session.scaffold_enabled;
END;
$$;

-- Portal students only: an anon caller has no verified email to bind to.
revoke all on function public.join_live_writing_portal(text) from public;
revoke all on function public.join_live_writing_portal(text) from anon;
grant execute on function public.join_live_writing_portal(text) to authenticated;
