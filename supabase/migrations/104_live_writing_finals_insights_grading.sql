-- Live writing finals, insights and grading hand-off (Phase 43.5, #1156).
--
-- The finals gallery is teacher-only. Hidden texts disappear from later peer pairs and their
-- received vote is removed, so a moderated text cannot win a vote it was hidden from. Grading
-- hand-off markers make repeated "send" presses idempotent from the teacher UI's perspective.

alter table public.live_writing_responses
    add column if not exists final_hidden boolean not null default false,
    add column if not exists hidden_at timestamptz,
    add column if not exists grading_assignment_id text,
    add column if not exists grading_submission_id text;

create index if not exists live_writing_responses_finals_idx
    on public.live_writing_responses(session_id, round_index, handed_in_at desc);

comment on column public.live_writing_responses.final_hidden is
    'Teacher moderation flag: hidden texts are excluded from finals, pairs and votes.';
comment on column public.live_writing_responses.grading_assignment_id is
    'Set after a finals text is handed to the ordinary essay grading pipeline.';
comment on column public.live_writing_responses.grading_submission_id is
    'Set after a finals text is handed to the ordinary essay grading pipeline.';

create or replace function public.set_live_writing_text_hidden(
    p_session_id uuid,
    p_round_index int,
    p_participant_id uuid,
    p_hidden boolean
)
RETURNS void
LANGUAGE plpgsql
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

    IF p_hidden THEN
        DELETE FROM public.live_writing_votes
        WHERE session_id = p_session_id
          AND round_index = p_round_index
          AND chosen_participant_id = p_participant_id;

        DELETE FROM public.live_writing_peer_pairs
        WHERE session_id = p_session_id
          AND round_index = p_round_index
          AND (
              voter_participant_id = p_participant_id
              OR option_a_participant_id = p_participant_id
              OR option_b_participant_id = p_participant_id
          );
    END IF;

    UPDATE public.live_writing_responses
    SET final_hidden = p_hidden,
        hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END
    WHERE session_id = p_session_id
      AND round_index = p_round_index
      AND participant_id = p_participant_id
      AND handed_in_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'text_not_found';
    END IF;
END;
$$;

create or replace function public.set_live_writing_grading_handoff(
    p_session_id uuid,
    p_round_index int,
    p_participant_id uuid,
    p_assignment_id text,
    p_submission_id text
)
RETURNS void
LANGUAGE plpgsql
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

    UPDATE public.live_writing_responses
    SET grading_assignment_id = p_assignment_id,
        grading_submission_id = p_submission_id
    WHERE session_id = p_session_id
      AND round_index = p_round_index
      AND participant_id = p_participant_id
      AND handed_in_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'text_not_found';
    END IF;
END;
$$;

create or replace function public.replace_live_writing_final_text(
    p_session_id uuid,
    p_round_index int,
    p_participant_id uuid,
    p_content_html text
)
RETURNS void
LANGUAGE plpgsql
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

    DELETE FROM public.live_writing_votes
    WHERE session_id = p_session_id
      AND round_index = p_round_index
      AND chosen_participant_id = p_participant_id;

    DELETE FROM public.live_writing_peer_pairs
    WHERE session_id = p_session_id
      AND round_index = p_round_index
      AND (
          voter_participant_id = p_participant_id
          OR option_a_participant_id = p_participant_id
          OR option_b_participant_id = p_participant_id
      );

    UPDATE public.live_writing_responses
    SET content_html = p_content_html,
        word_count = public.live_writing_word_count(p_content_html),
        cefr_estimate = NULL,
        self_rating = NULL,
        self_note = NULL,
        final_hidden = false,
        hidden_at = NULL,
        grading_assignment_id = NULL,
        grading_submission_id = NULL
    WHERE session_id = p_session_id
      AND round_index = p_round_index
      AND participant_id = p_participant_id
      AND handed_in_at IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'text_not_found';
    END IF;
END;
$$;

create or replace function public.get_live_writing_finals(
    p_session_id uuid,
    p_round_index int
)
RETURNS TABLE (
    participant_id uuid,
    student_id text,
    display_name text,
    content_html text,
    word_count int,
    cefr_estimate text,
    self_rating text,
    self_note text,
    votes_received int,
    final_hidden boolean,
    handed_in_at timestamptz,
    grading_assignment_id text,
    grading_submission_id text
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
        p.student_id,
        p.display_name,
        coalesce(r.content_html, ''),
        coalesce(r.word_count, 0),
        r.cefr_estimate,
        r.self_rating,
        r.self_note,
        (
            SELECT count(*)::int
            FROM public.live_writing_votes AS v
            WHERE v.session_id = p_session_id
              AND v.round_index = p_round_index
              AND v.chosen_participant_id = p.id
        ),
        coalesce(r.final_hidden, false),
        r.handed_in_at,
        r.grading_assignment_id,
        r.grading_submission_id
    FROM public.live_writing_participants AS p
    LEFT JOIN public.live_writing_responses AS r
      ON r.participant_id = p.id
     AND r.round_index = p_round_index
    WHERE p.session_id = p_session_id
    ORDER BY 9 DESC, r.handed_in_at ASC NULLS LAST, p.display_name;
END;
$$;

-- Hidden texts cannot be handed to a later voting round.
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
          AND NOT r.final_hidden
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

create or replace function public.show_live_writing_finals(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
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

    UPDATE public.live_writing_sessions
    SET status = 'finals',
        votes_open = false,
        timer_state = 'ended',
        timer_ends_at = NULL
    WHERE id = p_session_id
      AND status IN ('voting', 'finals');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'session_not_voting';
    END IF;
END;
$$;

revoke all on function public.show_live_writing_finals(uuid) from public;
grant execute on function public.show_live_writing_finals(uuid) to authenticated;

-- The grading hand-off inserts and updates a submission as the assignment owner; the existing
-- insert policy only covered the student's own submission.
drop policy if exists essay_submissions_teacher_insert on public.essay_submissions;
create policy essay_submissions_teacher_insert on public.essay_submissions for insert
    with check (
        EXISTS (
            SELECT 1 FROM public.essay_assignments ea
            WHERE ea.id = essay_submissions.assignment_id
              AND ea.owner_id = (SELECT auth.uid())
        )
    );

drop policy if exists essay_submissions_teacher_update on public.essay_submissions;
create policy essay_submissions_teacher_update on public.essay_submissions for update
    using (
        EXISTS (
            SELECT 1 FROM public.essay_assignments ea
            WHERE ea.id = essay_submissions.assignment_id
              AND ea.owner_id = (SELECT auth.uid())
        )
    )
    with check (
        EXISTS (
            SELECT 1 FROM public.essay_assignments ea
            WHERE ea.id = essay_submissions.assignment_id
              AND ea.owner_id = (SELECT auth.uid())
        )
    );

revoke all on function public.set_live_writing_text_hidden(uuid, int, uuid, boolean) from public;
revoke all on function public.set_live_writing_grading_handoff(uuid, int, uuid, text, text) from public;
revoke all on function public.replace_live_writing_final_text(uuid, int, uuid, text) from public;
revoke all on function public.get_live_writing_finals(uuid, int) from public;
revoke all on function public.live_writing_generate_pairs(uuid, int, int) from public, anon, authenticated;

grant execute on function public.set_live_writing_text_hidden(uuid, int, uuid, boolean) to authenticated;
grant execute on function public.set_live_writing_grading_handoff(uuid, int, uuid, text, text) to authenticated;
grant execute on function public.replace_live_writing_final_text(uuid, int, uuid, text) to authenticated;
grant execute on function public.get_live_writing_finals(uuid, int) to authenticated;
