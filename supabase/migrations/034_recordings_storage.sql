-- Audio/video recordings attached to speaking sessions (roadmap 3.1).
-- Same jsonb-document pattern as attachments (001_initial_schema.sql / 003_storage_buckets.sql):
-- metadata + storage_path in `recording_metadata`, file bytes in the `recordings` bucket.

create table if not exists public.recording_metadata (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  storage_path text,
  data jsonb not null
);
create index if not exists recording_metadata_owner_id_idx on public.recording_metadata(owner_id);
create index if not exists recording_metadata_session_id_idx on public.recording_metadata(session_id);

alter table public.recording_metadata enable row level security;

drop policy if exists "recording_metadata_own" on public.recording_metadata;
create policy "recording_metadata_own"
  on public.recording_metadata for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Storage bucket for recording files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 52428800, null) -- 50 MB limit
on conflict (id) do nothing;

-- Recording storage RLS: owner can read/write their own path ({userId}/{recordingId})
drop policy if exists "recordings_storage_owner" on storage.objects;
create policy "recordings_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
