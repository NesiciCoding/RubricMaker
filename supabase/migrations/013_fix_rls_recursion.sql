-- Migration 011: Fix RLS infinite recursion
--
-- Two mutual-reference cycles cause "infinite recursion detected in policy":
--
--   classes ↔ class_members
--     classes_member_select  queries class_members
--     class_members_owner_all queries classes
--
--   rubrics ↔ rubric_shares
--     rubrics_shared_select   queries rubric_shares
--     rubric_shares_owner_all queries rubrics
--
-- Fix: SECURITY DEFINER helper functions perform the cross-table lookups as
-- the function owner (bypassing RLS), so the policy chain never recurses.

-- ── 1. Helper functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_class_owner(p_class_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes WHERE id = p_class_id AND owner_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(p_class_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members WHERE class_id = p_class_id AND user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_rubric_owner(p_rubric_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubrics WHERE id = p_rubric_id AND owner_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_rubric_share(p_rubric_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_shares WHERE rubric_id = p_rubric_id AND user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_rubric_share_edit(p_rubric_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_shares
    WHERE rubric_id = p_rubric_id AND user_id = p_user_id AND mode = 'edit'
  )
$$;

-- ── 2. Fix classes ↔ class_members cycle ─────────────────────────────────────

DROP POLICY IF EXISTS "classes_member_select" ON public.classes;
CREATE POLICY "classes_member_select"
  ON public.classes FOR SELECT
  USING (is_class_member(id, auth.uid()));

DROP POLICY IF EXISTS "class_members_owner_all" ON public.class_members;
CREATE POLICY "class_members_owner_all"
  ON public.class_members FOR ALL
  USING (is_class_owner(class_id, auth.uid()));

-- ── 3. Fix rubrics ↔ rubric_shares cycle ─────────────────────────────────────

DROP POLICY IF EXISTS "rubrics_shared_select" ON public.rubrics;
CREATE POLICY "rubrics_shared_select"
  ON public.rubrics FOR SELECT
  USING (has_rubric_share(id, auth.uid()));

DROP POLICY IF EXISTS "rubrics_shared_update" ON public.rubrics;
CREATE POLICY "rubrics_shared_update"
  ON public.rubrics FOR UPDATE
  USING (has_rubric_share_edit(id, auth.uid()));

DROP POLICY IF EXISTS "rubric_shares_owner_all" ON public.rubric_shares;
CREATE POLICY "rubric_shares_owner_all"
  ON public.rubric_shares FOR ALL
  USING (is_rubric_owner(rubric_id, auth.uid()));
