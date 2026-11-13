-- Live writing projector + server-authoritative timer (Phase 43.2, #1155).
--
-- The projector is a separate window but never the source of truth: start, pause, resume, +1 min
-- and end are database writes owned by the session's teacher. Every device derives the countdown
-- from `timer_ends_at` plus the database's `now()`, so a refresh or a slow browser cannot drift.
-- `timer_remaining_ms` holds the frozen remainder while paused.
--
-- Realtime presence/progress is broadcast-only (see LiveWritingAdapter) and never carries response
-- text. Nothing here changes the zero-AI or early-indicator contract from migration 100.

alter table public.live_writing_sessions
    add column if not exists timer_state text not null default 'idle'
        check (timer_state in ('idle', 'running', 'paused', 'ended')),
    add column if not exists timer_ends_at timestamptz,
    add column if not exists timer_remaining_ms bigint not null default 0
        check (timer_remaining_ms >= 0),
    add column if not exists show_progress_board boolean not null default true;

comment on column public.live_writing_sessions.timer_ends_at is
    'Absolute database deadline for the current writing round. Clients must derive the countdown from this and server_now, not from a local interval.';
comment on column public.live_writing_sessions.timer_remaining_ms is
    'Frozen remainder while paused, in milliseconds.';

-- ── Teacher controls ─────────────────────────────────────────────────────────

create or replace function public.start_live_writing_session(p_session_id uuid)
RETURNS TABLE (
    status text,
    timer_state text,
    timer_ends_at timestamptz,
    timer_remaining_ms bigint,
    server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.live_writing_sessions;
    v_status text;
    v_state text;
    v_ends timestamptz;
    v_remaining bigint;
    v_now timestamptz;
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions
    WHERE id = p_session_id AND owner_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;
    IF v_session.status <> 'lobby' THEN
        RAISE EXCEPTION 'session_not_in_lobby';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_participants WHERE session_id = p_session_id
    ) THEN
        RAISE EXCEPTION 'no_participants';
    END IF;

    UPDATE public.live_writing_sessions AS s
    SET status = 'writing',
        timer_state = 'running',
        timer_ends_at = now() + make_interval(mins => v_session.minutes_per_round),
        timer_remaining_ms = 0,
        started_at = coalesce(s.started_at, now())
    WHERE s.id = p_session_id
    RETURNING s.status, s.timer_state, s.timer_ends_at, s.timer_remaining_ms, now()
    INTO v_status, v_state, v_ends, v_remaining, v_now;

    RETURN QUERY SELECT v_status, v_state, v_ends, v_remaining, v_now;
END;
$$;

create or replace function public.control_live_writing_timer(
    p_session_id uuid,
    p_action text
)
RETURNS TABLE (
    status text,
    timer_state text,
    timer_ends_at timestamptz,
    timer_remaining_ms bigint,
    server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.live_writing_sessions;
    v_remaining bigint;
    v_status text;
    v_state text;
    v_ends timestamptz;
    v_frozen bigint;
    v_now timestamptz;
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions
    WHERE id = p_session_id AND owner_id = auth.uid()
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;
    IF p_action NOT IN ('pause', 'resume', 'extend', 'end_writing', 'end_session') THEN
        RAISE EXCEPTION 'invalid_action';
    END IF;

    IF p_action = 'pause' THEN
        IF v_session.timer_state <> 'running' THEN
            RAISE EXCEPTION 'timer_not_running';
        END IF;
        v_remaining := greatest(
            0,
            (extract(epoch FROM (v_session.timer_ends_at - now())) * 1000)::bigint
        );
        UPDATE public.live_writing_sessions AS s
        SET timer_state = 'paused', timer_remaining_ms = v_remaining, timer_ends_at = NULL
        WHERE s.id = p_session_id;
    ELSIF p_action = 'resume' THEN
        IF v_session.timer_state <> 'paused' THEN
            RAISE EXCEPTION 'timer_not_paused';
        END IF;
        UPDATE public.live_writing_sessions AS s
        SET timer_state = 'running',
            timer_ends_at = now() + (s.timer_remaining_ms * interval '1 millisecond'),
            timer_remaining_ms = 0
        WHERE s.id = p_session_id;
    ELSIF p_action = 'extend' THEN
        IF v_session.timer_state = 'running' THEN
            UPDATE public.live_writing_sessions AS s
            SET timer_ends_at = coalesce(s.timer_ends_at, now()) + interval '1 minute'
            WHERE s.id = p_session_id;
        ELSIF v_session.timer_state = 'paused' THEN
            UPDATE public.live_writing_sessions AS s
            SET timer_remaining_ms = s.timer_remaining_ms + 60000
            WHERE s.id = p_session_id;
        ELSE
            RAISE EXCEPTION 'timer_not_active';
        END IF;
    ELSIF p_action = 'end_writing' THEN
        IF v_session.status <> 'writing' THEN
            RAISE EXCEPTION 'session_not_writing';
        END IF;
        UPDATE public.live_writing_sessions AS s
        SET status = 'voting', timer_state = 'ended', timer_ends_at = NULL, votes_open = false
        WHERE s.id = p_session_id;
    ELSE
        UPDATE public.live_writing_sessions AS s
        SET status = 'closed', timer_state = 'ended', timer_ends_at = NULL,
            votes_open = false, ended_at = now()
        WHERE s.id = p_session_id;
    END IF;

    SELECT s.status, s.timer_state, s.timer_ends_at, s.timer_remaining_ms, now()
    INTO v_status, v_state, v_ends, v_frozen, v_now
    FROM public.live_writing_sessions s WHERE s.id = p_session_id;

    RETURN QUERY SELECT v_status, v_state, v_ends, v_frozen, v_now;
END;
$$;

create or replace function public.get_live_writing_timer(p_session_id uuid)
RETURNS TABLE (
    status text,
    timer_state text,
    timer_ends_at timestamptz,
    timer_remaining_ms bigint,
    server_now timestamptz,
    current_round int,
    round_count int,
    minutes_per_round int,
    show_progress_board boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.live_writing_sessions;
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions
    WHERE id = p_session_id AND owner_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;

    RETURN QUERY SELECT
        v_session.status,
        v_session.timer_state,
        v_session.timer_ends_at,
        v_session.timer_remaining_ms,
        now(),
        v_session.current_round,
        v_session.round_count,
        v_session.minutes_per_round,
        v_session.show_progress_board;
END;
$$;

create or replace function public.set_live_writing_progress_board(
    p_session_id uuid,
    p_show boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.live_writing_sessions
    SET show_progress_board = p_show
    WHERE id = p_session_id AND owner_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;
    RETURN p_show;
END;
$$;

revoke all on function public.start_live_writing_session(uuid) from public;
revoke all on function public.control_live_writing_timer(uuid, text) from public;
revoke all on function public.get_live_writing_timer(uuid) from public;
revoke all on function public.set_live_writing_progress_board(uuid, boolean) from public;

grant execute on function public.start_live_writing_session(uuid) to authenticated;
grant execute on function public.control_live_writing_timer(uuid, text) to authenticated;
grant execute on function public.get_live_writing_timer(uuid) to authenticated;
grant execute on function public.set_live_writing_progress_board(uuid, boolean) to authenticated;
