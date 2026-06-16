-- Essay templates: saved assignment configurations not yet assigned to any student.
-- Same jsonb-document pattern as tests (033_tests_tables.sql).

create table if not exists public.essay_templates (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists essay_templates_owner_id_idx on public.essay_templates(owner_id);

alter table public.essay_templates enable row level security;

drop policy if exists "essay_templates_own" on public.essay_templates;
create policy "essay_templates_own"
  on public.essay_templates for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
