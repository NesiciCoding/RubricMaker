-- Migration 082: make get_overdue_scans() safe for the nightly sweep (#625).
--
-- delete-old-attachments (edge function) and scripts/delete-old-attachments.sh now also purge
-- overdue scans. school_year is written by the client; one malformed value made the
-- left(school_year, 4)::int cast fail and abort the whole query, so no scan would ever be swept.
-- Rows without a leading four-digit year are now skipped instead (they still need attention, but
-- they no longer block everyone else's purge). Text-only scans (image discarded after OCR) are
-- stored with a NULL storage_path; 074 left them out, so their OCR text was never purged. They are
-- now returned too, and the sweep deletes just their row. Same signature, grants and boundary as 074.

create or replace function public.get_overdue_scans(batch_size int default 100)
returns table (id text, owner_id uuid, storage_path text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.owner_id, s.storage_path
  from public.scan_metadata s
  -- CASE, not AND: Postgres may evaluate AND operands in any order, so only CASE guarantees the
  -- cast never sees a malformed value.
  where (case when s.school_year ~ '^[0-9]{4}' then left(s.school_year, 4)::int end) <
        (case when extract(month from now()) >= 8
              then extract(year from now())::int
              else extract(year from now())::int - 1 end)
  limit batch_size;
$$;

revoke all on function public.get_overdue_scans(int) from public, anon, authenticated;
grant execute on function public.get_overdue_scans(int) to service_role;
