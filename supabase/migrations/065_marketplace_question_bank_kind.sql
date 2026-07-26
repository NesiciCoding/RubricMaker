-- Migration 065: Question Bank items on the marketplace (roadmap 29.2)
--
-- Extends the marketplace kind check (060) to also allow 'questionBankItem'.
-- Reuses the same table/columns as rubric/test/deck listings — a listing's
-- `rubric_snapshot` column holds the QuestionBankItem itself when kind is
-- 'questionBankItem', same generic-snapshot pattern introduced in 060.

ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT marketplace_listings_kind_check;

ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_kind_check
    CHECK (kind IN ('rubric', 'test', 'deck', 'questionBankItem')) NOT VALID;

ALTER TABLE public.marketplace_listings
  VALIDATE CONSTRAINT marketplace_listings_kind_check;
