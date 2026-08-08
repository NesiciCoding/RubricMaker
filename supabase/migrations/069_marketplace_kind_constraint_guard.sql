-- Makes the marketplace_listings kind check constraint idempotent.
-- Migration 060 added it with a bare ADD CONSTRAINT (no IF NOT EXISTS form exists),
-- so a re-run of the concatenated bootstrap.sql raised 42710 and aborted. Drop-then-add
-- is the forward-only fix.
--
-- The kind set must match the latest definition (065 extended it with 'questionBankItem') —
-- re-adding a narrower set would revert 065 and orphan existing questionBankItem listings.
ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_kind_check;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_kind_check
    CHECK (kind IN ('rubric', 'test', 'deck', 'questionBankItem')) NOT VALID;
ALTER TABLE public.marketplace_listings
  VALIDATE CONSTRAINT marketplace_listings_kind_check;
