-- Migration 055: denormalize Test.mode ('practice' | 'assessment') onto test_assignments,
-- same pattern as test_name in 044, so the student portal to-do list can badge
-- practice vs. assessment without reading `tests`.

ALTER TABLE public.test_assignments ADD COLUMN IF NOT EXISTS mode TEXT;
