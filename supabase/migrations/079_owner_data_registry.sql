-- Migration 079: one registry of owner-scoped tables, used by export_owner_backup (#631).
--
-- export_owner_backup() was rewritten by hand in 051–075 and drifted: rubric_versions and
-- standard_mastery_targets were dropped again by later versions, and messages,
-- test_assignments, recording_metadata, scan_metadata, rubric_shares, class_members and the
-- marketplace tables were never included, so a restore from the nightly snapshot silently
-- lacked them. The table list now lives in owner_data_tables(); the backup iterates it, and
-- src/__tests__/ownerDataRegistry.test.ts fails when
-- a migration adds a public table that is neither registered here nor allow-listed there.
--
-- Deliberately NOT registered (account/org-level or compliance data, not a teacher's content):
--   profiles, schools, school_members, audit_logs, client_logs, site_config.

-- ── 1. Registry ─────────────────────────────────────────────────────────────────
-- owner_filter is a trusted SQL predicate on alias-free columns, with $1 = the owner's uuid.
-- Keys match the snapshot keys earlier backups used, so old and new snapshots line up.
CREATE OR REPLACE FUNCTION public.owner_data_tables()
RETURNS TABLE (key text, table_name text, owner_filter text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  VALUES
    ('rubrics',                   'rubrics',                   'owner_id = $1'),
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
    ('marketplace_upvotes',       'marketplace_upvotes',       'profile_id = $1')
$$;

REVOKE EXECUTE ON FUNCTION public.owner_data_tables() FROM PUBLIC, anon, authenticated;

-- ── 2. Backup driven by the registry ────────────────────────────────────────────
-- STABLE: every per-table query reads the calling statement's snapshot, so a concurrent write
-- between two tables (a rubric and its version, say) cannot produce an inconsistent snapshot.
CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      record;
  rows   jsonb;
  result jsonb := '{}'::jsonb;
BEGIN
  FOR r IN SELECT * FROM public.owner_data_tables() LOOP
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
      r.table_name, r.owner_filter
    ) INTO rows USING target_owner;
    result := result || jsonb_build_object(r.key, rows);
  END LOOP;
  -- user_settings is one row per user; earlier snapshots stored it as an object, not a list.
  result := jsonb_set(result, '{user_settings}', COALESCE(result->'user_settings'->0, 'null'::jsonb));
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.export_owner_backup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_owner_backup(uuid) TO service_role;
