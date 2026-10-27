-- The Grafana role (IN ROLE pg_monitor, see 091) saw nothing on three dashboards:
--
-- 1. Application Usage & Data Health read the app's tables directly. Every one of them has row-level
--    security keyed on auth.uid(), which a database login does not have, so every panel showed 0 or
--    "No data". The only way around it was a BYPASSRLS role that can read every grade, essay and
--    message. These functions return what the panels show (counts, per-day counts, latest
--    timestamps, per-school totals, the top graders' display names) and never row contents. Like
--    monitoring.failed_jobs() they run as their owner, live in the monitoring schema that PostgREST
--    does not expose, and only members of pg_monitor may call them.
--
-- 2. Client Diagnostics and Performance & Web Vitals read client_logs, whose only SELECT policy
--    (client_logs_no_select, 035) is `using (false)`, so a GRANT SELECT still returned no rows.
--    client_logs holds ids, counts and durations (never free text, see README → Stress-test
--    logging), and it exists to be read by the operator's dashboards, so pg_monitor members may read
--    it. The API roles still cannot: the policy names pg_monitor only.

create schema if not exists monitoring;
revoke all on schema monitoring from public;
grant usage on schema monitoring to pg_monitor;

-- ── 1. Application Usage ─────────────────────────────────────────────────────────────────────────

create or replace function monitoring.app_entity_counts()
returns table (domain text, count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select 'teachers', count(*) from public.profiles
  union all select 'schools', count(*) from public.schools
  union all select 'classes', count(*) from public.classes
  union all select 'students', count(*) from public.students
  union all select 'rubrics', count(*) from public.rubrics
  union all select 'grades', count(*) from public.student_rubrics where not is_peer_review
  union all select 'peer_reviews', count(*) from public.student_rubrics where is_peer_review
  union all select 'tests', count(*) from public.tests
  union all select 'test_attempts', count(*) from public.student_tests
  union all select 'essay_assignments', count(*) from public.essay_assignments
  union all select 'essay_submissions', count(*) from public.essay_submissions
  union all select 'messages', count(*) from public.messages
  union all select 'flashcard_decks', count(*) from public.flashcard_decks
  union all select 'flashcard_reviews', count(*) from public.flashcard_reviews
  union all select 'question_bank_items', count(*) from public.question_bank_items
  union all select 'marketplace_listings', count(*) from public.marketplace_listings
  union all select 'grading_tasks', count(*) from public.grading_tasks
$$;

create or replace function monitoring.app_active_teachers(range_start timestamptz, range_end timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct owner_id) from public.rubrics
  where created_at between range_start and range_end
$$;

-- Days are UTC, as Grafana's $__timeGroup(…, '1d') bucketed them.
create or replace function monitoring.app_daily_activity(range_start timestamptz, range_end timestamptz)
returns table (day timestamptz, metric text, n bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with events (metric, at) as (
    select 'rubrics', created_at from public.rubrics
    union all
    select 'grades', coalesce(data->>'gradedAt', data->>'updatedAt')::timestamptz
      from public.student_rubrics
      where not is_peer_review and coalesce(data->>'gradedAt', data->>'updatedAt') is not null
    union all
    select 'essays', submitted_at from public.essay_submissions where submitted_at is not null
    union all
    select 'test_attempts', (data->>'startedAt')::timestamptz
      from public.student_tests where data->>'startedAt' is not null
    union all
    select 'signups', created_at from public.profiles
    union all
    select 'listings', created_at from public.marketplace_listings
  )
  select date_bin(interval '1 day', at, timestamptz '2000-01-01 00:00:00+00'), metric, count(*)
  from events
  where at between range_start and range_end
  group by 1, 2
  order by 1, 2
$$;

create or replace function monitoring.app_school_activity()
returns table (school text, students bigint, grades bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.name,
    (select count(*) from public.students st
      join public.profiles p on p.id = st.owner_id
      where p.school_id = s.id),
    (select count(*) from public.student_rubrics sr
      join public.profiles p on p.id = sr.grader_id
      where p.school_id = s.id and not sr.is_peer_review)
  from public.schools s
$$;

-- A teacher without a display name shows as the first letter of their email and a mask.
create or replace function monitoring.app_top_graders(max_rows int default 20)
returns table (teacher text, grades bigint, last_graded timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(nullif(p.display_name, ''), left(p.email, 1) || '•••'),
    count(*),
    max((sr.data->>'gradedAt')::timestamptz)
  from public.student_rubrics sr
  join public.profiles p on p.id = sr.grader_id
  where not sr.is_peer_review
  group by p.id
  order by 2 desc
  limit least(greatest(max_rows, 0), 100)
$$;

create or replace function monitoring.app_latest_activity()
returns table (domain text, last_activity timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'profiles', max(created_at) from public.profiles
  union all select 'rubrics', max(updated_at) from public.rubrics
  union all select 'grades', max((data->>'updatedAt')::timestamptz)
    from public.student_rubrics where not is_peer_review
  union all select 'test_attempts', max((data->>'startedAt')::timestamptz) from public.student_tests
  union all select 'essay_submissions', max(submitted_at) from public.essay_submissions
  union all select 'messages', max(created_at) from public.messages
  union all select 'flashcard_decks', max((data->>'updatedAt')::timestamptz) from public.flashcard_decks
  union all select 'flashcard_reviews', max((data->>'updatedAt')::timestamptz) from public.flashcard_reviews
  union all select 'marketplace', max(updated_at) from public.marketplace_listings
$$;

revoke all on function monitoring.app_entity_counts() from public;
revoke all on function monitoring.app_active_teachers(timestamptz, timestamptz) from public;
revoke all on function monitoring.app_daily_activity(timestamptz, timestamptz) from public;
revoke all on function monitoring.app_school_activity() from public;
revoke all on function monitoring.app_top_graders(int) from public;
revoke all on function monitoring.app_latest_activity() from public;
grant execute on function monitoring.app_entity_counts() to pg_monitor;
grant execute on function monitoring.app_active_teachers(timestamptz, timestamptz) to pg_monitor;
grant execute on function monitoring.app_daily_activity(timestamptz, timestamptz) to pg_monitor;
grant execute on function monitoring.app_school_activity() to pg_monitor;
grant execute on function monitoring.app_top_graders(int) to pg_monitor;
grant execute on function monitoring.app_latest_activity() to pg_monitor;

-- ── 2. client_logs ───────────────────────────────────────────────────────────────────────────────

grant select on public.client_logs to pg_monitor;

drop policy if exists "client_logs_monitor_select" on public.client_logs;
create policy "client_logs_monitor_select"
  on public.client_logs for select
  to pg_monitor
  using (true);
