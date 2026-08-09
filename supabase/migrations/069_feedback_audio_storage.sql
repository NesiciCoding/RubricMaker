-- Voice-feedback audio storage (perf: keep base64 audio out of student_rubrics.data jsonb).
--
-- Previously each ScoreEntry carried its voice comment as a base64 `audioDataUrl` string
-- embedded in the student_rubrics.data jsonb. Editing any field re-serialised and re-uploaded
-- that row's full jsonb — every recording included — and every hydrate/realtime refresh
-- re-downloaded all of it (issue #275: a handful blows the localStorage quota). The audio now
-- lives here as file bytes; the entry keeps only a small `audioStoragePath`.
--
-- No metadata table (unlike recordings): the path is stored on the entry inside student_rubrics,
-- so there is nothing extra to list or join. Owner-scoped storage RLS only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-audio', 'feedback-audio', false, 10485760, null) -- 10 MB limit, private
on conflict (id) do nothing;

-- Owner can read/write their own path only ({userId}/{studentRubricId}/{criterionId}).
-- Students never touch this bucket directly: a teacher mints a time-limited signed URL at
-- share-link generation time and embeds it in the /feedback/:code payload.
drop policy if exists "feedback_audio_storage_owner" on storage.objects;
create policy "feedback_audio_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'feedback-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'feedback-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
