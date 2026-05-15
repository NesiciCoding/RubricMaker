-- Storage buckets for file attachments and export templates

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('attachments', 'attachments', false, 52428800, null),       -- 50 MB limit
  ('export-templates', 'export-templates', false, 10485760, null); -- 10 MB limit

-- Attachment storage RLS: owner can read/write their own path ({userId}/{attachmentId})
create policy "attachments_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Export template storage RLS: owner can read/write their own path
create policy "export_templates_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'export-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
