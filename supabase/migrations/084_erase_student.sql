-- Migration 084: erase one student — every row and file keyed to them (#644).
--
-- "Delete" only archived a student and "Anonymize" (017/078) only rewrote the students row, so
-- grades with free-text comments, voice feedback, essays, messages, test answers, attachments,
-- scans, self-assessments and recordings stayed linked to the student. This gives the student's
-- teacher a right-to-erasure path.
--
-- Flow (src/services/database/SupabaseAdapter.ts eraseStudentData):
--   1. student_storage_objects(id) lists the files that belong to the student; the client removes
--      them through the Storage API while the rows that locate them still exist.
--   2. erase_student(id, storage_failures) deletes the rows from every registered table and
--      records anything left behind in the audit log.
--
-- Scope: the student's teacher (students.owner_id) erases everything keyed to the student,
-- including grades other graders gave in a shared class. If the student row was never synced,
-- only the caller's own rows are erased; if another teacher owns it, the call is refused.

-- ── 1. Registry of student-keyed tables ──────────────────────────────────────────
-- student_filter: trusted predicate with $1 = student id. owner_filter: with $2 = caller uuid,
-- applied when the caller may only erase their own rows. Children come before the parents
-- their filters look up (comments before attachments, recordings before sessions, …).
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
    ('students',                  'students',                  'id = $1',                                                                                  'owner_id = $2')
$$;

REVOKE EXECUTE ON FUNCTION public.student_data_tables() FROM PUBLIC, anon, authenticated;

-- ── 2. Who may erase ─────────────────────────────────────────────────────────────
-- true: the caller is the student's teacher (erase everything); false: the student row isn't
-- in the database (erase the caller's own rows only); raises when another teacher owns it.
CREATE OR REPLACE FUNCTION public.student_erasure_scope(p_student_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT owner_id INTO v_owner FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the student''s teacher can erase this student' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.student_erasure_scope(text) FROM PUBLIC, anon, authenticated;

-- ── 3. The student's storage objects ────────────────────────────────────────────
-- Folder-per-user buckets are located through their metadata rows; essays live under
-- {essay_assignment_id}/; voice feedback is referenced from student_rubrics.data entries.
CREATE OR REPLACE FUNCTION public.student_storage_objects(p_student_id text)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_all boolean := public.student_erasure_scope(p_student_id);
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE
    (o.bucket_id = 'attachments' AND o.name IN (
      SELECT a.storage_path FROM public.attachments a
      WHERE a.data->>'studentId' = p_student_id AND (v_all OR a.owner_id = v_uid)))
    OR (o.bucket_id = 'scans' AND o.name IN (
      SELECT s.storage_path FROM public.scan_metadata s
      WHERE s.student_id = p_student_id AND (v_all OR s.owner_id = v_uid)))
    OR (o.bucket_id = 'recordings' AND o.name IN (
      SELECT r.storage_path FROM public.recording_metadata r
      WHERE r.session_id IN (SELECT ss.id FROM public.speaking_sessions ss WHERE ss.student_id = p_student_id)
        AND (v_all OR r.owner_id = v_uid)))
    OR (o.bucket_id = 'essays' AND (storage.foldername(o.name))[1] IN (
      SELECT ea.id FROM public.essay_assignments ea
      WHERE ea.student_id = p_student_id AND (v_all OR ea.owner_id = v_uid)))
    OR (o.bucket_id = 'feedback-audio' AND o.name IN (
      SELECT e->>'audioStoragePath'
      FROM public.student_rubrics sr,
           jsonb_array_elements(CASE WHEN jsonb_typeof(sr.data->'entries') = 'array' THEN sr.data->'entries' ELSE '[]'::jsonb END) e
      WHERE sr.student_id = p_student_id AND (v_all OR sr.grader_id = v_uid)))
  ORDER BY o.bucket_id, o.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.student_storage_objects(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_storage_objects(text) TO authenticated;

-- ── 4. Erase the rows ───────────────────────────────────────────────────────────
-- Each table is its own subtransaction. The first failure stops the run: the registry deletes
-- children before the parents their filters look up (students last), so carrying on would orphan
-- the failed table's rows and drop the scope a retry needs. Later tables are reported as skipped.
-- p_storage_failures lists files the client could not remove (e.g. voice feedback another
-- grader recorded, which Storage RLS keeps in that grader's folder); they are written to the
-- audit log so an operator can delete them — the rows that located them are gone afterwards.
CREATE OR REPLACE FUNCTION public.erase_student(p_student_id text, p_storage_failures jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all     boolean := public.student_erasure_scope(p_student_id);
  v_uid     uuid := auth.uid();
  r         record;
  v_n       bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_errors  jsonb := '{}'::jsonb;
  v_failed  boolean := false;
BEGIN
  FOR r IN
    SELECT t.key, t.table_name, t.student_filter, t.owner_filter
    FROM public.student_data_tables() WITH ORDINALITY AS t(key, table_name, student_filter, owner_filter, pos)
    ORDER BY t.pos
  LOOP
    IF v_failed THEN
      v_errors := v_errors || jsonb_build_object(r.key, 'skipped');
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format(
        'DELETE FROM public.%I WHERE (%s) AND ($3 OR (%s))',
        r.table_name, r.student_filter, r.owner_filter
      ) USING p_student_id, v_uid, v_all;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object(r.key, v_n);
    EXCEPTION WHEN others THEN
      v_errors := v_errors || jsonb_build_object(r.key, SQLERRM);
      v_failed := true;
    END;
  END LOOP;

  -- The audit row holds the opaque student id and counts only — nothing that identifies them.
  INSERT INTO public.audit_logs (actor_id, category, action, entity_type, entity_id, details)
  VALUES (v_uid, 'admin', 'erase_student', 'student', p_student_id,
          jsonb_build_object('deleted', v_deleted, 'errors', v_errors,
                             'storage_failures', COALESCE(p_storage_failures, '[]'::jsonb)));

  RETURN jsonb_build_object('deleted', v_deleted, 'errors', v_errors);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.erase_student(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erase_student(text, jsonb) TO authenticated;
