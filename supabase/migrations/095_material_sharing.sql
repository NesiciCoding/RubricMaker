-- Material sharing (rubrics + tests, with folders): a teacher shares their materials with
-- co-teachers or with every teacher in their school, read-only or editable.
--
-- The setting is a `sharing` object ({"visibility": "private"|"coteachers"|"school",
-- "access": "view"|"edit"}) inside `data`, on a rubric, a test or a folder, plus a per-teacher
-- default in user_settings.settings->'materialSharing'. Resolution is "nearest explicit wins":
-- the item's own `sharing`, else the nearest folder up its `folderId`/`parentId` chain that has
-- one, else the owner's default, else private. So changing the default re-shares every item that
-- has no setting of its own, and any single item or folder can still override it.
--
-- Who counts:
--   co-teacher — a teacher/admin who shares a class with the owner through class_members, in
--                either direction. `school` visibility includes co-teachers at other schools.
--   school     — a teacher/admin in the owner's school (school_members or profiles.school_id).
--   admin      — an admin in the owner's school reads every rubric and test regardless of the
--                setting (never edits unless the setting grants edit).
-- Students never match: every path requires the viewer's role to be 'teacher' or 'admin',
-- which matters for tests because they carry answer keys.
--
-- Replaces the rubric-only `sharedWithSchool` flag of 041: existing flags are converted to
-- {"visibility":"school","access":"view"} and the old policy and audit trigger are dropped
-- (comment_bank keeps its own sharedWithSchool flag and policy).

-- ── 1. Resolution helpers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.material_sharing(p_owner uuid, p_sharing jsonb, p_folder_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain(id, parent_id, sharing, depth) AS (
    SELECT f.id, f.data->>'parentId', f.data->'sharing', 1
    FROM public.folders f
    WHERE f.id = p_folder_id AND f.owner_id = p_owner
    UNION ALL
    SELECT f.id, f.data->>'parentId', f.data->'sharing', c.depth + 1
    FROM public.folders f
    JOIN chain c ON f.id = c.parent_id
    WHERE f.owner_id = p_owner AND c.depth < 32
  )
  SELECT COALESCE(
    CASE WHEN jsonb_typeof(p_sharing) = 'object' THEN p_sharing END,
    (SELECT c.sharing FROM chain c WHERE jsonb_typeof(c.sharing) = 'object' ORDER BY c.depth LIMIT 1),
    (SELECT s.settings->'materialSharing' FROM public.user_settings s
      WHERE s.user_id = p_owner AND jsonb_typeof(s.settings->'materialSharing') = 'object'),
    '{"visibility":"private","access":"view"}'::jsonb
  )
$$;

CREATE OR REPLACE FUNCTION public.is_coteacher(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members cm JOIN public.classes c ON c.id = cm.class_id
    WHERE (c.owner_id = p_a AND cm.user_id = p_b)
       OR (c.owner_id = p_b AND cm.user_id = p_a)
  ) OR EXISTS (
    SELECT 1 FROM public.class_members a JOIN public.class_members b ON a.class_id = b.class_id
    WHERE a.user_id = p_a AND b.user_id = p_b
  )
$$;

CREATE OR REPLACE FUNCTION public.same_school(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_members a JOIN public.school_members b ON a.school_id = b.school_id
    WHERE a.profile_id = p_a AND b.profile_id = p_b
  ) OR EXISTS (
    SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.school_id = b.school_id
    WHERE a.id = p_a AND b.id = p_b AND a.school_id IS NOT NULL
  )
$$;

-- What the calling user may do with someone else's material: 'edit', 'view', or NULL (nothing).
-- Owners get NULL — their own policies cover them.
CREATE OR REPLACE FUNCTION public.material_access(p_owner uuid, p_sharing jsonb, p_folder_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_role   text;
  v_eff    jsonb;
  v_vis    text;
  v_access text;
  v_school boolean;
BEGIN
  IF v_me IS NULL OR v_me = p_owner THEN
    RETURN NULL;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_me;
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'admin') THEN
    RETURN NULL;
  END IF;

  v_eff    := public.material_sharing(p_owner, p_sharing, p_folder_id);
  v_vis    := v_eff->>'visibility';
  v_access := CASE WHEN v_eff->>'access' = 'edit' THEN 'edit' ELSE 'view' END;
  v_school := public.same_school(v_me, p_owner);

  IF v_vis = 'school' AND v_school THEN
    RETURN v_access;
  END IF;
  IF v_vis IN ('coteachers', 'school') AND public.is_coteacher(v_me, p_owner) THEN
    RETURN v_access;
  END IF;
  IF v_role = 'admin' AND v_school THEN
    RETURN 'view';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.material_sharing(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_coteacher(uuid, uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.same_school(uuid, uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.material_access(uuid, jsonb, text)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.material_sharing(uuid, jsonb, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_coteacher(uuid, uuid)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.same_school(uuid, uuid)             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.material_access(uuid, jsonb, text)  TO authenticated;

-- ── 2. Shared editors keep the owner's row metadata ──────────────────────────
-- A colleague with edit access may change the content, but not who owns it, how it is shared
-- or which of the owner's folders it sits in. Those keys are put back from OLD rather than
-- rejected, so a whole-entity save from the editor's client still succeeds.

CREATE OR REPLACE FUNCTION public.protect_shared_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = OLD.owner_id THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only the owner can change ownership';
  END IF;
  FOREACH k IN ARRAY ARRAY['sharing', 'folderId', 'displayOrder', 'sharedWithSchool'] LOOP
    IF OLD.data ? k THEN
      NEW.data := jsonb_set(NEW.data, ARRAY[k], OLD.data->k);
    ELSE
      NEW.data := NEW.data - k;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_shared_material() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rubrics_protect_shared ON public.rubrics;
CREATE TRIGGER rubrics_protect_shared
  BEFORE UPDATE ON public.rubrics
  FOR EACH ROW EXECUTE FUNCTION public.protect_shared_material();

DROP TRIGGER IF EXISTS tests_protect_shared ON public.tests;
CREATE TRIGGER tests_protect_shared
  BEFORE UPDATE ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.protect_shared_material();

-- ── 3. Replace the 041 school flag ───────────────────────────────────────────

DROP POLICY IF EXISTS rubrics_school_select ON public.rubrics;
DROP TRIGGER IF EXISTS audit_rubrics_share ON public.rubrics;

UPDATE public.rubrics
SET data = (data - 'sharedWithSchool')
  || CASE WHEN data->'sharedWithSchool' = 'true'::jsonb
          THEN jsonb_build_object('sharing', '{"visibility":"school","access":"view"}'::jsonb)
          ELSE '{}'::jsonb END
WHERE data ? 'sharedWithSchool';

-- ── 4. Policies ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS rubrics_material_select ON public.rubrics;
CREATE POLICY rubrics_material_select ON public.rubrics FOR SELECT TO authenticated
  USING (public.material_access(owner_id, data->'sharing', data->>'folderId') IS NOT NULL);

DROP POLICY IF EXISTS rubrics_material_update ON public.rubrics;
CREATE POLICY rubrics_material_update ON public.rubrics FOR UPDATE TO authenticated
  USING (public.material_access(owner_id, data->'sharing', data->>'folderId') = 'edit')
  WITH CHECK (public.material_access(owner_id, data->'sharing', data->>'folderId') = 'edit');

DROP POLICY IF EXISTS tests_material_select ON public.tests;
CREATE POLICY tests_material_select ON public.tests FOR SELECT TO authenticated
  USING (public.material_access(owner_id, data->'sharing', data->>'folderId') IS NOT NULL);

DROP POLICY IF EXISTS tests_material_update ON public.tests;
CREATE POLICY tests_material_update ON public.tests FOR UPDATE TO authenticated
  USING (public.material_access(owner_id, data->'sharing', data->>'folderId') = 'edit')
  WITH CHECK (public.material_access(owner_id, data->'sharing', data->>'folderId') = 'edit');

-- Folders are shown to colleagues so shared material keeps its structure; they are never
-- editable by anyone but the owner.
DROP POLICY IF EXISTS folders_material_select ON public.folders;
CREATE POLICY folders_material_select ON public.folders FOR SELECT TO authenticated
  USING (
    data->>'kind' IN ('rubric', 'test')
    AND public.material_access(owner_id, data->'sharing', data->>'parentId') IS NOT NULL
  );

-- ── 5. Listing for the "Shared with me" views ────────────────────────────────
-- SECURITY INVOKER: rows come through the policies above (plus the per-person rubric_shares
-- policies of 026), and `access` is recomputed per row so the client knows whether to offer
-- Save. A per-person rubric share outranks the general setting when it grants more.

CREATE OR REPLACE FUNCTION public.list_shared_materials(p_kind text)
RETURNS TABLE (id text, owner_id uuid, owner_name text, item_kind text, data jsonb, access text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_kind NOT IN ('rubric', 'test') THEN
    RETURN;
  END IF;

  IF p_kind = 'rubric' THEN
    RETURN QUERY
      SELECT r.id, r.owner_id, COALESCE(NULLIF(p.display_name, ''), p.email, '')::text, 'rubric'::text, r.data,
        CASE
          WHEN EXISTS (SELECT 1 FROM public.rubric_shares rs
                       WHERE rs.rubric_id = r.id AND rs.user_id = v_me AND rs.mode = 'edit') THEN 'edit'
          ELSE COALESCE(public.material_access(r.owner_id, r.data->'sharing', r.data->>'folderId'), 'view')
        END
      FROM public.rubrics r
      LEFT JOIN public.profiles p ON p.id = r.owner_id
      WHERE r.owner_id <> v_me;
  ELSE
    RETURN QUERY
      SELECT t.id, t.owner_id, COALESCE(NULLIF(p.display_name, ''), p.email, '')::text, 'test'::text, t.data,
        public.material_access(t.owner_id, t.data->'sharing', t.data->>'folderId')
      FROM public.tests t
      LEFT JOIN public.profiles p ON p.id = t.owner_id
      WHERE t.owner_id <> v_me
        AND public.material_access(t.owner_id, t.data->'sharing', t.data->>'folderId') IS NOT NULL;
  END IF;

  RETURN QUERY
    SELECT f.id, f.owner_id, COALESCE(NULLIF(p.display_name, ''), p.email, '')::text, 'folder'::text, f.data,
      public.material_access(f.owner_id, f.data->'sharing', f.data->>'parentId')
    FROM public.folders f
    LEFT JOIN public.profiles p ON p.id = f.owner_id
    WHERE f.owner_id <> v_me AND f.data->>'kind' = p_kind;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_shared_materials(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_shared_materials(text) TO authenticated;

-- ── 6. Audit sharing changes ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_material_sharing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_audit_entry('admin', 'material_sharing_change', TG_ARGV[0], NEW.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'owner_id', NEW.owner_id,
      'from', OLD.data->'sharing',
      'to', NEW.data->'sharing')));
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_material_sharing_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_rubrics_sharing ON public.rubrics;
CREATE TRIGGER audit_rubrics_sharing
  AFTER UPDATE OF data ON public.rubrics
  FOR EACH ROW
  WHEN (OLD.data->'sharing' IS DISTINCT FROM NEW.data->'sharing')
  EXECUTE FUNCTION public.audit_material_sharing_change('rubric');

DROP TRIGGER IF EXISTS audit_tests_sharing ON public.tests;
CREATE TRIGGER audit_tests_sharing
  AFTER UPDATE OF data ON public.tests
  FOR EACH ROW
  WHEN (OLD.data->'sharing' IS DISTINCT FROM NEW.data->'sharing')
  EXECUTE FUNCTION public.audit_material_sharing_change('test');

DROP TRIGGER IF EXISTS audit_folders_sharing ON public.folders;
CREATE TRIGGER audit_folders_sharing
  AFTER UPDATE OF data ON public.folders
  FOR EACH ROW
  WHEN (OLD.data->'sharing' IS DISTINCT FROM NEW.data->'sharing')
  EXECUTE FUNCTION public.audit_material_sharing_change('folder');
