-- Migration 042: Grading task assignment
-- Same jsonb-document pattern as essay_templates (036_essay_templates.sql).
-- `assigned_to_teacher` is a free-text name/email (same loose-identity model as
-- co-grading's `gradedBy`), not a profile id, so RLS stays owner-only — the
-- creator manages the tasks they assigned.

create table if not exists public.grading_tasks (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists grading_tasks_owner_id_idx on public.grading_tasks(owner_id);

alter table public.grading_tasks enable row level security;

drop policy if exists "grading_tasks_own" on public.grading_tasks;
create policy "grading_tasks_own"
  on public.grading_tasks for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
