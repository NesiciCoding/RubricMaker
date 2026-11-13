-- Live writing prompt images (Phase 43.2).
--
-- The prompt image is a teacher-supplied visual aid shown next to the prompt on the projector and
-- on each student's page. Students join with a code and no account, so the bucket is public: the
-- object is a classroom prompt, never student work. Writes stay inside the teacher's own folder so
-- one teacher cannot replace another's images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'live-writing', 'live-writing', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists live_writing_prompt_image_insert on storage.objects;
create policy live_writing_prompt_image_insert on storage.objects for insert to authenticated
    with check (
        bucket_id = 'live-writing'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists live_writing_prompt_image_update on storage.objects;
create policy live_writing_prompt_image_update on storage.objects for update to authenticated
    using (
        bucket_id = 'live-writing'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'live-writing'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists live_writing_prompt_image_delete on storage.objects;
create policy live_writing_prompt_image_delete on storage.objects for delete to authenticated
    using (
        bucket_id = 'live-writing'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );
