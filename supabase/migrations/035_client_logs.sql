-- Stress-test diagnostics: append-only client-side event log.
-- Captures action/sync/error/lifecycle events from both the teacher app and
-- the standalone student pages (essay, test, feedback, preview), tagged with
-- session/role/school for reconstructing what happened during a pilot class.
-- Only written to when the client build sets VITE_STRESS_TEST_LOGGING=true.

create table if not exists public.client_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  role text,
  school_id text,
  user_id uuid,
  category text not null,
  name text not null,
  level text not null default 'info',
  meta jsonb,
  app_version text
);
create index if not exists client_logs_created_at_idx on public.client_logs(created_at);
create index if not exists client_logs_session_idx on public.client_logs(session_id);

alter table public.client_logs enable row level security;

-- Any signed-in client (including anonymous student sign-ins) may append
-- diagnostic events; rows carry no content that benefits an attacker.
drop policy if exists "client_logs_insert" on public.client_logs;
create policy "client_logs_insert"
  on public.client_logs for insert
  to authenticated
  with check (true);

-- Logs are write-only from the client; reviewed via the SQL editor / service role.
drop policy if exists "client_logs_no_select" on public.client_logs;
create policy "client_logs_no_select"
  on public.client_logs for select
  using (false);
