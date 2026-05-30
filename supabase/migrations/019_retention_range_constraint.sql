-- Migration 019: Tighten retention_years constraint to 1–20 range
-- Migration 018 added a > 0 check (schools_retention_positive); this migration
-- replaces it with a BETWEEN 1 AND 20 check so values above the UI maximum
-- cannot be persisted via direct API calls either.

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_retention_positive,
  DROP CONSTRAINT IF EXISTS schools_retention_range;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_retention_range CHECK (retention_years BETWEEN 1 AND 20);
