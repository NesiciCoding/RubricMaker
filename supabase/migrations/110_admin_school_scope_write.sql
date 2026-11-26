-- Migration 110: let an admin manage a colleague's classes and students ("intervene").
--
-- Migration 007 gave admins a read-only window on the whole school (classes_admin_select,
-- students_admin_select). Writes stayed owner-only (classes_owner_all / students_owner_all, 026),
-- which is correct for teachers but left an admin who also teaches in a trap: the app listed every
-- class in the school and offered the same manage actions on all of them, and the writes were
-- refused. Two different failures came out of that:
--
--   * update (rename/merge/link) — Postgres raises "new row violates row-level security policy",
--     so the client queued the write and retried it on every reconnect, forever;
--   * delete — Postgres filters the row and reports success with 0 rows, so the client believed the
--     class was gone; it came back on the next hydrate with no message at all.
--
-- The client now detects both (SupabaseAdapter.writeResult → code 'forbidden': no retry loop, and a
-- toast instead of silence) and hides class management on classes the admin does not own unless
-- they switch the roster scope to "whole school". This migration is what makes that switch real:
-- with it, the intervention path actually writes.
--
-- Ownership is preserved on purpose: the client sends the row's existing owner_id (it is carried
-- into local state as `ownerId`), so an admin editing or merging a colleague's class never becomes
-- its owner and the colleague keeps their class.
--
-- Grading is deliberately NOT opened up: can_grade_student (077) still requires being the owner or
-- an editor on the class, so an admin cannot silently become the teacher of record for grades.

CREATE POLICY "classes_admin_write" ON public.classes FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "students_admin_write" ON public.students FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');
