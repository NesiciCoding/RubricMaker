-- Migration 029: Remove anonymous-user SELECT on essay_assignments
--
-- Migration 025 granted ANY anonymous session SELECT on ALL essay_assignments
-- so the student essay page could validate assignment IDs. This let any student
-- enumerate every essay title and prompt in the project via the REST API.
--
-- Fix: the assignment lookup is now handled by the get-essay-assignment edge
-- function, which uses the service role and enforces per-ID access. Anonymous
-- users no longer need direct table access. Portal students still read their
-- own assignments via the essay_assignments_student_self policy (migration 023).

DROP POLICY IF EXISTS "essay_assignments_student_select" ON public.essay_assignments;
