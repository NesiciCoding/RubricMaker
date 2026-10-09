-- RubricMaker — set the Supabase service roles' passwords to POSTGRES_PASSWORD.
--
-- The supabase/postgres image only gives `postgres` and `supabase_admin` the
-- POSTGRES_PASSWORD; `authenticator` (PostgREST), `supabase_auth_admin` (GoTrue)
-- and `supabase_storage_admin` (Storage) are created without one, and the image
-- requires password (SCRAM) auth on the Docker network. docker-compose.yml mounts
-- this file into the image's init-scripts, so it runs once, when the database
-- volume is first initialised.
--
-- To repair an existing database, or after changing POSTGRES_PASSWORD in .env:
--   docker compose exec db psql -U supabase_admin -d postgres -f /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
--   docker compose up -d --force-recreate
\set ON_ERROR_STOP on
\set pgpass `echo "$POSTGRES_PASSWORD"`

-- psql variables are not expanded inside the DO body, so hand the value over via a session setting.
select set_config('rubricmaker.pgpass', :'pgpass', false) is not null as password_loaded \gset

do $$
declare
    pass text := current_setting('rubricmaker.pgpass');
    r text;
begin
    if pass is null or pass = '' then
        raise exception 'POSTGRES_PASSWORD is empty — refusing to set service role passwords';
    end if;
    foreach r in array array[
        'authenticator',
        'supabase_auth_admin',
        'supabase_storage_admin',
        'supabase_functions_admin',
        'pgbouncer',
        'supabase_admin',
        'postgres'
    ] loop
        if exists (select 1 from pg_roles where rolname = r) then
            execute format('alter role %I with password %L', r, pass);
        end if;
    end loop;
end
$$;

reset rubricmaker.pgpass;
