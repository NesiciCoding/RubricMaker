-- Migration 040: Rubric marketplace (school-scoped)
--
-- Lets teachers publish a rubric to their school's marketplace and upvote
-- listings published by colleagues. Scope is the existing schools /
-- school_members tables — there is no public/cross-tenant sharing.
--
-- rubric_snapshot is a frozen jsonb copy of the rubric taken at publish time,
-- not a live FK to public.rubrics, so a listing survives edits or deletion
-- of the source rubric.
--
-- upvote_count is denormalized onto marketplace_listings and is maintained
-- exclusively by the trigger below — clients get no UPDATE grant on it, so
-- the only way to change it is to insert/delete a marketplace_upvotes row.

-- ── 1. marketplace_listings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  published_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rubric_snapshot jsonb       NOT NULL,
  name            text        NOT NULL,
  subject         text,
  description     text,
  attribution     text,
  upvote_count    integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS marketplace_listings_school_id_idx    ON public.marketplace_listings (school_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_published_by_idx ON public.marketplace_listings (published_by);

-- ── 2. marketplace_upvotes ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_upvotes (
  listing_id uuid        NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (listing_id, profile_id)
);

ALTER TABLE public.marketplace_upvotes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS marketplace_upvotes_profile_id_idx ON public.marketplace_upvotes (profile_id);

-- ── 3. marketplace_listings policies ─────────────────────────────────────────
-- SELECT/INSERT are scoped to members of the listing's school. UPDATE/DELETE
-- are restricted to the publisher (school staff can't edit each other's
-- listings, matching the "own rows" convention used elsewhere).

DROP POLICY IF EXISTS marketplace_listings_select ON public.marketplace_listings;
CREATE POLICY marketplace_listings_select ON public.marketplace_listings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = marketplace_listings.school_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_listings_insert ON public.marketplace_listings;
CREATE POLICY marketplace_listings_insert ON public.marketplace_listings FOR INSERT TO authenticated
  WITH CHECK (
    published_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = marketplace_listings.school_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_listings_update ON public.marketplace_listings;
CREATE POLICY marketplace_listings_update ON public.marketplace_listings FOR UPDATE TO authenticated
  USING       (published_by = (SELECT auth.uid()))
  WITH CHECK  (published_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS marketplace_listings_delete ON public.marketplace_listings;
CREATE POLICY marketplace_listings_delete ON public.marketplace_listings FOR DELETE TO authenticated
  USING (published_by = (SELECT auth.uid()));

-- ── 4. marketplace_upvotes policies ──────────────────────────────────────────
-- SELECT is scoped via the parent listing's school membership. INSERT/DELETE
-- are restricted to the voter's own row — nobody can cast or remove a vote
-- on someone else's behalf.

DROP POLICY IF EXISTS marketplace_upvotes_select ON public.marketplace_upvotes;
CREATE POLICY marketplace_upvotes_select ON public.marketplace_upvotes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      JOIN public.school_members sm ON sm.school_id = ml.school_id
      WHERE ml.id = marketplace_upvotes.listing_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_upvotes_insert ON public.marketplace_upvotes;
CREATE POLICY marketplace_upvotes_insert ON public.marketplace_upvotes FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      JOIN public.school_members sm ON sm.school_id = ml.school_id
      WHERE ml.id = marketplace_upvotes.listing_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_upvotes_delete ON public.marketplace_upvotes;
CREATE POLICY marketplace_upvotes_delete ON public.marketplace_upvotes FOR DELETE TO authenticated
  USING (profile_id = (SELECT auth.uid()));

-- ── 5. upvote_count trigger ───────────────────────────────────────────────────
-- Keeps marketplace_listings.upvote_count in sync without giving clients any
-- write path to it directly. SECURITY DEFINER so the trigger can update the
-- listing row regardless of the caller's UPDATE grants on that column.

CREATE OR REPLACE FUNCTION public.sync_marketplace_upvote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.marketplace_listings
       SET upvote_count = upvote_count + 1
     WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.marketplace_listings
       SET upvote_count = GREATEST(upvote_count - 1, 0)
     WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_upvotes_sync_count ON public.marketplace_upvotes;
CREATE TRIGGER marketplace_upvotes_sync_count
  AFTER INSERT OR DELETE ON public.marketplace_upvotes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_marketplace_upvote_count();

-- ── 6. Grants ─────────────────────────────────────────────────────────────────
-- upvote_count is deliberately omitted from the column list on UPDATE so
-- clients cannot write it directly; only the SECURITY DEFINER trigger above
-- (running as the function owner) can change it.

GRANT SELECT, INSERT, DELETE ON public.marketplace_listings TO authenticated;
GRANT UPDATE (name, subject, description, attribution) ON public.marketplace_listings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.marketplace_upvotes TO authenticated;
