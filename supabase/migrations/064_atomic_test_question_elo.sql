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
-- committed, instead of both racing off the same client-side snapshot.

CREATE OR REPLACE FUNCTION public.update_test_question_elo(p_test_id text, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ratings jsonb;
BEGIN
  -- p_updates: [{ questionId: text, eloRating: number }, ...] -> { questionId: eloRating }
  SELECT jsonb_object_agg(u ->> 'questionId', u -> 'eloRating')
  INTO v_ratings
  FROM jsonb_array_elements(p_updates) AS u;

  UPDATE public.tests
  SET data = jsonb_set(
    data,
    '{questions}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN v_ratings ? (q ->> 'id') THEN jsonb_set(q, '{eloRating}', v_ratings -> (q ->> 'id'))
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
