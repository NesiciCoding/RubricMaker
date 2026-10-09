-- Resolving a moderation dispute (Keep original / Accept second marker / Reconcile) used to
-- delete the second marker's review. It is now kept for the record and stamped with
-- data.moderationResolvedAt (issue #609), so the digest count must skip resolved reviews —
-- otherwise every settled dispute would be reported as pending forever.
-- Same definition as 059_scheduled_digest.sql plus the resolved filter.
CREATE OR REPLACE FUNCTION public.get_pending_moderation_count(target_owner uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.student_rubrics sr
  WHERE sr.grader_id = target_owner
    AND sr.is_peer_review = true
    AND sr.data->>'gradedBy' IS NOT NULL
    AND sr.data->>'moderationResolvedAt' IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.owner_id = target_owner AND s.id = sr.data->>'gradedBy'
    )
    AND EXISTS (
      SELECT 1 FROM public.student_rubrics baseline
      WHERE baseline.grader_id = target_owner
        AND baseline.is_peer_review = false
        AND baseline.rubric_id = sr.rubric_id
        AND baseline.student_id = sr.student_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_pending_moderation_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_moderation_count(uuid) TO service_role;
