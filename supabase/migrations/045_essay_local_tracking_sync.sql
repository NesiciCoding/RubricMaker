-- Multi-device sync for two local-only essay collections that are distinct from
-- the existing essay_assignments/essay_submissions tables:
--
-- - essay_batch_assignments: a teacher's class-assignment bookkeeping (which
--   student was assigned which essay), used by the Activity Dashboard/EssayListPage.
--   Unrelated to essay_assignments, which is a single row per shareable link used
--   by the student-facing DB-submission flow (keyed by teacherKey alone).
-- - essay_offline_submissions: essays imported via a manually pasted share code
--   (the fully offline submission path, no student account), embedding full HTML
--   content — distinct from essay_submissions, which stores Storage-bucket paths
--   for the online student-portal flow.
--
-- Same jsonb-document pattern as essay_templates (036_essay_templates.sql).
--
-- Indexes below are plain (not CONCURRENTLY) intentionally: Supabase migrations run
-- inside a transaction, where CONCURRENTLY is not allowed. Both tables are created
-- immediately above in this same migration, so there's no existing data to lock.

create table if not exists public.essay_batch_assignments (
  id text primary key, -- `${teacherKey}:${studentId}`
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists essay_batch_assignments_owner_id_idx on public.essay_batch_assignments(owner_id);

create table if not exists public.essay_offline_submissions (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists essay_offline_submissions_owner_id_idx on public.essay_offline_submissions(owner_id);

alter table public.essay_batch_assignments enable row level security;
alter table public.essay_offline_submissions enable row level security;

drop policy if exists "essay_batch_assignments_own" on public.essay_batch_assignments;
create policy "essay_batch_assignments_own"
  on public.essay_batch_assignments for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "essay_offline_submissions_own" on public.essay_offline_submissions;
create policy "essay_offline_submissions_own"
  on public.essay_offline_submissions for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
