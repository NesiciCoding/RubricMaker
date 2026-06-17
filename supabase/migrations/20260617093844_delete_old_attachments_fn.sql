-- Returns attachments whose updated_at has passed the owner's school retention
-- period (default 7 years for users not attached to a school).
-- Called by the delete-old-attachments edge function so only the Storage API,
-- not raw SQL, is used to remove files from the attachments bucket.

CREATE OR REPLACE FUNCTION public.get_overdue_attachments(batch_size int DEFAULT 100)
RETURNS TABLE (id text, owner_id uuid, storage_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.owner_id, a.storage_path
  FROM public.attachments a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  LEFT JOIN public.schools  s ON s.id = p.school_id
  WHERE a.storage_path IS NOT NULL
    AND a.updated_at < now() - make_interval(years => COALESCE(s.retention_years, 7))
  LIMIT batch_size;
$$;

-- Only callable by service_role (the edge-function runtime)
REVOKE ALL ON FUNCTION public.get_overdue_attachments(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_attachments(int) TO service_role;
