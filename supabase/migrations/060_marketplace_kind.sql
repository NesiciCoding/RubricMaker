-- Migration 060: Marketplace tests & flashcard decks (roadmap 24.4)
--
-- Extends the rubric-only marketplace (040/043) to also list tests and
-- flashcard decks, reusing the same table and snapshot column rather than
-- adding two more near-identical tables — the listing/upvote/RLS machinery
-- is entity-agnostic already. `rubric_snapshot` keeps its name for existing
-- rows/back-compat, but now holds a Rubric, Test, or FlashcardDeck depending
-- on `kind` (mapped to a generically-named `snapshot` field client-side).

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'rubric';

ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_kind_check CHECK (kind IN ('rubric', 'test', 'deck'));
