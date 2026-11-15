-- Live writing sessions (Phase 43.1, #1159).
--
-- A live session is a transient orchestration layer over the existing essay pipeline, not a new
-- assignment type. It stores only what happens in the room: the prompt, who joined, the text each
-- student wrote per round, their hand-in and self-check, and one peer vote per round. "Send to
-- grading" (a later phase) creates essay_submissions rows using the roster student_id below, which
-- is the seam into the existing grading loop.
--
-- Zero AI: no column here is filled by a model. `cefr_estimate` is an optional early indicator
-- computed by a deterministic rule set (43.4), stored on the response only, and never written into
-- the CEFR aggregation, placement results or grades.
--
-- Access model:
--   teachers  — direct table CRUD through RLS, owner only (co-teacher read comes later);
--   students  — no direct table access at all, only the SECURITY DEFINER RPCs at the bottom of
--               this file, authenticated by the participant's join token.

-- ── 1. Tables ────────────────────────────────────────────────────────────────

create table if not exists public.live_writing_sessions (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
    class_id text not null references public.classes(id) on delete cascade,
    title text not null,
    prompt text not null default '',
    image_path text,
    status text not null default 'draft'
        check (status in ('draft', 'lobby', 'writing', 'voting', 'finals', 'closed')),
    join_code text not null default '' unique,
    join_code_expires_at timestamptz,
    round_count int not null default 1 check (round_count between 1 and 3),
    current_round int not null default 1 check (current_round between 1 and 3),
    minutes_per_round int not null default 10 check (minutes_per_round between 1 and 120),
    min_words int not null default 0 check (min_words >= 0),
    max_words int check (max_words is null or max_words >= min_words),
    scaffold_enabled boolean not null default true,
    scaffold_prompts jsonb not null default '[]'::jsonb
        check (jsonb_typeof(scaffold_prompts) = 'array'),
    live_leaderboard boolean not null default true,
    lock_after_start boolean not null default false,
    votes_open boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    ended_at timestamptz,
    constraint live_writing_sessions_round_range check (current_round <= round_count),
    constraint live_writing_sessions_title_length check (char_length(title) between 1 and 200),
    constraint live_writing_sessions_prompt_length check (char_length(prompt) <= 5000),
    -- Storage object path only (bucket `live-writing`), never an external image URL.
    constraint live_writing_sessions_image_path_length check (image_path is null or char_length(image_path) between 1 and 500)
);

create table if not exists public.live_writing_participants (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.live_writing_sessions(id) on delete cascade,
    student_id text not null,
    display_name text not null,
    join_token text not null,
    joined_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    unique (session_id, student_id)
);

create table if not exists public.live_writing_responses (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.live_writing_sessions(id) on delete cascade,
    participant_id uuid not null references public.live_writing_participants(id) on delete cascade,
    round_index int not null default 1 check (round_index between 1 and 3),
    content_html text not null default '',
    word_count int not null default 0 check (word_count >= 0),
    handed_in_at timestamptz,
    self_rating int check (self_rating between 1 and 5),
    self_note text check (self_note is null or char_length(self_note) <= 1000),
    -- Early indicator only (43.4). Never summed, averaged or written to profiles/CEFR aggregation.
    cefr_estimate text check (cefr_estimate in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    cefr_estimate_source text check (cefr_estimate_source is null or cefr_estimate_source = 'heuristic'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (participant_id, round_index)
);

create table if not exists public.live_writing_votes (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.live_writing_sessions(id) on delete cascade,
    round_index int not null check (round_index between 1 and 3),
    voter_participant_id uuid not null references public.live_writing_participants(id) on delete cascade,
    chosen_participant_id uuid not null references public.live_writing_participants(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint live_writing_votes_not_self check (voter_participant_id <> chosen_participant_id),
    -- One vote per pair per round. A teacher reopening a round deletes these first, which is what
    -- makes a second quality-control round possible.
    constraint live_writing_votes_one_per_round unique (session_id, round_index, voter_participant_id)
);

-- Ephemeral abuse guard for join codes. No owner and no student link: it exists only to throttle
-- failed guesses and is pruned on use, so it is deliberately outside the owner/student backups.
create table if not exists public.live_writing_join_attempts (
    rate_key text not null,
    attempted_at timestamptz not null default now()
);
create index if not exists live_writing_join_attempts_key_idx
    on public.live_writing_join_attempts(rate_key, attempted_at desc);

create index if not exists live_writing_sessions_owner_idx on public.live_writing_sessions(owner_id);
create index if not exists live_writing_sessions_code_idx on public.live_writing_sessions(join_code);
create index if not exists live_writing_participants_session_idx on public.live_writing_participants(session_id);
create index if not exists live_writing_participants_student_idx on public.live_writing_participants(student_id);
create index if not exists live_writing_responses_session_idx on public.live_writing_responses(session_id);
create index if not exists live_writing_votes_session_idx on public.live_writing_votes(session_id);

comment on table public.live_writing_sessions is
    'Teacher-run live writing sessions (Phase 43). Transient orchestration over the essay pipeline; no AI.';
comment on column public.live_writing_sessions.scaffold_prompts is
    'Teacher-authored hints, shown only when scaffold_enabled. Never generated.';
comment on column public.live_writing_responses.cefr_estimate is
    'Early indicator from deterministic rules (43.4). Not a grade and never aggregated into CEFR levels.';

-- ── 2. Code + timestamps ─────────────────────────────────────────────────────

create or replace function public.live_writing_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text;
BEGIN
    IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
        LOOP
            -- 6 hex characters, with visually ambiguous 0/1 mapped to 2/3. 16^6 codes plus the
            -- join-attempt throttle below keeps guessing impractical for a classroom window.
            v_code := 'RM-' || translate(
                upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
                '0O1I',
                '2345'
            );
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM public.live_writing_sessions WHERE join_code = v_code
            );
        END LOOP;
        NEW.join_code := v_code;
    END IF;
    NEW.join_code_expires_at := coalesce(NEW.join_code_expires_at, now() + interval '24 hours');
    RETURN NEW;
END;
$$;

drop trigger if exists live_writing_sessions_assign_code on public.live_writing_sessions;
create trigger live_writing_sessions_assign_code
    before insert on public.live_writing_sessions
    for each row execute function public.live_writing_assign_code();

create or replace function public.live_writing_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    -- Opening the lobby revives an expired code: a draft may sit for days before class.
    IF TG_TABLE_NAME = 'live_writing_sessions'
        AND NEW.status IN ('lobby', 'writing')
        AND OLD.status = 'draft'
    THEN
        NEW.join_code_expires_at := now() + interval '24 hours';
    END IF;
    RETURN NEW;
END;
$$;

drop trigger if exists live_writing_sessions_touch on public.live_writing_sessions;
create trigger live_writing_sessions_touch
    before update on public.live_writing_sessions
    for each row execute function public.live_writing_touch_updated_at();

drop trigger if exists live_writing_responses_touch on public.live_writing_responses;
create trigger live_writing_responses_touch
    before update on public.live_writing_responses
    for each row execute function public.live_writing_touch_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

alter table public.live_writing_sessions enable row level security;
alter table public.live_writing_participants enable row level security;
alter table public.live_writing_responses enable row level security;
alter table public.live_writing_votes enable row level security;
alter table public.live_writing_join_attempts enable row level security;

drop policy if exists live_writing_sessions_owner on public.live_writing_sessions;
create policy live_writing_sessions_owner on public.live_writing_sessions
    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists live_writing_participants_owner_read on public.live_writing_participants;
create policy live_writing_participants_owner_read on public.live_writing_participants
    for select using (
        session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = auth.uid())
    );

drop policy if exists live_writing_responses_owner_read on public.live_writing_responses;
create policy live_writing_responses_owner_read on public.live_writing_responses
    for select using (
        session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = auth.uid())
    );

drop policy if exists live_writing_votes_owner_read on public.live_writing_votes;
create policy live_writing_votes_owner_read on public.live_writing_votes
    for select using (
        session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = auth.uid())
    );

-- Students never touch these tables directly, and the attempt log is internal only.
revoke all on public.live_writing_sessions from anon;
revoke all on public.live_writing_participants from anon;
revoke all on public.live_writing_responses from anon;
revoke all on public.live_writing_votes from anon;
revoke all on public.live_writing_join_attempts from anon, authenticated;

grant select, insert, update, delete on public.live_writing_sessions to authenticated;
grant select on public.live_writing_participants to authenticated;
grant select on public.live_writing_responses to authenticated;
grant select on public.live_writing_votes to authenticated;

-- ── 4. Helpers ───────────────────────────────────────────────────────────────

create or replace function public.live_writing_normalize_code(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    WITH cleaned AS (
        SELECT upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) AS c
    )
    SELECT CASE
        WHEN c ~ '^RM[0-9A-Z]{6}$' THEN 'RM-' || substr(c, 3)
        WHEN c ~ '^[0-9A-Z]{6}$'   THEN 'RM-' || c
        ELSE ''
    END
    FROM cleaned
$$;

create or replace function public.live_writing_rate_key(p_code text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_ip text;
BEGIN
    v_ip := '';
    BEGIN
        v_ip := split_part(
            coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
            ',',
            1
        );
    EXCEPTION WHEN others THEN
        v_ip := '';
    END;
    IF trim(v_ip) = '' THEN
        RETURN 'unknown:' || coalesce(p_code, '');
    END IF;
    RETURN trim(v_ip) || ':' || coalesce(p_code, '');
END;
$$;

-- Called with p_failed = true only when the code did not resolve. Limit is per caller+code, so a
-- class sharing one NAT address is not locked out by one student's typos.
create or replace function public.live_writing_rate_check(p_code text, p_failed boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_key text := public.live_writing_rate_key(p_code);
    v_recent int;
    v_limit int;
BEGIN
    IF p_failed THEN
        DELETE FROM public.live_writing_join_attempts WHERE attempted_at < now() - interval '1 day';
        INSERT INTO public.live_writing_join_attempts(rate_key) VALUES (v_key);
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.live_writing_join_attempts
    WHERE rate_key = v_key AND attempted_at > now() - interval '10 minutes';

    v_limit := CASE WHEN v_key LIKE 'unknown:%' THEN 200 ELSE 30 END;
    IF v_recent > v_limit THEN
        RAISE EXCEPTION 'too_many_attempts';
    END IF;
END;
$$;

create or replace function public.live_writing_word_count(p_html text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT coalesce(
        array_length(
            regexp_split_to_array(
                nullif(trim(regexp_replace(coalesce(p_html, ''), '<[^>]*>', ' ', 'g')), ''),
                '\s+'
            ),
            1
        ),
        0
    )
$$;

-- Resolve a participant by id + secret token. SECURITY DEFINER so students need no table access.
create or replace function public.live_writing_participant_for_token(
    p_participant_id uuid,
    p_token text
)
RETURNS public.live_writing_participants
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.live_writing_participants
    WHERE id = p_participant_id AND join_token = p_token
$$;

revoke all on function public.live_writing_participant_for_token(uuid, text) from public, anon, authenticated;
revoke all on function public.live_writing_rate_check(text, boolean) from public, anon, authenticated;
revoke all on function public.live_writing_rate_key(text) from public, anon, authenticated;
revoke all on function public.live_writing_normalize_code(text) from public, anon, authenticated;

-- ── 5. Student RPCs ──────────────────────────────────────────────────────────

-- Names for the picker. Only a live (lobby/writing) code returns anything, and only the roster of
-- the session's own class — never emails, grades or other classes.
create or replace function public.live_writing_roster(p_code text)
RETURNS TABLE (student_id text, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code text := public.live_writing_normalize_code(p_code);
    v_session public.live_writing_sessions;
BEGIN
    PERFORM public.live_writing_rate_check(p_code, false);
    SELECT * INTO v_session FROM public.live_writing_sessions WHERE join_code = v_code;

    IF v_code = '' OR NOT FOUND
        OR v_session.status NOT IN ('lobby', 'writing')
        OR v_session.join_code_expires_at < now()
    THEN
        PERFORM public.live_writing_rate_check(p_code, true);
        RAISE EXCEPTION 'invalid_code';
    END IF;

    RETURN QUERY
        SELECT s.id, coalesce(s.data ->> 'name', 'Student')
        FROM public.students s
        WHERE s.class_id = v_session.class_id
          AND s.owner_id = v_session.owner_id
          AND s.data ->> 'archivedAt' IS NULL
        ORDER BY lower(coalesce(s.data ->> 'name', 'Student'));
END;
$$;

create or replace function public.join_live_writing_session(p_code text, p_student_id text)
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
    v_name text;
    v_participant public.live_writing_participants;
    v_token text;
BEGIN
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

    SELECT coalesce(s.data ->> 'name', 'Student') INTO v_name
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.class_id = v_session.class_id
      AND s.owner_id = v_session.owner_id
      AND s.data ->> 'archivedAt' IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'student_not_in_class';
    END IF;

    -- Two UUIDs: a fresh token per join, so a lost/shared device can be replaced by the teacher
    -- simply having the student pick their name again.
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.live_writing_participants(session_id, student_id, display_name, join_token)
    VALUES (v_session.id, p_student_id, v_name, v_token)
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

-- Draft autosave. Only the current round, only while writing, and only before hand-in.
create or replace function public.save_live_writing_text(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_content_html text
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
    IF p_content_html IS NOT NULL AND char_length(p_content_html) > 20000 THEN
        RAISE EXCEPTION 'response_too_long';
    END IF;

    v_words := public.live_writing_word_count(p_content_html);

    INSERT INTO public.live_writing_responses(
        session_id, participant_id, round_index, content_html, word_count
    )
    VALUES (v_session.id, v_participant.id, p_round_index, coalesce(p_content_html, ''), v_words)
    ON CONFLICT (participant_id, round_index) DO UPDATE
        SET content_html = EXCLUDED.content_html,
            word_count = EXCLUDED.word_count
        WHERE live_writing_responses.handed_in_at IS NULL
    RETURNING updated_at INTO v_saved_at;

    IF v_saved_at IS NULL THEN
        RAISE EXCEPTION 'already_handed_in';
    END IF;

    UPDATE public.live_writing_participants SET last_seen_at = now() WHERE id = v_participant.id;

    RETURN QUERY SELECT v_words, v_saved_at;
END;
$$;

create or replace function public.hand_in_live_writing(
    p_participant_id uuid,
    p_token text,
    p_round_index int
)
RETURNS TABLE (handed_in_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
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

    INSERT INTO public.live_writing_responses(session_id, participant_id, round_index)
    VALUES (v_session.id, v_participant.id, p_round_index)
    ON CONFLICT (participant_id, round_index) DO NOTHING;

    UPDATE public.live_writing_responses
    SET handed_in_at = coalesce(handed_in_at, now())
    WHERE participant_id = v_participant.id AND round_index = p_round_index
    RETURNING handed_in_at INTO v_handed_in;

    UPDATE public.live_writing_participants SET last_seen_at = now() WHERE id = v_participant.id;

    RETURN QUERY SELECT v_handed_in;
END;
$$;

-- Self-check: rating + note only, after hand-in. Deliberately separate from the teacher's grade.
create or replace function public.self_check_live_writing(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_rating int,
    p_note text
)
RETURNS TABLE (self_rating int, self_note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
BEGIN
    IF p_rating NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'invalid_rating';
    END IF;
    IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
        RAISE EXCEPTION 'note_too_long';
    END IF;

    v_participant := public.live_writing_participant_for_token(p_participant_id, p_token);
    IF v_participant.id IS NULL THEN
        RAISE EXCEPTION 'invalid_token';
    END IF;

    SELECT * INTO v_session FROM public.live_writing_sessions WHERE id = v_participant.session_id;
    IF v_session.status NOT IN ('writing', 'voting', 'finals') THEN
        RAISE EXCEPTION 'round_closed';
    END IF;

    UPDATE public.live_writing_responses
    SET self_rating = p_rating, self_note = p_note
    WHERE participant_id = v_participant.id
      AND round_index = p_round_index
      AND handed_in_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_handed_in';
    END IF;

    RETURN QUERY SELECT p_rating, p_note;
END;
$$;

create or replace function public.submit_live_writing_vote(
    p_participant_id uuid,
    p_token text,
    p_round_index int,
    p_chosen_participant_id uuid
)
RETURNS TABLE (chosen_participant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_participant public.live_writing_participants;
    v_session public.live_writing_sessions;
BEGIN
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
    IF p_chosen_participant_id = v_participant.id THEN
        RAISE EXCEPTION 'self_vote';
    END IF;

    -- Only a handed-in response from the same session and round can be chosen, and the voter must
    -- have handed in too. This keeps the vote tied to what was actually shown in class.
    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_responses
        WHERE participant_id = v_participant.id
          AND round_index = p_round_index
          AND handed_in_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'not_handed_in';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.live_writing_responses
        WHERE participant_id = p_chosen_participant_id
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
        VALUES (v_session.id, p_round_index, v_participant.id, p_chosen_participant_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'already_voted';
    END;

    RETURN QUERY SELECT p_chosen_participant_id;
END;
$$;

-- ── 6. Teacher vote control ──────────────────────────────────────────────────

-- Opening a round deletes that round's votes, which is what a teacher's "reopen" means: students
-- vote again on fresh pairs. Closing just freezes the current votes.
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
BEGIN
    SELECT * INTO v_session FROM public.live_writing_sessions
    WHERE id = p_session_id AND owner_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_session_owner';
    END IF;

    IF p_open THEN
        IF p_round_index NOT BETWEEN 1 AND v_session.round_count THEN
            RAISE EXCEPTION 'invalid_round';
        END IF;
        DELETE FROM public.live_writing_votes
        WHERE session_id = p_session_id AND round_index = p_round_index;
        UPDATE public.live_writing_sessions
        SET status = 'voting', current_round = p_round_index, votes_open = true
        WHERE id = p_session_id;
    ELSE
        UPDATE public.live_writing_sessions SET votes_open = false WHERE id = p_session_id;
    END IF;
END;
$$;

-- ── 7. Grants ────────────────────────────────────────────────────────────────

revoke all on function public.live_writing_roster(text) from public;
revoke all on function public.join_live_writing_session(text, text) from public;
revoke all on function public.save_live_writing_text(uuid, text, int, text) from public;
revoke all on function public.hand_in_live_writing(uuid, text, int) from public;
revoke all on function public.self_check_live_writing(uuid, text, int, int, text) from public;
revoke all on function public.submit_live_writing_vote(uuid, text, int, uuid) from public;
revoke all on function public.set_live_writing_voting(uuid, int, boolean) from public;

grant execute on function public.live_writing_roster(text) to anon, authenticated;
grant execute on function public.join_live_writing_session(text, text) to anon, authenticated;
grant execute on function public.save_live_writing_text(uuid, text, int, text) to anon, authenticated;
grant execute on function public.hand_in_live_writing(uuid, text, int) to anon, authenticated;
grant execute on function public.self_check_live_writing(uuid, text, int, int, text) to anon, authenticated;
grant execute on function public.submit_live_writing_vote(uuid, text, int, uuid) to anon, authenticated;
grant execute on function public.set_live_writing_voting(uuid, int, boolean) to authenticated;

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
    ('grade_scales',              'grade_scales',              'owner_id = $1'),
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
    ('live_writing_votes',        'live_writing_votes',        'voter_participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1)', 'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('live_writing_responses',    'live_writing_responses',    'participant_id IN (SELECT id FROM public.live_writing_participants WHERE student_id = $1)',       'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('live_writing_participants', 'live_writing_participants', 'student_id = $1',                                                                          'session_id IN (SELECT id FROM public.live_writing_sessions WHERE owner_id = $2)'),
    ('students',                  'students',                  'id = $1',                                                                                  'owner_id = $2')
$$;
