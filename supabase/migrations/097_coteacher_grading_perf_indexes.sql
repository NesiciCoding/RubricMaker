-- Perf follow-up to 096_coteacher_grading.sql (docs/PERFORMANCE_AUDIT_2026-11.md #1106, #1111).
--
-- test_in_coteaching()'s student_tests branch filters `st.data->>'testId' = p_test_id AND
-- st.owner_id = p_owner`. Before this migration student_tests had no index on that jsonb path, so
-- the RLS check did a full sequential scan of student_tests for every row scanned on tests by a
-- non-owner. A composite index on (owner_id, (data->>'testId')) serves this exact predicate.
CREATE INDEX IF NOT EXISTS student_tests_owner_test_id_idx
  ON public.student_tests (owner_id, (data->>'testId'));

-- rubric_in_coteaching()'s class_members branch filters `c.data->'rubricIds' ? p_rubric_id` — a
-- jsonb containment check with no supporting index, run per rubrics row for every class the
-- material owner owns. A GIN index on the expression supports the `?` operator.
CREATE INDEX IF NOT EXISTS classes_rubric_ids_gin_idx
  ON public.classes USING gin ((data->'rubricIds'));
