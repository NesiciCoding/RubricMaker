-- Migration 019: Re-assert the retention_years 1–20 range constraint.
-- 018 already added it as schools_retention_range CHECK (retention_years BETWEEN 1 AND 20);
-- this migration drops that name (and the unused legacy name schools_retention_positive,
-- which no migration ever created) and re-adds the check idempotently, so values above the
-- UI maximum cannot be persisted via direct API calls either.

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_retention_positive,
  DROP CONSTRAINT IF EXISTS schools_retention_range;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_retention_range CHECK (retention_years BETWEEN 1 AND 20);
