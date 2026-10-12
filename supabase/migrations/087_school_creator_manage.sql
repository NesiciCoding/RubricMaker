-- #630: a school's creator can manage it. Before this only global admins could update or delete a
-- school, so a non-admin teacher who created one could not change its retention, and the client's
-- rollback after a failed membership/profile step (schools.delete()) silently matched 0 rows and
-- left an orphan school. The creator can now also list the school's members.
--
-- The creator check reads public.schools from inside a school_members policy while schools_select
-- reads school_members, so it goes through a SECURITY DEFINER helper to avoid policy recursion.
-- Removing other members stays admin-only (or self): the profile reset that goes with it is
-- governed by the profiles policies.

CREATE OR REPLACE FUNCTION public.is_school_creator(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schools
    WHERE id = p_school_id AND created_by = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_school_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_school_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS schools_update ON public.schools;
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'admin' OR created_by = (SELECT auth.uid()))
  WITH CHECK (public.get_my_role() = 'admin' OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS schools_delete ON public.schools;
CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin' OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS school_members_select ON public.school_members;
CREATE POLICY school_members_select ON public.school_members FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
    OR public.is_school_creator(school_id)
  );
