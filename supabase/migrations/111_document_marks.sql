-- Migration 111: proofreading marks on graded documents (roadmap PM-03, epic #1346).
--
-- The persisted half of the margin marks PM-02 defines and PM-04 renders. Same shape as
-- document_comments (062): one jsonb-doc table, owner-only RLS, grading-side only — a mark is
-- the teacher's annotation on a student's document, so no student read/write path exists.
--
-- The anchor lives inside `data` (`anchor`, `snippetHash`), exactly as DocumentMark carries it;
-- `attachmentId` inside `data` is the index the review surface filters by.

CREATE TABLE IF NOT EXISTS public.document_marks (
  id         TEXT        PRIMARY KEY,
  owner_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_marks_owner_idx ON public.document_marks(owner_id);
-- Every read is "the marks for this document"; the id lives in the jsonb doc like the
-- document_comments shape, so it is an expression index rather than a column.
CREATE INDEX IF NOT EXISTS document_marks_attachment_idx ON public.document_marks(((data ->> 'attachmentId')));

ALTER TABLE public.document_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_marks_owner_all"
  ON public.document_marks FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── Registries ──────────────────────────────────────────────────────────────────
-- Both backup ("delete all my database data", export_owner_backup) and student erasure
-- (erase_student) are data-driven from these two functions, so the table only has to be
-- registered here. Marks come before attachments: the student filter looks attachments up.

CREATE OR REPLACE FUNCTION public.student_data_tables()
RETURNS TABLE (key text, table_name text, student_filter text, owner_filter text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('document_comments',         'document_comments',         $f$data->>'attachmentId' IN (SELECT id FROM public.attachments WHERE data->>'studentId' = $1)$f$, 'owner_id = $2'),
    ('document_marks',            'document_marks',            $f$data->>'attachmentId' IN (SELECT id FROM public.attachments WHERE data->>'studentId' = $1)$f$, 'owner_id = $2'),
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

REVOKE EXECUTE ON FUNCTION public.student_data_tables() FROM PUBLIC, anon, authenticated;

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
    ('document_marks',            'document_marks',            'owner_id = $1'),
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
    ('live_writing_sessions',     'live_writing_sessions',     'owner_id = $1'),
    ('school_highlight_snapshots','school_highlight_snapshots','owner_id = $1')
$$;

REVOKE EXECUTE ON FUNCTION public.owner_data_tables() FROM PUBLIC, anon, authenticated;
