-- Saved rubric templates ("save as template" on the Rubric Builder), previously
-- localStorage-only and lost on device change. Same jsonb-document pattern as
-- essay_templates (036_essay_templates.sql).

create table if not exists public.user_templates (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists user_templates_owner_id_idx on public.user_templates(owner_id);

alter table public.user_templates enable row level security;

drop policy if exists "user_templates_own" on public.user_templates;
create policy "user_templates_own"
  on public.user_templates for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
