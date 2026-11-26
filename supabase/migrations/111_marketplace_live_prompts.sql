-- Migration 111: Live-writing prompts on the school marketplace (Phase 43.7, #1157)
--
-- Extends the marketplace kind check (065) with 'live_prompt', and adds the
-- first-class tags a usable prompt bank needs: language, writing focus and
-- school year. The prompt itself (title, prompt text, image path, timing) is
-- stored in the existing rubric_snapshot column, like the other kinds — a
-- frozen copy with no class, participant, response, vote or result data.
--
-- The image stays in the public `live-writing` media bucket, so the copy a
-- colleague clones resolves exactly like the publisher's own session.

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS writing_focus text[],
  ADD COLUMN IF NOT EXISTS school_year text;

ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT marketplace_listings_kind_check;

ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_kind_check
    CHECK (kind IN ('rubric', 'test', 'deck', 'questionBankItem', 'live_prompt')) NOT VALID;

ALTER TABLE public.marketplace_listings
  VALIDATE CONSTRAINT marketplace_listings_kind_check;

CREATE INDEX IF NOT EXISTS marketplace_listings_writing_focus_idx
  ON public.marketplace_listings USING gin (writing_focus);
