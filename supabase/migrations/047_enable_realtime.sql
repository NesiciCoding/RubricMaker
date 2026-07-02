-- Adds every user-data table to the supabase_realtime publication so connected
-- clients get notified of changes made on other devices/sessions, instead of only
-- picking them up on next login or network reconnect (see StorageSync.startRealtimeSync).
-- RLS still applies to postgres_changes payloads, so this does not widen access —
-- a client only receives change events for rows it could already SELECT.

alter publication supabase_realtime add table
  public.rubrics,
  public.classes,
  public.students,
  public.student_rubrics,
  public.attachments,
  public.grade_scales,
  public.comment_snippets,
  public.comment_bank,
  public.export_templates,
  public.favorite_standards,
  public.self_assessments,
  public.speaking_sessions,
  public.analysis_results,
  public.tests,
  public.student_tests,
  public.essay_templates,
  public.grading_tasks,
  public.essay_batch_assignments,
  public.essay_offline_submissions,
  public.user_templates,
  public.user_settings;
