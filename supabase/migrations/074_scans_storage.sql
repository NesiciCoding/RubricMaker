-- Scanned images of student handwriting + their OCR text (roadmap Phase 33.5).
-- Same jsonb-document pattern as recordings (034_recordings_storage.sql):
-- metadata + storage_path in `scan_metadata`, image bytes in the `scans` bucket.
-- Scans carry a one-academic-year retention cap purged by get_overdue_scans().

create table if not exists public.scan_metadata (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  student_id text,
  storage_path text,
  school_year text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists scan_metadata_owner_id_idx on public.scan_metadata(owner_id);
create index if not exists scan_metadata_student_id_idx on public.scan_metadata(student_id);
create index if not exists scan_metadata_created_at_idx on public.scan_metadata(created_at);

alter table public.scan_metadata enable row level security;

drop policy if exists "scan_metadata_own" on public.scan_metadata;
create policy "scan_metadata_own"
  on public.scan_metadata for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Storage bucket for scan image files (private, 15 MB, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scans', 'scans', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Scan storage RLS: owner can read/write their own path ({userId}/{scanId})
drop policy if exists "scans_storage_owner" on storage.objects;
create policy "scans_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Returns scans stamped with an academic year before the current one (the one-academic-year
-- retention cap). This mirrors the client sweep (src/utils/scanRetention.ts → isBeyondRetention),
-- comparing the `school_year` start year against the current academic year with an August cutover
-- (ACADEMIC_YEAR_CUTOVER_MONTH = 8) — not a rolling created_at interval, which would purge on a
-- different boundary than the local sweep. Called by the delete-old-scans edge function (Phase 33.6)
-- so only the Storage API, not raw SQL, is used to remove files from the scans bucket.
create or replace function public.get_overdue_scans(batch_size int default 100)
returns table (id text, owner_id uuid, storage_path text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.owner_id, s.storage_path
  from public.scan_metadata s
  where s.storage_path is not null
    and left(s.school_year, 4)::int <
        (case when extract(month from now()) >= 8
              then extract(year from now())::int
              else extract(year from now())::int - 1 end)
  limit batch_size;
$$;

-- Only callable by service_role (the edge-function runtime)
revoke all on function public.get_overdue_scans(int) from public, anon, authenticated;
grant execute on function public.get_overdue_scans(int) to service_role;
