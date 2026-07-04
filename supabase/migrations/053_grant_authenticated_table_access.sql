-- Migration 053: Grant authenticated/service_role table-level access in the public schema.
--
-- Every migration up to now was applied as role `postgres`, and Postgres's
-- default privileges for objects owned by `postgres` in schema `public`
-- only give `authenticated`/`anon`/`service_role` DELETE/REFERENCES/TRIGGER/
-- TRUNCATE (Dxt) — not SELECT/INSERT/UPDATE. Only `schools`/`school_members`
-- (016) and `marketplace_listings`/`marketplace_upvotes` (040) ever received
-- an explicit GRANT, so every other table has been returning PostgREST
-- "permission denied" (42501) before RLS is even evaluated — for
-- authenticated users, and for the edge functions that talk to these tables
-- with the service-role key (BYPASSRLS skips row-security policies, not the
-- table-level grant check). This repo's own docker-compose.yml happens to
-- dodge the bug by running migrations as `supabase_admin`, whose default
-- privileges in `public` are already permissive — but `supabase db push`
-- (CLI, Cloud, and the official self-hosted Docker stack) all connect as
-- `postgres`, so they hit it. RLS (already enabled on every table) remains
-- the real access control; these grants only unlock the table-level check
-- PostgREST does first.
--
-- `anon` is deliberately not granted here: every RLS policy in this schema
-- targets `authenticated` only (even the "anonymous sign-in" student flow
-- authenticates and holds an `authenticated` JWT) — anon-key requests
-- should keep getting nothing.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
