-- Migration 064: Atomic per-question Elo rating update for submit-test (roadmap 28.4).
--
-- submit-test previously read the whole tests.data JSONB blob, mutated the eloRating
-- field of the questions touched by a submission's staircase levelPath in JS, and wrote
-- the whole blob back — a classic read-modify-write race. Two students submitting the
-- same staircase placement test around the same time (the 25.4 use case: a whole class
-- taking a placement test in one sitting) could have the second write silently discard
-- the first submission's rating changes.
--
-- This RPC instead does the read-and-rewrite of the `questions` array inside a single
-- UPDATE statement, so Postgres' row lock on the target `tests` row serializes concurrent
-- calls — the second caller's subquery re-reads the row only after the first has
-- committed. Critically, the *new* rating is also computed inside that same locked
-- subquery from the row's current eloRating, rather than being handed a client-precomputed
-- absolute value: an absolute replacement would still lose an update when two submissions
-- touch the *same* question, since the second caller's precomputed value is only correct
-- against the pre-lock snapshot it read before waiting on the lock, not the first caller's
-- now-committed result. Callers instead pass the replay inputs (opponent rating, correct
-- flag) and the delta is applied against whatever eloRating the row actually holds at
-- update time — mirrors updateItemElo()/eloExpectedScore() in
-- supabase/functions/submit-test/index.ts (and src/utils/placementStaircase.ts).

CREATE OR REPLACE FUNCTION public.update_test_question_elo(p_test_id text, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inputs jsonb;
BEGIN
  -- p_updates: [{ questionId: text, opponentRating: number, correct: boolean }, ...]
  -- -> { questionId: { opponentRating, correct } }
  SELECT jsonb_object_agg(
    u ->> 'questionId',
    jsonb_build_object('opponentRating', u -> 'opponentRating', 'correct', u -> 'correct')
  )
  INTO v_inputs
  FROM jsonb_array_elements(p_updates) AS u;

  UPDATE public.tests
  SET data = jsonb_set(
    data,
    '{questions}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN v_inputs ? (q ->> 'id') THEN jsonb_set(
              q,
              '{eloRating}',
              to_jsonb(
                COALESCE((q ->> 'eloRating')::numeric, 1200)
                - 24 * (
                    (CASE WHEN (v_inputs -> (q ->> 'id') ->> 'correct')::boolean THEN 1 ELSE 0 END)
                    - 1.0 / (
                        1 + power(
                          10::numeric,
                          (
                            COALESCE((q ->> 'eloRating')::numeric, 1200)
                            - (v_inputs -> (q ->> 'id') ->> 'opponentRating')::numeric
                          ) / 400.0
                        )
                      )
                  )
              )
            )
            ELSE q
          END
          ORDER BY ord
        )
        FROM jsonb_array_elements(data -> 'questions') WITH ORDINALITY AS t(q, ord)
      ),
      data -> 'questions'
    )
  )
  WHERE id = p_test_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'test % not found', p_test_id;
  END IF;
END;
$$;

-- Only callable by service_role (the edge-function runtime) — mirrors get_overdue_attachments.
REVOKE ALL ON FUNCTION public.update_test_question_elo(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_test_question_elo(text, jsonb) TO service_role;
