-- Migration 106: give the nightly digest's pg_net call a realistic timeout.
--
-- net.http_post cancels its request after `timeout_milliseconds`, which defaults to 5000.
-- On expiry pg_net writes a row to net._http_response with an empty status_code,
-- timed_out = true and an "Timeout of … ms reached" error_msg, while the edge function keeps
-- running server-side. So the digest still sends its email, but the run is counted as a
-- failed HTTP call by monitoring.failed_jobs() (migration 091) and the "Scheduled HTTP call
-- failed" alert fires every morning the digest had something to deliver: SMTP sends are
-- synchronous and are followed by the heartbeat ping, which routinely takes longer than
-- five seconds. Re-schedule the job with a two-minute budget.
--
-- The job also fails loudly in cron.job_run_details (with a message naming the missing
-- setting) when app.settings.project_url / app.settings.service_role_key are unset, instead
-- of sending "Bearer null" and showing up only as a 401 in net._http_response.

select cron.schedule(
  'teacher-email-digest',
  '0 6 * * *',
  $job$
    do $digest$
    declare
      project_url text := nullif(current_setting('app.settings.project_url', true), '');
      service_key text := nullif(current_setting('app.settings.service_role_key', true), '');
    begin
      if project_url is null or service_key is null then
        raise exception 'teacher-email-digest: set app.settings.project_url and app.settings.service_role_key (docs/SELF_HOSTING_OPS.md -> Teacher email digest job)';
      end if;
      perform net.http_post(
        url := project_url || '/functions/v1/scheduled-digest',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || service_key,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    end
    $digest$;
  $job$
);
