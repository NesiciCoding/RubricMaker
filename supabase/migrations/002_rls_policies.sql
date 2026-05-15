-- Row Level Security policies for RubricMaker
-- Pattern: owner can do everything; sharing tables grant read (and optionally write) to non-owners.

alter table public.profiles enable row level security;
alter table public.rubrics enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.students enable row level security;
alter table public.student_rubrics enable row level security;
alter table public.attachments enable row level security;
alter table public.grade_scales enable row level security;
alter table public.comment_snippets enable row level security;
alter table public.comment_bank enable row level security;
alter table public.export_templates enable row level security;
alter table public.favorite_standards enable row level security;
alter table public.self_assessments enable row level security;
alter table public.speaking_sessions enable row level security;
alter table public.analysis_results enable row level security;
alter table public.user_settings enable row level security;
alter table public.rubric_shares enable row level security;

-- ── Profiles ─────────────────────────────────────────────────────────────────
create policy "profiles_own"
  on public.profiles for all
  using (auth.uid() = id);

-- ── Rubrics: owner full access; shared users can read (and write if mode='edit') ──
create policy "rubrics_owner_all"
  on public.rubrics for all
  using (auth.uid() = owner_id);

create policy "rubrics_shared_select"
  on public.rubrics for select
  using (
    exists (
      select 1 from public.rubric_shares
      where rubric_id = rubrics.id and user_id = auth.uid()
    )
  );

create policy "rubrics_shared_update"
  on public.rubrics for update
  using (
    exists (
      select 1 from public.rubric_shares
      where rubric_id = rubrics.id and user_id = auth.uid() and mode = 'edit'
    )
  );

-- ── Classes: owner full access; class members can read ───────────────────────
create policy "classes_owner_all"
  on public.classes for all
  using (auth.uid() = owner_id);

create policy "classes_member_select"
  on public.classes for select
  using (
    exists (
      select 1 from public.class_members
      where class_id = classes.id and user_id = auth.uid()
    )
  );

-- ── Class members: owner of class manages members; each member sees their own row ──
create policy "class_members_owner_all"
  on public.class_members for all
  using (
    exists (
      select 1 from public.classes
      where id = class_members.class_id and owner_id = auth.uid()
    )
  );

create policy "class_members_self_select"
  on public.class_members for select
  using (auth.uid() = user_id);

-- ── Students: owner full access; class members can read ──────────────────────
create policy "students_owner_all"
  on public.students for all
  using (auth.uid() = owner_id);

create policy "students_class_member_select"
  on public.students for select
  using (
    exists (
      select 1 from public.class_members
      where class_id = students.class_id and user_id = auth.uid()
    )
  );

-- ── Student rubrics: grader full access; class members of the student's class can read ──
create policy "sr_grader_all"
  on public.student_rubrics for all
  using (auth.uid() = grader_id);

create policy "sr_class_member_select"
  on public.student_rubrics for select
  using (
    exists (
      select 1 from public.students s
      join public.class_members cm on cm.class_id = s.class_id
      where s.id = student_rubrics.student_id and cm.user_id = auth.uid()
    )
  );

-- ── Single-owner tables (attachments, grade_scales, etc.) ────────────────────
create policy "attachments_own"
  on public.attachments for all
  using (auth.uid() = owner_id);

create policy "grade_scales_own"
  on public.grade_scales for all
  using (auth.uid() = owner_id);

create policy "comment_snippets_own"
  on public.comment_snippets for all
  using (auth.uid() = owner_id);

create policy "comment_bank_own"
  on public.comment_bank for all
  using (auth.uid() = owner_id);

create policy "export_templates_own"
  on public.export_templates for all
  using (auth.uid() = owner_id);

create policy "favorite_standards_own"
  on public.favorite_standards for all
  using (auth.uid() = owner_id);

create policy "self_assessments_own"
  on public.self_assessments for all
  using (auth.uid() = owner_id);

create policy "speaking_sessions_own"
  on public.speaking_sessions for all
  using (auth.uid() = owner_id);

create policy "analysis_results_own"
  on public.analysis_results for all
  using (auth.uid() = owner_id);

create policy "user_settings_own"
  on public.user_settings for all
  using (auth.uid() = user_id);

-- ── Rubric shares: rubric owner manages shares; target user sees their own rows ──
create policy "rubric_shares_owner_all"
  on public.rubric_shares for all
  using (
    exists (
      select 1 from public.rubrics
      where id = rubric_shares.rubric_id and owner_id = auth.uid()
    )
  );

create policy "rubric_shares_self_select"
  on public.rubric_shares for select
  using (auth.uid() = user_id);
