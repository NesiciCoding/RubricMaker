-- #869: the observability stack alerts on failed scheduled jobs, but pg_cron's row-level security on
-- cron.job_run_details (username = current_user) shows a monitoring login none of the jobs, which
-- the migrator owns, so a plain SELECT always counted 0 and the alert could never fire. pg_net
-- failures (the digest's net.http_post to an edge function) are invisible to pg_cron altogether: the
-- job "succeeds" as soon as the request is queued.
--
-- monitoring.failed_jobs() returns only two counts, never job commands or response bodies, and runs
-- as its owner so it sees every job. It lives in its own schema, which PostgREST does not expose,
-- and only members of pg_monitor may call it: Grafana's role needs `IN ROLE pg_monitor`, nothing
-- more (docs/OBSERVABILITY_DASHBOARDS.md → Alerting).

create schema if not exists monitoring;
revoke all on schema monitoring from public;
grant usage on schema monitoring to pg_monitor;

create or replace function monitoring.failed_jobs(since interval default interval '1 day')
returns table (failed_cron_runs bigint, failed_http_calls bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from cron.job_run_details
      where status = 'failed' and start_time > now() - since),
    (select count(*) from net._http_response
      where (status_code >= 400 or error_msg is not null or timed_out) and created > now() - since)
$$;

revoke all on function monitoring.failed_jobs(interval) from public;
grant execute on function monitoring.failed_jobs(interval) to pg_monitor;
