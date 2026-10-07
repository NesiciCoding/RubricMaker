-- Migration 080: server-side "Delete all my database data" (#642).
--
-- The client used to delete a hard-coded subset of tables one by one, ignore every error,
-- skip the feedback-audio, scans and backups buckets, and always report success. Erasure
-- now uses the owner_data_tables() registry from 079, so it covers exactly what the nightly
-- backup covers, and reports what it could not delete.
--
-- Flow (src/services/database/SupabaseAdapter.ts deleteAllMyData):
--   1. my_storage_objects() lists every storage object that belongs to the caller; the client
--      removes them through the Storage API (deleting storage.objects rows in SQL would leave
--      the files behind) while the essay_assignments rows that locate essay files still exist.
--   2. erase_my_data() deletes the caller's rows from every registered table and returns
--      per-table counts and errors.

-- ── 1. Let owners delete their own nightly snapshots ─────────────────────────────
-- 048 only granted read; writes go through the service role.
DROP POLICY IF EXISTS "backups_storage_owner_delete" ON storage.objects;
CREATE POLICY "backups_storage_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'backups'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ── 2. The caller's storage objects ─────────────────────────────────────────────
-- Folder-per-user buckets use {uid}/...; essays use {essay_assignment_id}/....
CREATE OR REPLACE FUNCTION public.my_storage_objects()
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE auth.uid() IS NOT NULL
    AND (
      (o.bucket_id IN ('attachments', 'export-templates', 'recordings', 'feedback-audio', 'scans', 'backups')
        AND (storage.foldername(o.name))[1] = auth.uid()::text)
      OR (o.bucket_id = 'essays'
        AND (storage.foldername(o.name))[1] IN (
          SELECT ea.id FROM public.essay_assignments ea WHERE ea.owner_id = auth.uid()
        ))
    )
  ORDER BY o.bucket_id, o.name;
$$;

REVOKE EXECUTE ON FUNCTION public.my_storage_objects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_storage_objects() TO authenticated;

-- ── 3. Erase the caller's rows ──────────────────────────────────────────────────
-- Children are registered after their parents, so walking the registry backwards deletes
-- grants, versions and submissions before the rubrics/classes/assignments they hang off.
-- Each table is its own subtransaction: one failure is reported, the rest still go.
CREATE OR REPLACE FUNCTION public.erase_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  r         record;
  v_n       bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_errors  jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT t.key, t.table_name, t.owner_filter
    FROM public.owner_data_tables() WITH ORDINALITY AS t(key, table_name, owner_filter, pos)
    ORDER BY t.pos DESC
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE %s', r.table_name, r.owner_filter) USING v_uid;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_deleted := v_deleted || jsonb_build_object(r.key, v_n);
    EXCEPTION WHEN others THEN
      v_errors := v_errors || jsonb_build_object(r.key, SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, category, action, entity_type, entity_id, details)
  VALUES (v_uid, 'admin', 'erase_my_data', 'profile', v_uid::text,
          jsonb_build_object('deleted', v_deleted, 'errors', v_errors));

  RETURN jsonb_build_object('deleted', v_deleted, 'errors', v_errors);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.erase_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erase_my_data() TO authenticated;
