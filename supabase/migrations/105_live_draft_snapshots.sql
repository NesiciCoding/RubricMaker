-- Migration 105: keep the live monitor's draft snapshots (#1246 follow-up).
--
-- The monitor's per-student draft text has always been broadcast-only: every 5 s tick carries
-- word count/answers, and the prose rides along at most once a minute. That is enough while the
-- teacher's tab stays connected, but a reload, a sleeping laptop or a dropped Wi-Fi leaves the
-- roster with no idea what it already knew — the rows either go blank or keep claiming "within
-- the last minute" about an hour-old draft. This stores those once-a-minute snapshots so the
-- monitor can seed itself on open, and so a teacher has something to look at after class.
--
-- Students never get table access: rows arrive only through record_live_draft_snapshot(), which
-- resolves the assignment (and therefore the owner and the student) server-side and refuses a
-- caller who is not the assigned student.

-- ── 1. Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_draft_snapshots (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         TEXT        NOT NULL,
  assignment_id TEXT       NOT NULL,          -- essay_assignments.id / test_assignments.id (the teacherKey)
  owner_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id   TEXT        NOT NULL,          -- local app student ID, as on the assignment row
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  word_count   INTEGER     NOT NULL DEFAULT 0,
  draft_text   TEXT,                          -- student's own draft HTML; NULL on a words-only tick
  CONSTRAINT live_draft_snapshots_kind_check CHECK (kind IN ('test', 'essay'))
);

CREATE INDEX IF NOT EXISTS live_draft_snapshots_assignment_idx
  ON public.live_draft_snapshots (assignment_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS live_draft_snapshots_owner_idx
  ON public.live_draft_snapshots (owner_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS live_draft_snapshots_student_idx
  ON public.live_draft_snapshots (student_id);

ALTER TABLE public.live_draft_snapshots ENABLE ROW LEVEL SECURITY;

-- The teacher reads their own monitor history. There are deliberately no INSERT/UPDATE/DELETE
-- policies: the only write path is the SECURITY DEFINER function below.
DROP POLICY IF EXISTS "live_draft_snapshots_owner_select" ON public.live_draft_snapshots;
CREATE POLICY "live_draft_snapshots_owner_select"
  ON public.live_draft_snapshots FOR SELECT
  USING ((SELECT auth.uid()) = owner_id);

-- ── 2. Student write path ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_live_draft_snapshot(
  p_kind          TEXT,
  p_assignment_id TEXT,
  p_word_count    INTEGER,
  p_draft_text    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner   UUID;
  v_student TEXT;
BEGIN
  IF p_kind NOT IN ('test', 'essay') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  -- The same ceiling the essay editor and live writing use, so one paste cannot store a novel.
  IF p_draft_text IS NOT NULL AND char_length(p_draft_text) > 20000 THEN
    RAISE EXCEPTION 'draft_too_long';
  END IF;

  IF p_kind = 'essay' THEN
    SELECT a.owner_id, a.student_id INTO v_owner, v_student
    FROM public.essay_assignments a
    WHERE a.id = p_assignment_id;
  ELSE
    SELECT a.owner_id, a.student_id INTO v_owner, v_student
    FROM public.test_assignments a
    WHERE a.id = p_assignment_id;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'unknown_assignment';
  END IF;
  IF v_student NOT IN (SELECT public.get_my_student_ids()) THEN
    RAISE EXCEPTION 'not_your_assignment';
  END IF;

  INSERT INTO public.live_draft_snapshots (kind, assignment_id, owner_id, student_id, word_count, draft_text)
  VALUES (p_kind, p_assignment_id, v_owner, v_student, GREATEST(COALESCE(p_word_count, 0), 0), p_draft_text);
END;
$$;

REVOKE ALL ON FUNCTION public.record_live_draft_snapshot(TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_live_draft_snapshot(TEXT, TEXT, INTEGER, TEXT) TO authenticated;

-- ── 3. Registries ──────────────────────────────────────────────────────────────
-- Nightly backups (owner_data_tables) and "erase this student" (student_data_tables) both read
-- these lists; a table missing from either silently survives or silently disappears. Both are
-- redefined from their latest version (103) with the new table added.

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
    ('live_draft_snapshots',      'live_draft_snapshots',      'owner_id = $1'),
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
    ('live_draft_snapshots',      'live_draft_snapshots',      'student_id = $1',                                                                          'owner_id = $2'),
    ('students',                  'students',                  'id = $1',                                                                                  'owner_id = $2')
$$;
