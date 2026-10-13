-- #638 review follow-up: the 30-day retention sweep in 089 deletes on `created_at`, but that
-- timestamp was still client-suppliable. The column default only applies when the insert omits it,
-- and the insert policy (035, tightened in 039) checks `user_id`, not `created_at`, so an
-- authenticated client could store a row dated in the future that no sweep ever reaches.
--
-- The client never sends `created_at` — src/services/logging/clientLogger.ts inserts LogRow,
-- which has no such field — so pinning it to the server clock on insert only constrains writes that
-- were trying to opt out of retention. client_logs has no UPDATE or DELETE policy, so an insert
-- trigger is the whole surface.

create or replace function public.set_client_log_created_at()
returns trigger language plpgsql as $$
begin
  new.created_at = now();
  return new;
end;
$$;

drop trigger if exists client_logs_created_at_server on public.client_logs;
create trigger client_logs_created_at_server
  before insert on public.client_logs
  for each row execute procedure public.set_client_log_created_at();

-- Rows stored before the trigger existed are pulled back to the server's clock so the nightly
-- sweep can reach them; only rows that were already evading retention change.
update public.client_logs set created_at = now() where created_at > now();
