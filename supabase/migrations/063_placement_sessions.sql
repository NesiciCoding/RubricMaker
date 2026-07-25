-- Migration 063: Live placement generator sessions (roadmap Phase 27.1/27.2).
--
-- Server-authoritative per-(assignment,student) run state for a generator-engine
-- placement test (Test.placementEngine === 'generator'): unlike 'mst'/'staircase',
-- a generator test has no pre-authored sections/questions — every question is pulled
-- live from question_bank_items at runtime by the next-placement-question edge
-- function, which owns this table exclusively via the service role key. Also carries
-- the one-shot teacher level nudge (27.2) consumed by the next pick.
--
-- One row per test_assignments row (1:1, same cardinality as essay_assignments'
-- mirrored student-scoped rows). Students never get direct table access — all
-- mutations go through next-placement-question (service role) or the
-- set_placement_override() RPC below. Teachers get read-only access, for a
-- persisted fallback view (27.3) alongside the live Realtime broadcast.

CREATE TABLE IF NOT EXISTS public.placement_sessions (
  id                  TEXT PRIMARY KEY,                    -- = assignment_id (1:1)
  owner_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignment_id       TEXT NOT NULL UNIQUE REFERENCES public.test_assignments(id) ON DELETE CASCADE,
  student_user_id     UUID NOT NULL,
  -- The level the run actually started from (the configured range's midpoint, or a
  -- teacher-preselected starter bank item's own level, clamped into range) — fixed for the
  -- life of the session and re-used as computeState's replay baseline on every call, since
  -- it may differ from generatorConfig's range midpoint.
  start_level         TEXT NOT NULL,
  current_level       TEXT NOT NULL,
  -- The bank item/question currently shown but not yet answered; NULL once
  -- answered-and-advanced or the run has converged. Lets a page reload re-fetch the
  -- same pending question idempotently instead of drawing a fresh one.
  -- Shape: { bankItemId, kind: 'question'|'section', questionId, sectionQuestionIndex? }
  pending             JSONB,
  level_path          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- StaircaseStep[]
  -- Full TestQuestion snapshots for every step in level_path, in the same order —
  -- generator questions are pulled from the bank at runtime and never authored into
  -- tests.data.questions, so student_tests needs its own copy for review/grading
  -- (TestResultsPage) once submitted. Copied onto the student_tests row at submit time.
  asked_questions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  asked_item_ids      TEXT[] NOT NULL DEFAULT '{}',
  -- One-shot teacher nudge (27.2): 'up' | 'down' | NULL, consumed and cleared by the
  -- very next next-placement-question pick.
  override_direction  TEXT CHECK (override_direction IN ('up', 'down')),
  status              TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'converged', 'submitted')),
  -- Sliding-window rate limit for next-placement-question, scoped to this session rather
  -- than a global per-user table (there's no natural per-call log table to count against,
  -- unlike submit-test's once-per-attempt student_tests count).
  rate_window_start   TIMESTAMPTZ,
  rate_window_count   INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS placement_sessions_owner_idx ON public.placement_sessions(owner_id);

ALTER TABLE public.placement_sessions ENABLE ROW LEVEL SECURITY;

-- Teacher: read-only. All writes go through the service-role edge function or the
-- scoped RPC below.
DROP POLICY IF EXISTS "placement_sessions_owner_select" ON public.placement_sessions;
CREATE POLICY "placement_sessions_owner_select"
  ON public.placement_sessions FOR SELECT
  USING ((SELECT auth.uid()) = owner_id);

-- Scoped write: lets a teacher set the one-shot next-question override (27.2)
-- without any broader UPDATE grant on the table. Raises (rather than silently
-- no-op'ing) when nothing matched, so a wrong assignmentId or non-owner caller
-- surfaces as a failed call instead of the teacher UI reporting a nudge that was
-- never actually recorded.
CREATE OR REPLACE FUNCTION public.set_placement_override(p_assignment_id text, p_direction text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid direction: %', p_direction;
  END IF;
  UPDATE public.placement_sessions
  SET override_direction = p_direction, updated_at = now()
  WHERE assignment_id = p_assignment_id AND owner_id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no placement session for assignment %', p_assignment_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_placement_override(text, text) TO authenticated;

-- Full replacement of export_owner_backup (062, last extended by document_comments)
-- — same body plus placement_sessions appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flashes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flashes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flash_reads',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flash_reads t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('question_bank_items',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.question_bank_items t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('document_comments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.document_comments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('placement_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.placement_sessions t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;
