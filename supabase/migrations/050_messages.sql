-- Migration 050: Student <-> teacher messaging (roadmap 14.3).
--
-- Portal-authenticated students only (real auth.uid() session via get_my_student_ids(),
-- same as test_assignments/essay_assignments) -- the anonymous share-link hand-in flows
-- (StudentEssayPage/StudentTestPage) are out of scope, they have no stable identity to
-- ever see a reply. That means this table needs no edge function: a portal session is a
-- real authenticated user, not signInAnonymously(), so direct-table RLS is sufficient.
--
-- A "thread" is just every row sharing (student_id, context_type, context_id) -- no
-- separate threads table. Flat columns (not jsonb) since we filter/group by that key,
-- mirroring test_assignments' shape rather than essay_assignments' jsonb `data` blob.

CREATE TABLE IF NOT EXISTS public.messages (
  id              TEXT        PRIMARY KEY,
  owner_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id      TEXT        NOT NULL,
  context_type    TEXT        NOT NULL CHECK (context_type IN ('rubric', 'test', 'essay', 'general')),
  context_id      TEXT,                    -- NULL when context_type = 'general'
  context_label   TEXT,                    -- denormalized rubric/test/essay title, avoids a join
  sender          TEXT        NOT NULL CHECK (sender IN ('student', 'teacher')),
  body            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_by_teacher BOOLEAN     NOT NULL DEFAULT FALSE,
  read_by_student BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS messages_owner_idx ON public.messages(owner_id);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON public.messages(owner_id, student_id, context_type, context_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Teacher owns/manages every message in their scope (read, reply, mark read).
CREATE POLICY "messages_owner_all"
  ON public.messages FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- Portal student: read own thread messages.
CREATE POLICY "messages_student_select"
  ON public.messages FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- A portal student's app-level Student type has no owner_id field (it's a DB-only
-- column), so the client can't supply a trustworthy owner_id on insert. Resolve it
-- server-side instead: a BEFORE INSERT trigger looks it up from the roster row itself,
-- which also closes the door on a crafted INSERT pointing a message at some other
-- teacher's owner_id -- the trigger overwrites whatever (if anything) the client sent.
CREATE OR REPLACE FUNCTION public.set_message_owner_from_student()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sender = 'student' THEN
    SELECT owner_id INTO NEW.owner_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_set_owner_from_student
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_message_owner_from_student();

-- Portal student: may insert only their own student-authored rows (owner_id is
-- resolved server-side by the trigger above, not trusted from the client).
CREATE POLICY "messages_student_insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender = 'student'
    AND student_id IN (SELECT get_my_student_ids())
  );

-- Portal student: may flip read_by_student on their own thread's messages (marking a
-- teacher reply as read). Same USING/WITH CHECK scope as the select policy.
CREATE POLICY "messages_student_update_read"
  ON public.messages FOR UPDATE
  USING      (student_id IN (SELECT get_my_student_ids()))
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));
