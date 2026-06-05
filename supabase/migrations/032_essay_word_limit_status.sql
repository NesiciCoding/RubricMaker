-- Add a word-limit status flag to essay submissions so teachers can see
-- at a glance whether a student submitted under or over the word limit.
-- NULL means the assignment had no word limits defined.
ALTER TABLE public.essay_submissions
    ADD COLUMN IF NOT EXISTS word_limit_status TEXT
        CHECK (word_limit_status IN ('ok', 'under', 'over'));
