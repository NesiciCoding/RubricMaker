-- Migration 044: Test assignment tracking, mirroring essay_assignments (008, tightened in 023/025/026).
--
-- Lets the student portal show a to-do list of assigned tests, the same way it already
-- does for essays via essay_assignments/get_my_essay_assignment_ids(). test_name is
-- denormalized onto the assignment row (like essay_assignments' title/prompt) so the
-- to-do list can render without reading `tests` at all.
--
-- Scope note: this migration only grants read access to a portal-authenticated student's
-- OWN main app session (the one already used by fetchMy*Assignments()). It does not touch
-- StudentTestPage's separate disconnected/embedded-credentials client (created with
-- persistSession: false for cold share-code links), which has a pre-existing, unrelated gap:
-- it never authenticates at all (no anonymous sign-in, unlike the essay flow), so its own
-- `tests` content-fetch already fails under `tests_own` regardless of this migration. Fixing
-- that parity gap is a separate, larger change (would need to mirror StudentEssayPage's
-- anonymous-session + short-code resolution) and is out of scope here.

-- ── 1. Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.test_assignments (
  id               TEXT        PRIMARY KEY,          -- nanoid (= teacherKey), one row per student
  owner_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_id          TEXT        NOT NULL,
  student_id       TEXT        NOT NULL,             -- local app student ID
  test_name        TEXT        NOT NULL,             -- denormalized so the portal never needs to read `tests`
  require_seb      BOOLEAN     NOT NULL DEFAULT FALSE,
  duration_minutes INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS test_assignments_owner_idx ON public.test_assignments(owner_id);
CREATE INDEX IF NOT EXISTS test_assignments_test_student_idx ON public.test_assignments(test_id, student_id);

ALTER TABLE public.test_assignments ENABLE ROW LEVEL SECURITY;

-- Teacher owns their assignments
CREATE POLICY "test_assignments_owner_all"
  ON public.test_assignments FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- Admin can read all assignments
CREATE POLICY "test_assignments_admin_select"
  ON public.test_assignments FOR SELECT
  USING (get_my_role() = 'admin');

-- ── 2. Portal student: may only see their own assignments ─────────────────────────
-- Mirrors get_my_essay_assignment_ids() (migration 023, initplan-wrapped in 026).

CREATE OR REPLACE FUNCTION public.get_my_test_assignment_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ta.id
  FROM   public.test_assignments ta
  WHERE  ta.student_id IN (SELECT get_my_student_ids())
$$;

CREATE POLICY "test_assignments_student_select"
  ON public.test_assignments FOR SELECT
  USING (id IN (SELECT get_my_test_assignment_ids()));

REVOKE EXECUTE ON FUNCTION public.get_my_test_assignment_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_test_assignment_ids() TO authenticated;

-- ── 3. student_tests: read-only access for a portal student to their own rows ─────
-- student_tests (migration 033) is otherwise owned entirely by the teacher
-- (owner_id = teacher's auth.uid()) — it was designed for the teacher's own connected
-- session to sync locally-graded/imported StudentTest records up, not for direct writes
-- by students. This policy is purely additive and read-only: it lets a portal-authenticated
-- student see the submission status of their own attempts (populated via the teacher's
-- normal submission-code-import flow), without opening any new write path.

CREATE POLICY "student_tests_student_select"
  ON public.student_tests FOR SELECT
  USING ((data->>'studentId') IN (SELECT get_my_student_ids()));

-- ── 4. tests: read-only access to the content of a student's own assigned tests ───
-- Additive alongside the existing owner-only `tests_own` policy. Scoped strictly to
-- tests the student has a persisted assignment row for — lets the portal embed full
-- test content into a one-click "Open" link (the same self-contained-URL approach
-- TestAssignmentModal already uses when DB embedding is off), rather than pointing
-- students at the still-broken disconnected-client DB-mode fetch described above.
--
-- test_assignments.owner_id records who created the assignment row, not who owns the
-- referenced test_id — nothing enforces those match (no FK from test_assignments.test_id
-- into a per-owner scope). Without the extra `ta.owner_id = tests.owner_id` check below, an
-- assignment row whose test_id points at a DIFFERENT teacher's test would leak that
-- teacher's full test content to the assigned student.

CREATE POLICY "tests_student_select"
  ON public.tests FOR SELECT
  USING (
    id IN (
      SELECT ta.test_id
      FROM public.test_assignments ta
      WHERE ta.id IN (SELECT get_my_test_assignment_ids())
        AND ta.owner_id = tests.owner_id
    )
  );
