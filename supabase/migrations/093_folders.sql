-- Folders (#850): flat, named groups for rubrics and tests.
--
-- Stored like every other authored collection: id + owner_id as real columns for RLS, the
-- entity itself as jsonb. `kind` lives inside `data` and keeps the rubric and test trees
-- apart. Deleting a folder never deletes its contents — the client clears `folderId` on the
-- items before dropping the row, so a folder can go away while its rubrics and tests stay.

create table if not exists public.folders (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists folders_owner_id_idx on public.folders(owner_id);

alter table public.folders enable row level security;

drop policy if exists "folders_owner_select" on public.folders;
create policy "folders_owner_select" on public.folders
  for select using (auth.uid() = owner_id);

drop policy if exists "folders_owner_insert" on public.folders;
create policy "folders_owner_insert" on public.folders
  for insert with check (auth.uid() = owner_id);

drop policy if exists "folders_owner_update" on public.folders;
create policy "folders_owner_update" on public.folders
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "folders_owner_delete" on public.folders;
create policy "folders_owner_delete" on public.folders
  for delete using (auth.uid() = owner_id);

-- Register the new table with the owner-data registry so nightly backups and
-- "Delete all my database data" cover it (#631). Redefined here per supabase/CLAUDE.md;
-- the list is otherwise identical to 079_owner_data_registry.sql.

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
    ('marketplace_upvotes',       'marketplace_upvotes',       'profile_id = $1')
$$;

REVOKE EXECUTE ON FUNCTION public.owner_data_tables() FROM PUBLIC, anon, authenticated;
