-- Live writing self-check + peer voting (Phase 43.4, #1154).
--
-- After hand-in a student records one of three self-check ratings. When peer voting is enabled,
-- the teacher ends writing into a voting phase where the server generates one stored pair of
-- anonymous class texts per participant. The vote RPC accepts only `a` or `b`, so a student never
-- receives another participant's id; the server resolves the choice against the stored pair.
--
-- One vote per participant per round is enforced by the existing unique constraint. Reopening a
-- round deletes that round's votes and pairs, increments a generation, and writes a round-log row
-- so the teacher can see that the distribution changed. Peer voting off ends writing directly in
-- finals; no pairing or voting work is done for that round.

-- ── 1. Session and response fields ───────────────────────────────────────────

alter table public.live_writing_sessions
    add column if not exists peer_voting boolean not null default true,
    add column if not exists vote_generation int not null default 0;

comment on column public.live_writing_sessions.peer_voting is
    'When false, ending writing skips the voting phase and goes straight to finals.';
comment on column public.live_writing_sessions.vote_generation is
    'Increments on every voting open/reopen; used to rotate the generated pairs.';

alter table public.live_writing_responses
    drop constraint if exists live_writing_responses_self_rating_check;

alter table public.live_writing_responses
    alter column self_rating type text
    using (
        case
            when self_rating is null then null
            when self_rating <= 2 then 'unhappy'
            when self_rating = 3 then 'neutral'
            else 'happy'
        end
    );

alter table public.live_writing_responses
    add constraint live_writing_responses_self_rating_check
    check (self_rating is null or self_rating in ('happy', 'neutral', 'unhappy'));

comment on column public.live_writing_responses.self_rating is
    'Three-option self-check after hand-in. Deliberately separate from any grade.';

-- ── 2. Pairing and round log ────────────────────────────────────────────────

create table if not exists public.live_writing_peer_pairs (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.live_writing_sessions(id) on delete cascade,
    round_index int not null check (round_index between 1 and 3),
    voter_participant_id uuid not null references public.live_writing_participants(id) on delete cascade,
    option_a_participant_id uuid not null references public.live_writing_participants(id) on delete cascade,
    option_b_participant_id uuid not null references public.live_writing_participants(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint live_writing_peer_pairs_one_per_round unique (session_id, round_index, voter_participant_id),
    constraint live_writing_peer_pairs_not_self check (
        voter_participant_id <> option_a_participant_id
        and voter_participant_id <> option_b_participant_id
    ),
    constraint live_writing_peer_pairs_distinct check (option_a_participant_id <> option_b_participant_id)
);

create table if not exists public.live_writing_round_log (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.live_writing_sessions(id) on delete cascade,
    round_index int not null check (round_index between 1 and 3),
    action text not null check (action in ('voting_opened', 'voting_closed', 'voting_reopened')),
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists live_writing_peer_pairs_session_idx
    on public.live_writing_peer_pairs(session_id, round_index);
create index if not exists live_writing_round_log_session_idx
    on public.live_writing_round_log(session_id, round_index, created_at desc);

alter table public.live_writing_peer_pairs enable row level security;
alter table public.live_writing_round_log enable row level security;

drop policy if exists live_writing_peer_pairs_owner_read on public.live_writing_peer_pairs;
create policy live_writing_peer_pairs_owner_read on public.live_writing_peer_pairs
    for select using (
        session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = auth.uid())
    );

drop policy if exists live_writing_round_log_owner_read on public.live_writing_round_log;
create policy live_writing_round_log_owner_read on public.live_writing_round_log
    for select using (
        session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = auth.uid())
    );

revoke all on public.live_writing_peer_pairs from anon;
revoke all on public.live_writing_round_log from anon, authenticated;
grant select on public.live_writing_peer_pairs to authenticated;
grant select on public.live_writing_round_log to authenticated;

-- ── 3. Closing writing hands every joined participant a response row ───────

create or replace function public.live_writing_freeze_round_on_phase_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status = 'writing' AND NEW.status <> 'writing' THEN
        INSERT INTO public.live_writing_responses(session_id, participant_id, round_index, handed_in_at)
        SELECT NEW.id, p.id, OLD.current_round, now()
        FROM public.live_writing_participants p
        WHERE p.session_id = NEW.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.live_writing_responses r
              WHERE r.participant_id = p.id
                AND r.round_index = OLD.current_round
          )
        ON CONFLICT DO NOTHING;

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

-- ── 4. Deterministic pair generation ────────────────────────────────────────

-- Every handed-in participant with a non-empty text gets two other writers. Rotation is derived
-- from the session's vote generation, so a reopen produces a different pair wherever the class
-- has enough writers for one (with exactly three writers, only one pair of peers exists).
create or replace function public.live_writing_generate_pairs(
    p_session_id uuid,
    p_round_index int,
    p_rotation int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pairs int;
BEGIN
    DELETE FROM public.live_writing_peer_pairs
    WHERE session_id = p_session_id AND round_index = p_round_index;

    WITH candidates AS (
        SELECT
            p.id,
            (row_number() OVER (ORDER BY p.joined_at, p.id) - 1)::int AS idx,
            (count(*) OVER ())::int AS n
        FROM public.live_writing_participants p
        JOIN public.live_writing_responses r
          ON r.participant_id = p.id
         AND r.round_index = p_round_index
        WHERE p.session_id = p_session_id
          AND r.handed_in_at IS NOT NULL
          AND r.word_count > 0
    ),
    offsets AS (
        SELECT
            c.*,
            ((p_rotation - 1) % (c.n - 1)) + 1 AS offset_a,
            (((p_rotation - 1) % (c.n - 1)) + 1) % (c.n - 1) + 1 AS offset_b
        FROM candidates c
        WHERE c.n >= 3
    ),
    generated AS (
        SELECT
            c.id AS voter_participant_id,
            a.id AS option_a_participant_id,
            b.id AS option_b_participant_id
        FROM offsets c
        JOIN candidates a ON a.idx = (c.idx + c.offset_a) % c.n
        JOIN candidates b ON b.idx = (c.idx + c.offset_b) % c.n
    )
    INSERT INTO public.live_writing_peer_pairs(
        session_id, round_index, voter_participant_id, option_a_participant_id, option_b_participant_id
    )
    SELECT p_session_id, p_round_index, voter_participant_id, option_a_participant_id, option_b_participant_id
    FROM generated;

    GET DIAGNOSTICS v_pairs = ROW_COUNT;
    RETURN v_pairs;
END;
$$;

-- Internal helper shared by end-writing and the explicit teacher reopen control. It clears that
-- round's old votes and pairs before generating fresh ones, which is the definition of a reopen.
create or replace function public.live_writing_open_voting(
    p_session_id uuid,
    p_round_index int,
    p_reopen boolean
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.live_writing_sessions;
    v_generation int;
    v_votes int;
    v_pairs int;
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;
    IF p_round_index <> v_session.current_round
        OR p_round_index < 1
        OR p_round_index > v_session.round_count
    THEN
        RAISE EXCEPTION 'invalid_round';
    END IF;

    SELECT count(*) INTO v_votes
    FROM public.live_writing_votes
    WHERE session_id = p_session_id AND round_index = p_round_index;

    DELETE FROM public.live_writing_votes
    WHERE session_id = p_session_id AND round_index = p_round_index;

    v_generation := coalesce(v_session.vote_generation, 0) + 1;
    v_pairs := public.live_writing_generate_pairs(
        p_session_id,
        p_round_index,
        (v_generation * 2) - 1
    );

    UPDATE public.live_writing_sessions
    SET status = 'voting',
        current_round = p_round_index,
        votes_open = true,
        vote_generation = v_generation
    WHERE id = p_session_id;

    INSERT INTO public.live_writing_round_log(session_id, round_index, action, detail)
    VALUES (
        p_session_id,
        p_round_index,
        CASE WHEN p_reopen THEN 'voting_reopened' ELSE 'voting_opened' END,
        jsonb_build_object(
            'votesCleared', v_votes,
            'pairs', v_pairs,
            'generation', v_generation
        )
    );

    RETURN v_pairs;
END;
$$;

revoke all on function public.live_writing_generate_pairs(uuid, int, int) from public, anon, authenticated;
revoke all on function public.live_writing_open_voting(uuid, int, boolean) from public, anon, authenticated;

-- ── 5. Self-check, vote state and vote submission ───────────────────────────

drop function if exists public.self_check_live_writing(uuid, text, int, int, text);

create or replace function public.self_check_live_writing(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_rating text,
    p_note text default null
)
RETURNS TABLE (self_rating text, self_note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
    v_note text;
BEGIN
    IF p_rating NOT IN ('happy', 'neutral', 'unhappy') THEN
        RAISE EXCEPTION 'invalid_rating';
    END IF;
    v_note := nullif(trim(coalesce(p_note, '')), '');
    IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
        RAISE EXCEPTION 'note_too_long';
    END IF;

    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF v_session.status NOT IN ('writing', 'voting', 'finals')
        OR v_session.current_round <> p_round_index
    THEN
        RAISE EXCEPTION 'round_closed';
    END IF;

    UPDATE public.live_writing_responses AS r
    SET self_rating = p_rating, self_note = v_note
    WHERE r.participant_id = v_participant.id
      AND r.round_index = p_round_index
      AND r.handed_in_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_handed_in';
    END IF;

    RETURN QUERY SELECT p_rating, v_note;
END;
$$;

drop function if exists public.get_live_writing_student_state(uuid, text);

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
    peer_voting boolean,
    response_round_index int,
    content_html text,
    word_count int,
    cefr_estimate text,
    handed_in_at timestamptz,
    self_rating text,
    self_note text
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
        v_session.peer_voting,
        coalesce(v_response.round_index, v_session.current_round),
        coalesce(v_response.content_html, ''),
        coalesce(v_response.word_count, 0),
        v_response.cefr_estimate,
        v_response.handed_in_at,
        v_response.self_rating,
        v_response.self_note;
END;
$$;

revoke all on function public.get_live_writing_student_state(uuid, text) from public;
grant execute on function public.get_live_writing_student_state(uuid, text) to anon, authenticated;

create or replace function public.get_live_writing_vote_state(
    p_participant_id uuid,
    p_token text
)
RETURNS TABLE (
    session_status text,
    current_round int,
    round_count int,
    peer_voting boolean,
    votes_open boolean,
    self_rating text,
    self_note text,
    has_pair boolean,
    voted boolean,
    option_a_html text,
    option_b_html text,
    option_a_word_count int,
    option_b_word_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
    v_response public.live_writing_responses;
    v_pair public.live_writing_peer_pairs;
    v_a public.live_writing_responses;
    v_b public.live_writing_responses;
    v_voted boolean;
BEGIN
    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT r.* INTO v_response
    FROM public.live_writing_responses AS r
    WHERE r.participant_id = v_participant.id
      AND r.round_index = v_session.current_round;

    SELECT p.* INTO v_pair
    FROM public.live_writing_peer_pairs AS p
    WHERE p.session_id = v_session.id
      AND p.round_index = v_session.current_round
      AND p.voter_participant_id = v_participant.id;

    IF v_pair.id IS NOT NULL THEN
        SELECT r.* INTO v_a
        FROM public.live_writing_responses AS r
        WHERE r.participant_id = v_pair.option_a_participant_id
          AND r.round_index = v_session.current_round;

        SELECT r.* INTO v_b
        FROM public.live_writing_responses AS r
        WHERE r.participant_id = v_pair.option_b_participant_id
          AND r.round_index = v_session.current_round;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.live_writing_votes AS v
        WHERE v.session_id = v_session.id
          AND v.round_index = v_session.current_round
          AND v.voter_participant_id = v_participant.id
    ) INTO v_voted;

    RETURN QUERY SELECT
        v_session.status,
        v_session.current_round,
        v_session.round_count,
        v_session.peer_voting,
        v_session.votes_open,
        v_response.self_rating,
        v_response.self_note,
        v_pair.id IS NOT NULL,
        v_voted,
        CASE WHEN v_session.peer_voting THEN v_a.content_html ELSE NULL END,
        CASE WHEN v_session.peer_voting THEN v_b.content_html ELSE NULL END,
        CASE WHEN v_session.peer_voting THEN coalesce(v_a.word_count, 0) ELSE 0 END,
        CASE WHEN v_session.peer_voting THEN coalesce(v_b.word_count, 0) ELSE 0 END;
END;
$$;

drop function if exists public.submit_live_writing_vote(uuid, text, int, uuid);

create or replace function public.submit_live_writing_vote(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_choice text
)
RETURNS TABLE (chosen_participant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
    v_pair public.live_writing_peer_pairs;
    v_chosen uuid;
BEGIN
    IF p_choice NOT IN ('a', 'b') THEN
        RAISE EXCEPTION 'invalid_choice';
    END IF;

    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF v_session.status <> 'voting' OR NOT v_session.votes_open
        OR v_session.current_round <> p_round_index
    THEN
        RAISE EXCEPTION 'voting_closed';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_responses
        WHERE participant_id = v_participant.id
          AND round_index = p_round_index
          AND handed_in_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'not_handed_in';
    END IF;

    SELECT p.* INTO v_pair
    FROM public.live_writing_peer_pairs AS p
    WHERE p.session_id = v_session.id
      AND p.round_index = p_round_index
      AND p.voter_participant_id = v_participant.id;

    IF v_pair.id IS NULL THEN
        RAISE EXCEPTION 'pair_not_ready';
    END IF;

    v_chosen := CASE p_choice
        WHEN 'a' THEN v_pair.option_a_participant_id
        ELSE v_pair.option_b_participant_id
    END;

    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_responses
        WHERE participant_id = v_chosen
          AND session_id = v_session.id
          AND round_index = p_round_index
          AND handed_in_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'invalid_choice';
    END IF;

    BEGIN
        INSERT INTO public.live_writing_votes(
            session_id, round_index, voter_participant_id, chosen_participant_id
        )
        VALUES (v_session.id, p_round_index, v_participant.id, v_chosen);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'already_voted';
    END;

    RETURN QUERY SELECT v_chosen;
END;
$$;

-- ── 6. Teacher controls, results and round log ──────────────────────────────

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
        IF v_session.peer_voting THEN
            UPDATE public.live_writing_sessions AS s
            SET status = 'voting', timer_state = 'ended', timer_ends_at = NULL, votes_open = false
            WHERE s.id = p_session_id;
            PERFORM public.live_writing_open_voting(p_session_id, v_session.current_round, false);
        ELSE
            UPDATE public.live_writing_sessions AS s
            SET status = 'finals', timer_state = 'ended', timer_ends_at = NULL, votes_open = false
            WHERE s.id = p_session_id;
        END IF;
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

create or replace function public.set_live_writing_voting(
    p_session_id uuid,
    p_round_index int,
    p_open boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session public.live_writing_sessions;
    v_reopen boolean;
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions
    WHERE id = p_session_id AND owner_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;

    IF p_open THEN
        IF NOT v_session.peer_voting THEN
            RAISE EXCEPTION 'peer_voting_disabled';
        END IF;
        v_reopen := EXISTS (
            SELECT 1 FROM public.live_writing_round_log
            WHERE session_id = p_session_id
              AND round_index = p_round_index
              AND action IN ('voting_opened', 'voting_reopened')
        );
        PERFORM public.live_writing_open_voting(p_session_id, p_round_index, v_reopen);
    ELSIF v_session.votes_open THEN
        UPDATE public.live_writing_sessions
        SET votes_open = false
        WHERE id = p_session_id;

        INSERT INTO public.live_writing_round_log(session_id, round_index, action, detail)
        VALUES (
            p_session_id,
            p_round_index,
            'voting_closed',
            jsonb_build_object('votesKept', (
                SELECT count(*) FROM public.live_writing_votes
                WHERE session_id = p_session_id AND round_index = p_round_index
            ))
        );
    END IF;
END;
$$;

create or replace function public.get_live_writing_vote_results(
    p_session_id uuid,
    p_round_index int
)
RETURNS TABLE (
    participant_id uuid,
    display_name text,
    self_rating text,
    self_note text,
    voted_for_participant_id uuid,
    voted_for_name text,
    votes_received int,
    has_pair boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_sessions
        WHERE id = p_session_id AND owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.display_name,
        r.self_rating,
        r.self_note,
        v.chosen_participant_id,
        chosen.display_name,
        (
            SELECT count(*)::int
            FROM public.live_writing_votes AS received
            WHERE received.session_id = p_session_id
              AND received.round_index = p_round_index
              AND received.chosen_participant_id = p.id
        ),
        EXISTS (
            SELECT 1
            FROM public.live_writing_peer_pairs AS pair
            WHERE pair.session_id = p_session_id
              AND pair.round_index = p_round_index
              AND pair.voter_participant_id = p.id
        )
    FROM public.live_writing_participants AS p
    LEFT JOIN public.live_writing_responses AS r
      ON r.participant_id = p.id
     AND r.round_index = p_round_index
    LEFT JOIN public.live_writing_votes AS v
      ON v.session_id = p_session_id
     AND v.round_index = p_round_index
     AND v.voter_participant_id = p.id
    LEFT JOIN public.live_writing_participants AS chosen
      ON chosen.id = v.chosen_participant_id
    WHERE p.session_id = p_session_id
    ORDER BY p.display_name;
END;
$$;

create or replace function public.get_live_writing_round_log(
    p_session_id uuid,
    p_round_index int
)
RETURNS TABLE (
    log_id uuid,
    round_index int,
    action text,
    detail jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_sessions
        WHERE id = p_session_id AND owner_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;

    RETURN QUERY
    SELECT l.id, l.round_index, l.action, l.detail, l.created_at
    FROM public.live_writing_round_log AS l
    WHERE l.session_id = p_session_id
      AND l.round_index = p_round_index
    ORDER BY l.created_at DESC;
END;
$$;

-- ── 7. Grants ────────────────────────────────────────────────────────────────

revoke all on function public.self_check_live_writing(uuid, text, int, text, text) from public;
revoke all on function public.get_live_writing_vote_state(uuid, text) from public;
revoke all on function public.submit_live_writing_vote(uuid, text, int, text) from public;
revoke all on function public.control_live_writing_timer(uuid, text) from public;
revoke all on function public.set_live_writing_voting(uuid, int, boolean) from public;
revoke all on function public.get_live_writing_vote_results(uuid, int) from public;
revoke all on function public.get_live_writing_round_log(uuid, int) from public;

grant execute on function public.self_check_live_writing(uuid, text, int, text, text) to anon, authenticated;
grant execute on function public.get_live_writing_vote_state(uuid, text) to anon, authenticated;
grant execute on function public.submit_live_writing_vote(uuid, text, int, text) to anon, authenticated;
grant execute on function public.control_live_writing_timer(uuid, text) to authenticated;
grant execute on function public.set_live_writing_voting(uuid, int, boolean) to authenticated;
grant execute on function public.get_live_writing_vote_results(uuid, int) to authenticated;
grant execute on function public.get_live_writing_round_log(uuid, int) to authenticated;

-- ── 8. Data registries ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.owner_data_tables()
RETURNS TABLE (key text, table_name text, owner_filter text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('rubrics',                   'rubrics',                   'owner_id = $1'),
    ('folders',                   'folders',                   'owner_id = $1'),
    ('rubric_versions',           'rubric_versions',           'owner_id = $1'),
    ('rubric_shares',             'rubric_shares',             'rubric_id IN (SELECT id FROM public.rubrics WHERE owner_id = $1)'),
    ('classes',                   'classes',                   'owner_id = $1'),
    ('class_members',             'class_members',             'class_id IN (SELECT id FROM public.classes WHERE owner_id = $1)'),
    ('students',                  'students',                  'owner_id = $1'),
    ('student_rubrics',           'student_rubrics',           'grader_id = $1 AND is_peer_review = false'),
    ('peer_reviews',              'student_rubrics',           'grader_id = $1 AND is_peer_review = true'),
    ('attachments',               'attachments',               'owner_id = $1'),
    ('grade_scales',              'grade_scales',               'owner_id = $1'),
    ('comment_snippets',          'comment_snippets',          'owner_id = $1'),
    ('comment_bank',              'comment_bank',              'owner_id = $1'),
    ('export_templates',          'export_templates',          'owner_id = $1'),
    ('favorite_standards',        'favorite_standards',        'owner_id = $1'),
    ('standard_mastery_targets',  'standard_mastery_targets',  'owner_id = $1'),
    ('self_assessments',          'self_assessments',          'owner_id = $1'),
    ('speaking_sessions',         'speaking_sessions',         'owner_id = $1'),
    ('recording_metadata',        'recording_metadata',        'owner_id = $1'),
    ('scan_metadata',             'scan_metadata',             'owner_id = $1'),
    ('analysis_results',          'analysis_results',          'owner_id = $1'),
    ('tests',                     'tests',                     'owner_id = $1'),
    ('test_assignments',          'test_assignments',          'owner_id = $1'),
    ('student_tests',             'student_tests',             'owner_id = $1'),
    ('placement_sessions',        'placement_sessions',        'owner_id = $1'),
    ('essay_templates',           'essay_templates',           'owner_id = $1'),
    ('essay_assignments',         'essay_assignments',         'owner_id = $1'),
    ('essay_submissions',         'essay_submissions',         'assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = $1)'),
    ('essay_batch_assignments',   'essay_batch_assignments',   'owner_id = $1'),
    ('essay_offline_submissions', 'essay_offline_submissions', 'owner_id = $1'),
    ('grading_tasks',             'grading_tasks',             'owner_id = $1'),
    ('user_templates',            'user_templates',            'owner_id = $1'),
    ('user_settings',             'user_settings',             'user_id = $1'),
    ('flashcard_decks',           'flashcard_decks',           'owner_id = $1'),
    ('flashcard_assignments',     'flashcard_assignments',     'owner_id = $1'),
    ('flashcard_reviews',         'flashcard_reviews',         'owner_id = $1'),
    ('news_flashes',              'news_flashes',              'owner_id = $1'),
    ('news_flash_reads',          'news_flash_reads',          'owner_id = $1'),
    ('messages',                  'messages',                  'owner_id = $1'),
    ('question_bank_items',       'question_bank_items',       'owner_id = $1'),
    ('document_comments',         'document_comments',         'owner_id = $1'),
    ('notification_dismissals',   'notification_dismissals',   'owner_id = $1'),
    ('comparative_matchups',      'comparative_matchups',      'owner_id = $1'),
    ('marketplace_listings',      'marketplace_listings',      'published_by = $1'),
    ('marketplace_upvotes',       'marketplace_upvotes',       'profile_id = $1'),
    ('live_writing_peer_pairs',   'live_writing_peer_pairs',   'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_round_log',    'live_writing_round_log',    'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_votes',        'live_writing_votes',        'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_responses',    'live_writing_responses',    'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_participants', 'live_writing_participants', 'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $1)'),
    ('live_writing_sessions',     'live_writing_sessions',     'owner_id = $1')
$$;

CREATE OR REPLACE FUNCTION public.student_data_tables()
RETURNS TABLE (key text, table_name text, student_filter text, owner_filter text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('document_comments',         'document_comments',         $f$data->>'attachmentId' IN (SELECT id FROM public.attachments WHERE data->>'studentId' = $1)$f$, 'owner_id = $2'),
    ('attachments',               'attachments',               $f$data->>'studentId' = $1$f$,                                                              'owner_id = $2'),
    ('recording_metadata',        'recording_metadata',        'session_id IN (SELECT id FROM public.speaking_sessions WHERE student_id = $1)',            'owner_id = $2'),
    ('speaking_sessions',         'speaking_sessions',         'student_id = $1',                                                                          'owner_id = $2'),
    ('self_assessments',          'self_assessments',          'student_id = $1',                                                                          'owner_id = $2'),
    ('analysis_results',          'analysis_results',          'student_id = $1',                                                                          'owner_id = $2'),
    ('scan_metadata',             'scan_metadata',             'student_id = $1',                                                                          'owner_id = $2'),
    ('student_rubrics',           'student_rubrics',           'student_id = $1',                                                                          'grader_id = $2'),
    ('essay_submissions',         'essay_submissions',         'assignment_id IN (SELECT id FROM public.essay_assignments WHERE student_id = $1)',         'assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = $2)'),
    ('essay_assignments',         'essay_assignments',         'student_id = $1',                                                                          'owner_id = $2'),
    ('essay_batch_assignments',   'essay_batch_assignments',   $f$data->>'studentId' = $1$f$,                                                              'owner_id = $2'),
    ('essay_offline_submissions', 'essay_offline_submissions', $f$data->>'assignmentStudentId' = $1$f$,                                                    'owner_id = $2'),
    ('placement_sessions',        'placement_sessions',        'assignment_id IN (SELECT id FROM public.test_assignments WHERE student_id = $1)',          'owner_id = $2'),
    ('student_tests',             'student_tests',             $f$data->>'studentId' = $1 OR assignment_id IN (SELECT id FROM public.test_assignments WHERE student_id = $1)$f$, 'owner_id = $2'),
    ('test_assignments',          'test_assignments',          'student_id = $1',                                                                          'owner_id = $2'),
    ('messages',                  'messages',                  'student_id = $1',                                                                          'owner_id = $2'),
    ('flashcard_reviews',         'flashcard_reviews',         'student_id = $1',                                                                          'owner_id = $2'),
    ('flashcard_assignments',     'flashcard_assignments',     'student_id = $1',                                                                          'owner_id = $2'),
    ('flashcard_decks',           'flashcard_decks',           'student_id = $1',                                                                          'owner_id = $2'),
    ('news_flash_reads',          'news_flash_reads',          'student_id = $1',                                                                          'owner_id = $2'),
    ('grading_tasks',             'grading_tasks',             $f$data->>'studentId' = $1$f$,                                                              'owner_id = $2'),
    ('comparative_matchups',      'comparative_matchups',      $f$data->>'studentAId' = $1 OR data->>'studentBId' = $1$f$,                                 'owner_id = $2'),
    ('live_writing_peer_pairs',   'live_writing_peer_pairs',   $f$voter_participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1) OR option_a_participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1) OR option_b_participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1)$f$, 'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('live_writing_votes',        'live_writing_votes',        'voter_participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1)', 'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('live_writing_responses',    'live_writing_responses',    'participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1)',       'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('live_writing_participants', 'live_writing_participants', 'student_id = $1',                                                                          'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('students',                  'students',                  'id = $1',                                                                                  'owner_id = $2')
$$;
