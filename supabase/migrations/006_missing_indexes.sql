-- Add missing indexes on secondary join columns.
-- Most critical: rubric_shares and class_members are used inside RLS policy subqueries,
-- so every row-level access check does a lookup against them. Without indexes these
-- are full sequential scans on every query.

-- rubric_shares: hit by rubrics_shared_select + rubrics_shared_update RLS policies
create index if not exists rubric_shares_rubric_id_idx on public.rubric_shares(rubric_id);
create index if not exists rubric_shares_user_id_idx   on public.rubric_shares(user_id);

-- class_members: hit by classes_member_select, students_class_member_select,
-- sr_class_member_select RLS policies
create index if not exists class_members_class_id_idx on public.class_members(class_id);
create index if not exists class_members_user_id_idx  on public.class_members(user_id);

-- analysis_results: secondary filter columns
create index if not exists analysis_results_rubric_id_idx  on public.analysis_results(rubric_id);
create index if not exists analysis_results_student_id_idx on public.analysis_results(student_id);

-- self_assessments: secondary filter columns
create index if not exists self_assessments_rubric_id_idx  on public.self_assessments(rubric_id);
create index if not exists self_assessments_student_id_idx on public.self_assessments(student_id);

-- speaking_sessions: secondary filter columns
create index if not exists speaking_sessions_rubric_id_idx  on public.speaking_sessions(rubric_id);
create index if not exists speaking_sessions_student_id_idx on public.speaking_sessions(student_id);
