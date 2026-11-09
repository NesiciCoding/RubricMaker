-- Migration 099: Content language for essay assignments (#956).
--
-- Teachers can set the language an essay is written in per assignment (and per
-- template, which lives in the essay_templates jsonb document and needs no schema
-- change). The student page uses it for read-aloud voices and `lang` attributes
-- instead of the interface language. Unset (NULL) means English, matching the
-- previous behaviour where ESSAY_CONTENT_LANG was hardcoded to 'en'.
--
-- No RLS or policy change: this only adds a nullable column to a table whose
-- policies already cover all rows, and no new table/function/view is created.

ALTER TABLE IF EXISTS public.essay_assignments
  ADD COLUMN IF NOT EXISTS content_language TEXT;
