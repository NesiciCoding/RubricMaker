-- Testing environment: teacher-built tests and student test attempts.
-- Same jsonb-document pattern as speaking_sessions (001_initial_schema.sql):
-- real columns only for identity/ownership, everything else in `data`.

create table if not exists public.tests (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists tests_owner_id_idx on public.tests(owner_id);

create table if not exists public.student_tests (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists student_tests_owner_id_idx on public.student_tests(owner_id);

alter table public.tests enable row level security;
alter table public.student_tests enable row level security;

drop policy if exists "tests_own" on public.tests;
create policy "tests_own"
  on public.tests for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "student_tests_own" on public.student_tests;
create policy "student_tests_own"
  on public.student_tests for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
