-- Live writing student screen (Phase 43.3, #1158).
--
-- Students still have no table access. The student state RPC resolves the participant by its
-- join token and returns only that participant's own draft, the current prompt, teacher-authored
-- hints and the server timer. The save RPC now also stores the deterministic CEFR vocabulary
-- estimate, but only after the 25-word threshold; it remains an early indicator, never a grade.
--
-- This migration also makes the server's word count match the editor's countWords() (notably
-- &nbsp; between two words), freezes a round when its phase ends, and gives the teacher an explicit
-- way to start the next configured round with a clean response row.

-- ── 1. Word count parity with src/utils/essayUtils.ts ────────────────────────

create or replace function public.live_writing_word_count(p_html text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    WITH cleaned AS (
        SELECT regexp_replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(
                        regexp_replace(coalesce(p_html, ''), '<[^>]*>', ' ', 'g'),
                        '&nbsp;', ' ', 'gi'
                    ),
                    '&lt;', '<', 'gi'
                ),
                '&gt;', '>', 'gi'
            ),
            '&amp;', '&', 'gi'
        ) AS text
    ),
    visible AS (
        SELECT regexp_replace(text, '&[a-zA-Z]+;', ' ', 'g') AS text FROM cleaned
    )
    SELECT coalesce(
        array_length(
            regexp_split_to_array(nullif(trim(text), ''), '\s+'),
            1
        ),
        0
    )
    FROM visible
$$;

-- ── 2. Shared updated_at trigger must work on responses too ────────────────

-- Migration 100 reuses this function on both sessions and responses, but the session-only
-- branch reads NEW.status. PostgreSQL resolves that field on every call, so a response update
-- raised "record new has no field status". Keep the session branch nested behind the table check.
create or replace function public.live_writing_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_TABLE_NAME = 'live_writing_sessions' THEN
        -- Opening the lobby revives an expired code: a draft may sit for days before class.
        IF NEW.status IN ('lobby', 'writing') AND OLD.status = 'draft' THEN
            NEW.join_code_expires_at := now() + interval '24 hours';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ── 3. Freeze a round as soon as writing ends ───────────────────────────────

create or replace function public.live_writing_freeze_round_on_phase_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'writing' AND NEW.status <> 'writing' THEN
        UPDATE public.live_writing_responses
        SET handed_in_at = coalesce(handed_in_at, now())
        WHERE session_id = NEW.id
          AND round_index = OLD.current_round
          AND handed_in_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

drop trigger if exists live_writing_sessions_freeze_round on public.live_writing_sessions;
create trigger live_writing_sessions_freeze_round
    before update of status on public.live_writing_sessions
    for each row execute function public.live_writing_freeze_round_on_phase_change();

-- ── 4. Autosave with a guarded vocabulary estimate ─────────────────────────

-- Replaced rather than overloaded: one function keeps PostgREST's RPC resolution unambiguous.
drop function if exists public.save_live_writing_text(uuid, text, int, text);

create or replace function public.save_live_writing_text(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_content_html text,
    p_cefr_estimate text default null
)
RETURNS TABLE (word_count int, saved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
    v_words int;
    v_estimate text;
    v_saved_at timestamptz;
BEGIN
    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF v_session.status <> 'writing' OR v_session.current_round <> p_round_index THEN
        RAISE EXCEPTION 'round_closed';
    END IF;
    IF v_session.timer_state = 'running'
        AND v_session.timer_ends_at IS NOT NULL
        AND v_session.timer_ends_at <= now()
    THEN
        -- The deadline is over. Freeze the last saved text and let the next state read hand it in.
        UPDATE public.live_writing_responses
        SET handed_in_at = coalesce(handed_in_at, v_session.timer_ends_at)
        WHERE participant_id = v_participant.id
          AND round_index = p_round_index
          AND handed_in_at IS NULL;
        RAISE EXCEPTION 'round_closed';
    END IF;
    IF p_content_html IS NOT NULL AND char_length(p_content_html) > 20000 THEN
        RAISE EXCEPTION 'response_too_long';
    END IF;
    IF p_cefr_estimate IS NOT NULL AND p_cefr_estimate NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
        RAISE EXCEPTION 'invalid_estimate';
    END IF;

    v_words := public.live_writing_word_count(p_content_html);
    v_estimate := CASE WHEN v_words >= 25 THEN p_cefr_estimate ELSE NULL END;

    INSERT INTO public.live_writing_responses(
        session_id, participant_id, round_index, content_html, word_count,
        cefr_estimate, cefr_estimate_source
    )
    VALUES (
        v_session.id, v_participant.id, p_round_index, coalesce(p_content_html, ''), v_words,
        v_estimate, CASE WHEN v_estimate IS NULL THEN NULL ELSE 'heuristic' END
    )
    ON CONFLICT (participant_id, round_index) DO UPDATE
        SET content_html = EXCLUDED.content_html,
            word_count = EXCLUDED.word_count,
            cefr_estimate = EXCLUDED.cefr_estimate,
            cefr_estimate_source = EXCLUDED.cefr_estimate_source
        WHERE live_writing_responses.handed_in_at IS NULL
    RETURNING updated_at INTO v_saved_at;

    IF v_saved_at IS NULL THEN
        RAISE EXCEPTION 'already_handed_in';
    END IF;

    UPDATE public.live_writing_participants SET last_seen_at = now() WHERE id = v_participant.id;

    RETURN QUERY SELECT v_words, v_saved_at;
END;
$$;

revoke all on function public.save_live_writing_text(uuid, text, int, text, text) from public;
grant execute on function public.save_live_writing_text(uuid, text, int, text, text) to anon, authenticated;

-- ── 5. Student state: own draft, prompt, hints and server timer ─────────────

create or replace function public.get_live_writing_student_state(
    p_participant_id uuid,
    p_token text
)
RETURNS TABLE (
    session_id uuid,
    participant_id uuid,
    display_name text,
    session_title text,
    session_status text,
    timer_state text,
    timer_ends_at timestamptz,
    timer_remaining_ms bigint,
    server_now timestamptz,
    current_round int,
    round_count int,
    minutes_per_round int,
    min_words int,
    max_words int,
    prompt text,
    image_path text,
    scaffold_enabled boolean,
    scaffold_prompts jsonb,
    response_round_index int,
    content_html text,
    word_count int,
    cefr_estimate text,
    handed_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
    v_response public.live_writing_responses;
BEGIN
    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    UPDATE public.live_writing_participants SET last_seen_at = now() WHERE id = v_participant.id;

    SELECT r.* INTO v_response
    FROM public.live_writing_responses AS r
    WHERE r.participant_id = v_participant.id
      AND r.round_index = v_session.current_round;

    RETURN QUERY SELECT
        v_session.id,
        v_participant.id,
        v_participant.display_name,
        v_session.title,
        v_session.status,
        v_session.timer_state,
        v_session.timer_ends_at,
        v_session.timer_remaining_ms,
        now(),
        v_session.current_round,
        v_session.round_count,
        v_session.minutes_per_round,
        v_session.min_words,
        v_session.max_words,
        v_session.prompt,
        v_session.image_path,
        v_session.scaffold_enabled,
        CASE WHEN v_session.scaffold_enabled THEN v_session.scaffold_prompts ELSE '[]'::jsonb END,
        coalesce(v_response.round_index, v_session.current_round),
        coalesce(v_response.content_html, ''),
        coalesce(v_response.word_count, 0),
        v_response.cefr_estimate,
        v_response.handed_in_at;
END;
$$;

revoke all on function public.get_live_writing_student_state(uuid, text) from public;
grant execute on function public.get_live_writing_student_state(uuid, text) to anon, authenticated;

-- ── 6. Hand-in carries the final draft ──────────────────────────────────────

-- Auto hand-in at 0:00 must freeze exactly what is on screen, not whatever the last debounced
-- autosave happened to send. The optional content is only written while the round is still open;
-- the phase trigger remains the authority once writing ends.
drop function if exists public.hand_in_live_writing(uuid, text, int);

create or replace function public.hand_in_live_writing(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_content_html text default null,
    p_cefr_estimate text default null
)
RETURNS TABLE (handed_in_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
    v_words int;
    v_estimate text;
    v_handed_in timestamptz;
BEGIN
    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF v_session.status <> 'writing' OR v_session.current_round <> p_round_index THEN
        RAISE EXCEPTION 'round_closed';
    END IF;
    IF p_content_html IS NOT NULL AND char_length(p_content_html) > 20000 THEN
        RAISE EXCEPTION 'response_too_long';
    END IF;
    IF p_cefr_estimate IS NOT NULL AND p_cefr_estimate NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
        RAISE EXCEPTION 'invalid_estimate';
    END IF;

    -- The deadline already froze the last autosaved draft; text sent after it is not accepted.
    IF p_content_html IS NOT NULL
        AND NOT (
            v_session.timer_state = 'running'
            AND v_session.timer_ends_at IS NOT NULL
            AND v_session.timer_ends_at <= now()
        )
    THEN
        v_words := public.live_writing_word_count(p_content_html);
        v_estimate := CASE WHEN v_words >= 25 THEN p_cefr_estimate ELSE NULL END;

        INSERT INTO public.live_writing_responses(
            session_id, participant_id, round_index, content_html, word_count,
            cefr_estimate, cefr_estimate_source
        )
        VALUES (
            v_session.id, v_participant.id, p_round_index, p_content_html, v_words,
            v_estimate, CASE WHEN v_estimate IS NULL THEN NULL ELSE 'heuristic' END
        )
        ON CONFLICT (participant_id, round_index) DO UPDATE
            SET content_html = EXCLUDED.content_html,
                word_count = EXCLUDED.word_count,
                cefr_estimate = EXCLUDED.cefr_estimate,
                cefr_estimate_source = EXCLUDED.cefr_estimate_source
            WHERE live_writing_responses.handed_in_at IS NULL;
    ELSE
        INSERT INTO public.live_writing_responses(session_id, participant_id, round_index)
        VALUES (v_session.id, v_participant.id, p_round_index)
        ON CONFLICT (participant_id, round_index) DO NOTHING;
    END IF;

    UPDATE public.live_writing_responses AS r
    SET handed_in_at = coalesce(r.handed_in_at, now())
    WHERE r.participant_id = v_participant.id AND r.round_index = p_round_index
    RETURNING r.handed_in_at INTO v_handed_in;

    UPDATE public.live_writing_participants SET last_seen_at = now() WHERE id = v_participant.id;

    RETURN QUERY SELECT v_handed_in;
END;
$$;

revoke all on function public.hand_in_live_writing(uuid, text, int, text, text) from public;
grant execute on function public.hand_in_live_writing(uuid, text, int, text, text) to anon, authenticated;

-- ── 7. Teacher: start the next round with a clean row ───────────────────────

create or replace function public.start_live_writing_round(
    p_session_id uuid,
    p_round_index int
)
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
    v_round int;
    v_total int;
    v_minutes int;
    v_board boolean;
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions
    WHERE id = p_session_id AND owner_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;
    IF p_round_index <> v_session.current_round + 1 OR p_round_index > v_session.round_count THEN
        RAISE EXCEPTION 'invalid_round';
    END IF;
    IF v_session.status NOT IN ('voting', 'finals') THEN
        RAISE EXCEPTION 'round_not_finished';
    END IF;

    -- The phase trigger normally freezes these already; this covers a session whose status was
    -- changed directly by an older client.
    UPDATE public.live_writing_responses
    SET handed_in_at = coalesce(handed_in_at, now())
    WHERE session_id = p_session_id
      AND round_index = v_session.current_round
      AND handed_in_at IS NULL;

    UPDATE public.live_writing_sessions AS s
    SET status = 'writing',
        current_round = p_round_index,
        timer_state = 'running',
        timer_ends_at = now() + make_interval(mins => v_session.minutes_per_round),
        timer_remaining_ms = 0,
        votes_open = false
    WHERE s.id = p_session_id
    RETURNING s.status, s.timer_state, s.timer_ends_at, s.timer_remaining_ms, now(),
              s.current_round, s.round_count, s.minutes_per_round, s.show_progress_board
    INTO v_status, v_state, v_ends, v_remaining, v_now, v_round, v_total, v_minutes, v_board;

    RETURN QUERY SELECT v_status, v_state, v_ends, v_remaining, v_now, v_round, v_total, v_minutes, v_board;
END;
$$;

revoke all on function public.start_live_writing_round(uuid, int) from public;
grant execute on function public.start_live_writing_round(uuid, int) to authenticated;
