-- Migration 043: CEFR level tags on marketplace listings
--
-- Lets a published rubric carry the CEFR level(s) it targets, so browsers
-- can filter/identify listings by level without opening rubric_snapshot.

ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS cefr_levels text[];
