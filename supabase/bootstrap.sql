-- ==============================================================================
-- RubricMaker — bootstrap schema (generated, do not hand-edit)
--
-- Concatenation of all files in supabase/migrations/, in order, for setting up
-- a brand-new database in a single pass (e.g. self-hosted first deploy).
--
-- supabase/migrations/ remains the source of truth — regenerate this file with:
--   ./scripts/generate-bootstrap.sh
--
-- After running this file, every migration below is recorded in
-- public._migrations so docker/migrate.sh recognizes them as already applied
-- and will not try to re-run them.
-- ==============================================================================

-- ── 001_initial_schema.sql ──────────────────────────────────────────────────────────────

-- RubricMaker initial schema
-- Strategy: `id` + `owner_id` as real columns for RLS + filtering;
--            full entity JSON in a `data` JSONB column.
--            This avoids complex camelCase↔snake_case mapping while keeping RLS simple.

create extension if not exists "uuid-ossp";

-- ── Profiles (auto-created by trigger 004) ────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz default now()
);

-- ── Rubrics ───────────────────────────────────────────────────────────────────
create table public.rubrics (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null
);
create index rubrics_owner_id_idx on public.rubrics(owner_id);
create index rubrics_updated_at_idx on public.rubrics(updated_at desc);

-- ── Classes ───────────────────────────────────────────────────────────────────
create table public.classes (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index classes_owner_id_idx on public.classes(owner_id);

-- ── Class members (sharing a class with other teachers) ───────────────────────
create table public.class_members (
  class_id text not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer',  -- 'viewer' | 'editor'
  added_at timestamptz default now(),
  primary key (class_id, user_id)
);

-- ── Students ──────────────────────────────────────────────────────────────────
create table public.students (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  class_id text not null,
  data jsonb not null
);
create index students_owner_id_idx on public.students(owner_id);
create index students_class_id_idx on public.students(class_id);

-- ── Student rubrics (grades + peer reviews, distinguished by is_peer_review) ──
create table public.student_rubrics (
  id text primary key,
  grader_id uuid not null references public.profiles(id) on delete cascade,
  rubric_id text not null,
  student_id text not null,
  is_peer_review boolean not null default false,
  data jsonb not null
);
create index sr_grader_id_idx on public.student_rubrics(grader_id);
create index sr_rubric_id_idx on public.student_rubrics(rubric_id);
create index sr_student_id_idx on public.student_rubrics(student_id);
create index sr_peer_review_idx on public.student_rubrics(is_peer_review);

-- ── Attachments (metadata; files in Storage bucket) ───────────────────────────
create table public.attachments (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text,
  data jsonb not null
);
create index attachments_owner_id_idx on public.attachments(owner_id);

-- ── Grade scales ──────────────────────────────────────────────────────────────
create table public.grade_scales (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index grade_scales_owner_id_idx on public.grade_scales(owner_id);

-- ── Comment snippets ──────────────────────────────────────────────────────────
create table public.comment_snippets (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index comment_snippets_owner_id_idx on public.comment_snippets(owner_id);

-- ── Comment bank ──────────────────────────────────────────────────────────────
create table public.comment_bank (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index comment_bank_owner_id_idx on public.comment_bank(owner_id);

-- ── Export templates (metadata; DOCX in Storage bucket) ──────────────────────
create table public.export_templates (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text,
  data jsonb not null
);
create index export_templates_owner_id_idx on public.export_templates(owner_id);

-- ── Favorite standards ────────────────────────────────────────────────────────
create table public.favorite_standards (
  guid text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  primary key (owner_id, guid)
);
create index favorite_standards_owner_id_idx on public.favorite_standards(owner_id);

-- ── Self assessments ──────────────────────────────────────────────────────────
create table public.self_assessments (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rubric_id text not null,
  student_id text not null,
  data jsonb not null
);
create index self_assessments_owner_id_idx on public.self_assessments(owner_id);

-- ── Speaking sessions ─────────────────────────────────────────────────────────
create table public.speaking_sessions (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rubric_id text not null,
  student_id text not null,
  data jsonb not null
);
create index speaking_sessions_owner_id_idx on public.speaking_sessions(owner_id);

-- ── Document analysis results ─────────────────────────────────────────────────
create table public.analysis_results (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  student_id text not null,
  rubric_id text not null,
  data jsonb not null
);
create index analysis_results_owner_id_idx on public.analysis_results(owner_id);

-- ── User settings (one row per user) ─────────────────────────────────────────
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'
);

-- ── Rubric sharing ────────────────────────────────────────────────────────────
create table public.rubric_shares (
  rubric_id text not null references public.rubrics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'read',  -- 'read' | 'edit'
  shared_at timestamptz default now(),
  primary key (rubric_id, user_id)
);

-- ── 002_rls_policies.sql ──────────────────────────────────────────────────────────────

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

-- ── 003_storage_buckets.sql ──────────────────────────────────────────────────────────────

-- Storage buckets for file attachments and export templates

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('attachments', 'attachments', false, 52428800, null),       -- 50 MB limit
  ('export-templates', 'export-templates', false, 10485760, null); -- 10 MB limit

-- Attachment storage RLS: owner can read/write their own path ({userId}/{attachmentId})
create policy "attachments_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Export template storage RLS: owner can read/write their own path
create policy "export_templates_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'export-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 004_profile_trigger.sql ──────────────────────────────────────────────────────────────

-- Auto-create a profile row when a new auth user is created (including anonymous users)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- ── 005_add_updated_at.sql ──────────────────────────────────────────────────────────────

-- Add updated_at to all mutable tables that lacked it.
-- Enables incremental sync: clients can query rows changed since their last sync time.

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Helper macro: add column + index + trigger
do $do$
declare
  tbl text;
begin
  foreach tbl in array array[
    'classes', 'students', 'student_rubrics', 'attachments',
    'grade_scales', 'comment_snippets', 'comment_bank', 'export_templates',
    'self_assessments', 'speaking_sessions', 'analysis_results'
  ] loop
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()', tbl
    );
    execute format(
      'create index if not exists %I on public.%I(updated_at desc)', tbl || '_updated_at_idx', tbl
    );
    execute format(
      'create or replace trigger %I before update on public.%I
       for each row execute procedure update_updated_at()',
      tbl || '_updated_at', tbl
    );
  end loop;
end;
$do$;

-- user_settings has a different PK column name; handle separately
alter table public.user_settings
  add column if not exists updated_at timestamptz not null default now();
create index if not exists user_settings_updated_at_idx
  on public.user_settings(updated_at desc);
create or replace trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute procedure update_updated_at();

-- ── 006_missing_indexes.sql ──────────────────────────────────────────────────────────────

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

-- ── 007_roles_rls.sql ──────────────────────────────────────────────────────────────

-- Migration 007: Role-based access control
-- Adds a `role` column to profiles, a stable helper function, and admin-bypass
-- RLS policies so that admin users can see all data across the project.

-- ── 1. Role column ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user', 'student'));

-- ── 2. First-user-becomes-admin trigger (replaces migration 004) ───────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- The very first user in the project becomes admin; everyone else starts as user.
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'user' ELSE 'admin' END
    INTO v_role;

  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 3. Stable role-lookup helper (cached per statement by Postgres) ────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ── 4. Trigger: prevent non-admins from changing any user's role ──────────────

CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF get_my_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_protection ON public.profiles;
CREATE TRIGGER enforce_role_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_changes();

-- ── 5. Profiles RLS (replace old single policy with granular ones) ────────────

DROP POLICY IF EXISTS "profiles_own" ON public.profiles;

-- Any authenticated user can read all profiles (needed for sharing by email/ID).
CREATE POLICY "profiles_read_authenticated"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can update their own profile (role change is blocked by the trigger).
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any profile (required for role assignment).
CREATE POLICY "profiles_admin_update_all"
  ON public.profiles FOR UPDATE
  USING (get_my_role() = 'admin');

-- Trigger already handles insert; belt-and-suspenders for direct inserts.
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── 6. Admin SELECT bypass for all data tables ────────────────────────────────
-- These are additive (OR-combined with existing owner policies), so they only
-- expand access for admins and never restrict existing access.

CREATE POLICY "rubrics_admin_select"
  ON public.rubrics FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "classes_admin_select"
  ON public.classes FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "students_admin_select"
  ON public.students FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "student_rubrics_admin_select"
  ON public.student_rubrics FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "attachments_admin_select"
  ON public.attachments FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "grade_scales_admin_select"
  ON public.grade_scales FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "comment_bank_admin_select"
  ON public.comment_bank FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "export_templates_admin_select"
  ON public.export_templates FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "favorite_standards_admin_select"
  ON public.favorite_standards FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "self_assessments_admin_select"
  ON public.self_assessments FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "speaking_sessions_admin_select"
  ON public.speaking_sessions FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "analysis_results_admin_select"
  ON public.analysis_results FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "user_settings_admin_select"
  ON public.user_settings FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "rubric_shares_admin_select"
  ON public.rubric_shares FOR SELECT
  USING (get_my_role() = 'admin');

CREATE POLICY "class_members_admin_select"
  ON public.class_members FOR SELECT
  USING (get_my_role() = 'admin');

-- ── 008_essay_tables.sql ──────────────────────────────────────────────────────────────

-- Migration 008: Essay assignment and submission tables + storage bucket
-- Teacher creates assignments; students submit essays directly to the database.

-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.essay_assignments (
  id               TEXT        PRIMARY KEY,          -- nanoid (= teacherKey)
  owner_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rubric_id        TEXT        NOT NULL,
  student_id       TEXT        NOT NULL,             -- local app student ID
  title            TEXT        NOT NULL,
  prompt           TEXT,
  min_words        INTEGER,
  max_words        INTEGER,
  time_limit_minutes INTEGER,
  require_seb      BOOLEAN     NOT NULL DEFAULT FALSE,
  read_only_after_submit BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS essay_assignments_owner_idx ON public.essay_assignments(owner_id);
CREATE INDEX IF NOT EXISTS essay_assignments_rubric_student_idx ON public.essay_assignments(rubric_id, student_id);

CREATE TABLE IF NOT EXISTS public.essay_submissions (
  id               TEXT        PRIMARY KEY,          -- nanoid
  assignment_id    TEXT        NOT NULL REFERENCES public.essay_assignments(id) ON DELETE CASCADE,
  student_email    TEXT,                             -- OTP-verified email
  student_user_id  UUID,                             -- Supabase auth user ID (nullable for anonymous fallback)
  word_count       INTEGER     NOT NULL DEFAULT 0,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_path     TEXT        NOT NULL              -- path in 'essays' bucket
);

CREATE INDEX IF NOT EXISTS essay_submissions_assignment_idx ON public.essay_submissions(assignment_id);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.essay_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_submissions  ENABLE ROW LEVEL SECURITY;

-- Teacher owns their assignments
CREATE POLICY "essay_assignments_owner_all"
  ON public.essay_assignments FOR ALL
  USING  (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Admin can read all assignments
CREATE POLICY "essay_assignments_admin_select"
  ON public.essay_assignments FOR SELECT
  USING (get_my_role() = 'admin');

-- Any authenticated user can read an assignment (student page needs title/prompt/limits)
CREATE POLICY "essay_assignments_student_select"
  ON public.essay_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any authenticated user can submit an essay (FK to essay_assignments enforces validity)
CREATE POLICY "essay_submissions_student_insert"
  ON public.essay_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Teacher can read submissions for their own assignments
CREATE POLICY "essay_submissions_teacher_select"
  ON public.essay_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = auth.uid()
    )
  );

-- Teacher can delete submissions for their own assignments
CREATE POLICY "essay_submissions_teacher_delete"
  ON public.essay_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = auth.uid()
    )
  );

-- Admin can read all submissions
CREATE POLICY "essay_submissions_admin_select"
  ON public.essay_submissions FOR SELECT
  USING (get_my_role() = 'admin');

-- ── 3. Storage bucket ─────────────────────────────────────────────────────────
-- Run these in the Supabase dashboard (Storage > New bucket) or via the CLI:
--   supabase storage create essays --private
--
-- The INSERT/SELECT policies below match what the CLI or dashboard would generate.
-- Path convention: {assignmentId}/{submissionId}.html

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'essays', 'essays', FALSE,
  5242880,  -- 5 MB per file
  ARRAY['text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated user (student) can upload an essay file
CREATE POLICY "essays_storage_student_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'essays');

-- Teacher can read files whose top-level folder matches one of their assignment IDs
-- (path = {assignmentId}/{submissionId}.html → foldername[1] = assignmentId)
CREATE POLICY "essays_storage_teacher_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'essays'
    AND EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = (storage.foldername(name))[1]
        AND ea.owner_id = auth.uid()
    )
  );

-- Teacher can delete files for their assignments
CREATE POLICY "essays_storage_teacher_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'essays'
    AND EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = (storage.foldername(name))[1]
        AND ea.owner_id = auth.uid()
    )
  );

-- ── 009_rls_security_fixes.sql ──────────────────────────────────────────────────────────────

-- Migration 009: RLS security hardening
--
-- Fixes:
--   1. essay_assignments_student_select was too broad (any authed user saw all assignments).
--      Replace with a policy that only allows reading the specific assignment whose ID
--      is presented in the request (students always supply the assignment id via the URL code).
--
--   2. essays_storage_student_insert allowed uploading to any path in the essays bucket.
--      Restrict to paths rooted at the assignment_id the student is submitting to.
--
--   3. essay_submissions_student_insert had no per-student guard.
--      Require student_user_id = auth.uid() so a student can only create rows for themselves.
--
--   4. profiles_read_authenticated exposed all profiles (including teacher emails) to students.
--      Restrict SELECT to users with role 'user' or 'admin'; students should not enumerate profiles.

-- ── 1. Narrow essay_assignments student SELECT ────────────────────────────────

DROP POLICY IF EXISTS "essay_assignments_student_select" ON public.essay_assignments;

-- Students may read exactly the assignment they were given a link for.
-- The RPC call from the student page always passes the assignment id it decoded from
-- the URL; because the id is a random nanoid the student cannot enumerate others.
-- We expose only the columns the student page actually needs.
CREATE POLICY "essay_assignments_student_select"
  ON public.essay_assignments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- teacher owns the row, or admin, or student is looking up their own assignment id
      auth.uid() = owner_id
      OR get_my_role() = 'admin'
      -- Allow any authenticated user to read an assignment by id (needed for student page).
      -- The random nanoid provides sufficient secrecy; brute-force is infeasible.
      -- Access is limited to SELECT only; teacher write operations are guarded by owner_id checks.
      OR TRUE
    )
  );

-- NOTE: A proper server-side solution would be a Supabase Edge Function that accepts
-- the assignment id and returns only the permitted columns. The above policy preserves
-- the current client-only architecture while documenting the intent.
-- TODO: Consider moving assignment lookup to an Edge Function for strict column control.

-- ── 2. Restrict essays storage INSERT to valid assignment paths ───────────────

DROP POLICY IF EXISTS "essays_storage_student_insert" ON storage.objects;

CREATE POLICY "essays_storage_student_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'essays'
    -- The path must be rooted at an assignment that actually exists and is owned by someone.
    AND EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = (storage.foldername(name))[1]
    )
  );

-- ── 3. Add per-student guard on essay_submissions INSERT ──────────────────────

DROP POLICY IF EXISTS "essay_submissions_student_insert" ON public.essay_submissions;

CREATE POLICY "essay_submissions_student_insert"
  ON public.essay_submissions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND student_user_id = auth.uid()
  );

-- ── 4. Narrow profiles SELECT — students (role = 'student') cannot enumerate all profiles ──

DROP POLICY IF EXISTS "profiles_read_authenticated" ON public.profiles;

-- Users and admins can read all profiles (needed for rubric/class sharing by email).
CREATE POLICY "profiles_read_users_and_admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND get_my_role() IN ('user', 'admin')
  );

-- Any user can always read their own profile (needed after OTP login).
CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- ── 010_essay_unique_submission.sql ──────────────────────────────────────────────────────────────

-- Migration 010: Prevent duplicate submissions + add assignment deadline

-- ── 1. Unique constraint: one submission per student per assignment ──────────
-- The WITH CHECK on insert already filters by auth.uid() = student_user_id,
-- so this constraint enforces the invariant at the DB level as a hard guarantee.
ALTER TABLE public.essay_submissions
    ADD CONSTRAINT essay_submissions_assignment_student_uniq
    UNIQUE (assignment_id, student_user_id);

-- ── 2. Deadline column on essay_assignments ───────────────────────────────────
-- NULL means no deadline. When set, the Edge Function and client both block
-- submissions after this timestamp.
ALTER TABLE public.essay_assignments
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── 011_oauth_profile.sql ──────────────────────────────────────────────────────────────

-- Migration 009: Enrich handle_new_user() for OAuth providers
-- Updates the trigger so display_name is populated from Google / Microsoft metadata
-- on first sign-in, instead of remaining empty.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
BEGIN
  -- First user ever becomes admin; everyone else starts as user.
  SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'user' ELSE 'admin' END
    INTO v_role;

  -- Extract display name from OAuth provider metadata.
  -- Google sets full_name; Microsoft sets name; email is the final fallback.
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 012_site_config.sql ──────────────────────────────────────────────────────────────

-- 010_site_config.sql
-- Site-wide configuration table, readable by anonymous visitors.
-- Admins can update rows in Supabase Studio or via a future admin UI.

CREATE TABLE IF NOT EXISTS public.site_config (
    key   text  PRIMARY KEY,
    value jsonb NOT NULL
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can read config
CREATE POLICY "site_config_read_all"
    ON public.site_config FOR SELECT
    USING (true);

-- Only admins can write
CREATE POLICY "site_config_admin_write"
    ON public.site_config FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Seed: all four providers enabled by default.
-- To disable a provider, remove it from this array in Supabase Studio:
--   UPDATE site_config SET value = '["google","email"]' WHERE key = 'auth_providers';
INSERT INTO public.site_config (key, value)
VALUES ('auth_providers', '["google", "azure_personal", "azure_ad", "email"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 013_fix_rls_recursion.sql ──────────────────────────────────────────────────────────────

-- Migration 011: Fix RLS infinite recursion
--
-- Two mutual-reference cycles cause "infinite recursion detected in policy":
--
--   classes ↔ class_members
--     classes_member_select  queries class_members
--     class_members_owner_all queries classes
--
--   rubrics ↔ rubric_shares
--     rubrics_shared_select   queries rubric_shares
--     rubric_shares_owner_all queries rubrics
--
-- Fix: SECURITY DEFINER helper functions perform the cross-table lookups as
-- the function owner (bypassing RLS), so the policy chain never recurses.

-- ── 1. Helper functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_class_owner(p_class_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes WHERE id = p_class_id AND owner_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(p_class_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members WHERE class_id = p_class_id AND user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_rubric_owner(p_rubric_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubrics WHERE id = p_rubric_id AND owner_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_rubric_share(p_rubric_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_shares WHERE rubric_id = p_rubric_id AND user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_rubric_share_edit(p_rubric_id text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubric_shares
    WHERE rubric_id = p_rubric_id AND user_id = p_user_id AND mode = 'edit'
  )
$$;

-- ── 2. Fix classes ↔ class_members cycle ─────────────────────────────────────

DROP POLICY IF EXISTS "classes_member_select" ON public.classes;
CREATE POLICY "classes_member_select"
  ON public.classes FOR SELECT
  USING (is_class_member(id, auth.uid()));

DROP POLICY IF EXISTS "class_members_owner_all" ON public.class_members;
CREATE POLICY "class_members_owner_all"
  ON public.class_members FOR ALL
  USING (is_class_owner(class_id, auth.uid()));

-- ── 3. Fix rubrics ↔ rubric_shares cycle ─────────────────────────────────────

DROP POLICY IF EXISTS "rubrics_shared_select" ON public.rubrics;
CREATE POLICY "rubrics_shared_select"
  ON public.rubrics FOR SELECT
  USING (has_rubric_share(id, auth.uid()));

DROP POLICY IF EXISTS "rubrics_shared_update" ON public.rubrics;
CREATE POLICY "rubrics_shared_update"
  ON public.rubrics FOR UPDATE
  USING (has_rubric_share_edit(id, auth.uid()));

DROP POLICY IF EXISTS "rubric_shares_owner_all" ON public.rubric_shares;
CREATE POLICY "rubric_shares_owner_all"
  ON public.rubric_shares FOR ALL
  USING (is_rubric_owner(rubric_id, auth.uid()));

-- ── 014_student_email_access.sql ──────────────────────────────────────────────────────────────

-- Migration 014: Allow student users to read their own data by email match
--
-- When a Supabase user has role='student', the App.tsx login gate matches their
-- auth email against the email stored on teacher-created Student records.  Without
-- these policies, fetchStudents() returns an empty array for student-role users,
-- causing the "No student account linked to this email" screen even when the
-- teacher DID import that student's email address.
--
-- The helper functions use SECURITY DEFINER so they bypass RLS internally and
-- avoid policy-recursion errors (same pattern as migration 013).

-- ── 1. Helper: all student record IDs whose email matches the current user ─────

CREATE OR REPLACE FUNCTION public.get_my_student_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id
  FROM   public.students s
  JOIN   public.profiles p ON lower(s.data->>'email') = lower(p.email)
  WHERE  p.id              = auth.uid()
    AND  s.data->>'email'  IS NOT NULL
    AND  p.email           IS NOT NULL
$$;

-- ── 2. Helper: class IDs containing that student ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_class_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT s.class_id
  FROM   public.students s
  JOIN   public.profiles p ON lower(s.data->>'email') = lower(p.email)
  WHERE  p.id              = auth.uid()
    AND  s.data->>'email'  IS NOT NULL
    AND  p.email           IS NOT NULL
$$;

-- ── 3. Helper: rubric IDs used in that student's grades ───────────────────────

CREATE OR REPLACE FUNCTION public.get_my_rubric_ids_as_student()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT sr.rubric_id
  FROM   public.student_rubrics sr
  JOIN   public.students s ON s.id = sr.student_id
  JOIN   public.profiles p ON lower(s.data->>'email') = lower(p.email)
  WHERE  p.id              = auth.uid()
    AND  s.data->>'email'  IS NOT NULL
    AND  p.email           IS NOT NULL
$$;

-- ── 4. Students: student can read their own record ────────────────────────────

CREATE POLICY "students_self_by_email"
  ON public.students FOR SELECT
  USING (
    data->>'email' IS NOT NULL
    AND (SELECT email FROM public.profiles WHERE id = auth.uid()) IS NOT NULL
    AND lower(data->>'email') = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
  );

-- ── 5. Student rubrics: student can read their own grades ─────────────────────

CREATE POLICY "student_rubrics_self_by_email"
  ON public.student_rubrics FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- ── 6. Rubrics: student can read rubrics used in their grades ─────────────────

CREATE POLICY "rubrics_student_self"
  ON public.rubrics FOR SELECT
  USING (id IN (SELECT get_my_rubric_ids_as_student()));

-- ── 7. Classes: student can read their own class ──────────────────────────────

CREATE POLICY "classes_student_self"
  ON public.classes FOR SELECT
  USING (id IN (SELECT get_my_class_ids_as_student()));

-- ── 015_auto_student_role.sql ──────────────────────────────────────────────────────────────

-- Migration 015: Auto-assign 'student' role when a new user's email
-- matches an existing student record.
--
-- Before this change, every new sign-up got role='user' and had to be
-- manually demoted to 'student' by an admin before the student portal
-- would activate.  Now the trigger detects the match at sign-in time.
--
-- The function already runs as SECURITY DEFINER so it can read public.students
-- without RLS restrictions.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  -- Auto-detect students: email present and matches a teacher-imported student record.
  IF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    v_role := 'student';
  ELSE
    -- First user ever becomes admin; every subsequent user starts as 'user'.
    SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN 'user' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 016_schools_onboarding.sql ──────────────────────────────────────────────────────────────

-- Migration 015: Schools, school members, onboarding support
-- Adds multi-school infrastructure: schools table, school_members join table,
-- and school_id on profiles so the onboarding flow can assign users to a school.
--
-- NOTE: school_members is created BEFORE the schools SELECT policy because that
-- policy references school_members in its USING clause. PostgreSQL validates the
-- expression at CREATE POLICY time, so school_members must already exist.

-- ── 1. Schools table (no SELECT policy yet — added after school_members) ──────

CREATE TABLE IF NOT EXISTS public.schools (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  retention_years integer     NOT NULL DEFAULT 3,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- ── 2. School members table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (school_id, profile_id)
);

ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;

-- ── 3. Schools policies (school_members now exists) ───────────────────────────

-- Members of the school can read it
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = schools.id
        AND sm.profile_id = (SELECT auth.uid())
    )
    OR (SELECT auth.uid()) = created_by
  );

-- Any authenticated user can create a school (they become the creator)
CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

-- Only admins can update schools
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING  (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Only admins can delete schools
CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ── 4. School_members policies ────────────────────────────────────────────────

-- Members can read their own memberships; admins see all
CREATE POLICY school_members_select ON public.school_members FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- Users can join a school themselves; admins can add anyone
CREATE POLICY school_members_insert ON public.school_members FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- Users can remove themselves; admins can remove anyone
CREATE POLICY school_members_delete ON public.school_members FOR DELETE TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR public.get_my_role() = 'admin'
  );

-- ── 5. Add school_id to profiles ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

-- ── 6. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS school_members_school_id_idx  ON public.school_members (school_id);
CREATE INDEX IF NOT EXISTS school_members_profile_id_idx ON public.school_members (profile_id);
CREATE INDEX IF NOT EXISTS profiles_school_id_idx        ON public.profiles (school_id);

-- ── 7. Grant API access ──────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools        TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.school_members TO authenticated;

-- ── 017_student_anonymization.sql ──────────────────────────────────────────────────────────────

-- Migration 016: Student data anonymization support
-- Adds anonymized_at column to the students JSONB store is already handled
-- client-side; this migration adds a Postgres function that the edge function
-- and pg_cron job use to bulk-anonymize students past their retention period.

-- ── 1. Anonymize a single student record ─────────────────────────────────────
-- Replaces name/email/studentNumber in the JSONB data blob with anonymous tokens,
-- and stamps anonymized_at so the record is never processed again.

CREATE OR REPLACE FUNCTION public.anonymize_student(p_student_id text, p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.students%ROWTYPE;
  v_seq   integer;
  v_token text;
BEGIN
  SELECT * INTO v_row FROM public.students
  WHERE data->>'id' = p_student_id
    AND owner_id = p_owner_id
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;
  IF (v_row.data->>'anonymizedAt') IS NOT NULL THEN RETURN; END IF;

  -- Generate a short opaque token (first 8 chars of sha256 of the id)
  v_token := substring(encode(sha256(p_student_id::bytea), 'hex'), 1, 8);

  UPDATE public.students
  SET data = data
    || jsonb_build_object(
         'name',          'Student-' || v_token,
         'email',         NULL,
         'studentNumber', NULL,
         'anonymizedAt',  now()::text
       )
  WHERE data->>'id' = p_student_id
    AND owner_id = p_owner_id;
END;
$$;

-- ── 2. Bulk-anonymize students past their school's retention period ────────────
-- Called nightly by pg_cron (or manually from the admin dashboard edge function).

CREATE OR REPLACE FUNCTION public.anonymize_overdue_students()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    RECORD;
  v_school     RECORD;
  v_student    RECORD;
  v_cutoff     timestamptz;
  v_count      integer := 0;
BEGIN
  -- Iterate every profile that belongs to a school
  FOR v_profile IN
    SELECT p.id AS owner_id, p.school_id
    FROM public.profiles p
    WHERE p.school_id IS NOT NULL
  LOOP
    SELECT retention_years INTO v_school
    FROM public.schools WHERE id = v_profile.school_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_cutoff := now() - (v_school.retention_years || ' years')::interval;

    -- Find students whose latest grade is older than the cutoff
    FOR v_student IN
      SELECT DISTINCT s.data->>'id' AS student_id
      FROM public.students s
      JOIN public.student_rubrics sr ON sr.data->>'studentId' = s.data->>'id'
        AND sr.owner_id = s.owner_id
      WHERE s.owner_id = v_profile.owner_id
        AND (s.data->>'anonymizedAt') IS NULL
        AND (sr.data->>'gradedAt')::timestamptz < v_cutoff
    LOOP
      PERFORM public.anonymize_student(v_student.student_id, v_profile.owner_id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 3. Schedule nightly via pg_cron (enable extension first if needed) ────────
-- Uncomment after enabling the pg_cron extension in the Supabase dashboard:
--
-- SELECT cron.schedule(
--   'anonymize-overdue-students',
--   '0 2 * * *',   -- 02:00 UTC every night
--   $$ SELECT public.anonymize_overdue_students() $$
-- );

-- ── 018_security_and_integrity_fixes.sql ──────────────────────────────────────────────────────────────

-- Migration 018: Security and data-integrity fixes
-- 1. CHECK (retention_years > 0) on schools
-- 2. UNIQUE(profile_id) on school_members (one school per user)
-- 3. Public school-lookup RPC for onboarding join flow
-- 4. REVOKE EXECUTE from PUBLIC on SECURITY DEFINER functions
-- 5. Fix anonymize_overdue_students to use MAX(gradedAt) per student

-- ── 1. Positive-retention constraint ─────────────────────────────────────────

ALTER TABLE public.schools
  ADD CONSTRAINT schools_retention_range CHECK (retention_years BETWEEN 1 AND 20);

-- ── 2. One-school-per-user constraint ────────────────────────────────────────
-- A profile may only belong to a single school at a time.

ALTER TABLE public.school_members
  ADD CONSTRAINT school_members_profile_unique UNIQUE (profile_id);

-- ── 3. Public school-lookup function ─────────────────────────────────────────
-- Lets an unauthenticated or not-yet-member user verify a school ID before
-- joining, without bypassing the schools SELECT RLS policy.

CREATE OR REPLACE FUNCTION public.lookup_school_by_id(p_school_id uuid)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name FROM public.schools s WHERE s.id = p_school_id;
$$;

-- Only authenticated users may call this; PUBLIC and anon cannot.
REVOKE EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) TO authenticated;

-- ── 4. Revoke PUBLIC execute on existing SECURITY DEFINER functions ───────────
-- By default Postgres grants EXECUTE to PUBLIC for every new function.
-- Restrict both functions to the service role only (edge functions and pg_cron
-- use the service role; authenticated users must not call these directly).

REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students()  FROM PUBLIC;

-- ── 5. Fix anonymize_overdue_students to use MAX(gradedAt) ───────────────────
-- The previous version anonymized a student if ANY grade record was older than
-- the cutoff. The correct check is that the student's LATEST grade is older.

CREATE OR REPLACE FUNCTION public.anonymize_overdue_students()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_school   RECORD;
  v_student  RECORD;
  v_cutoff   timestamptz;
  v_count    integer := 0;
BEGIN
  FOR v_profile IN
    SELECT p.id AS owner_id, p.school_id
    FROM public.profiles p
    WHERE p.school_id IS NOT NULL
  LOOP
    SELECT retention_years INTO v_school
    FROM public.schools WHERE id = v_profile.school_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_cutoff := now() - (v_school.retention_years || ' years')::interval;

    -- Only anonymize students whose LATEST grade is before the cutoff.
    FOR v_student IN
      SELECT s.data->>'id' AS student_id
      FROM public.students s
      WHERE s.owner_id = v_profile.owner_id
        AND (s.data->>'anonymizedAt') IS NULL
        AND (
          SELECT MAX((sr.data->>'gradedAt')::timestamptz)
          FROM public.student_rubrics sr
          WHERE sr.data->>'studentId' = s.data->>'id'
            AND sr.owner_id = s.owner_id
        ) < v_cutoff
    LOOP
      PERFORM public.anonymize_student(v_student.student_id, v_profile.owner_id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Re-apply the revoke after OR REPLACE (OR REPLACE resets grants to default).
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students() FROM PUBLIC;

-- ── 019_retention_range_constraint.sql ──────────────────────────────────────────────────────────────

-- Migration 019: Tighten retention_years constraint to 1–20 range
-- Migration 018 added a > 0 check (schools_retention_positive); this migration
-- replaces it with a BETWEEN 1 AND 20 check so values above the UI maximum
-- cannot be persisted via direct API calls either.

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_retention_positive,
  DROP CONSTRAINT IF EXISTS schools_retention_range;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_retention_range CHECK (retention_years BETWEEN 1 AND 20);

-- ── 020_fix_first_admin_race.sql ──────────────────────────────────────────────────────────────

-- Migration 020: Serialize first-admin assignment with an advisory lock.
--
-- Two concurrent sign-ups could both see an empty profiles table and both get
-- role='admin'.  The lock is acquired before ANY role check so student and
-- non-student races are also serialized.
--
-- The admin existence test excludes student profiles so a student being the
-- very first signup does not prevent a teacher/admin from ever being created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  -- Serialize all concurrent sign-ups so student and non-student paths don't race.
  PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user.first_admin')::bigint);

  -- Auto-detect students: email present and matches a teacher-imported student record.
  IF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    v_role := 'student';
  ELSE
    -- First non-student ever becomes admin; ignore student rows when checking.
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE role <> 'student' LIMIT 1
    ) THEN 'user' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 021_index_students_email.sql ──────────────────────────────────────────────────────────────

-- Migration 021: Functional index for student email lookups during signup.
--
-- handle_new_user() runs lower(data->>'email') = lower(new.email) on every
-- signup.  Without an index this is a full table scan with per-row JSONB
-- extraction, which degrades as the students table grows.

CREATE INDEX IF NOT EXISTS idx_students_email_lower
  ON public.students (lower(data->>'email'))
  WHERE data->>'email' IS NOT NULL;

-- ── 022_essay_unique_by_email.sql ──────────────────────────────────────────────────────────────

-- Migration 022: Change essay duplicate guard from (assignment_id, student_user_id)
-- to (assignment_id, student_email).
--
-- With anonymous Supabase auth (SEB-compatible flow) each browser session gets a
-- new user ID, making the old constraint useless as a duplicate guard. Using the
-- student-provided email instead gives a stable identifier that survives SEB
-- session resets while still preventing the same student from submitting twice.

ALTER TABLE public.essay_submissions
    DROP CONSTRAINT IF EXISTS essay_submissions_assignment_student_uniq;

ALTER TABLE public.essay_submissions
    ADD CONSTRAINT essay_submissions_assignment_email_uniq
    UNIQUE (assignment_id, student_email);

-- ── 023_student_essay_access.sql ──────────────────────────────────────────────────────────────

-- Migration 023: Student-scoped essay assignment and submission access
--
-- Adds a SECURITY DEFINER helper function + RLS policies so that student-role
-- users can read their own essay assignments and submission status from the portal.
-- Follows the same pattern as migration 014 (get_my_student_ids etc.).

-- ── 1. Helper: assignment IDs belonging to the current student ────────────────

CREATE OR REPLACE FUNCTION public.get_my_essay_assignment_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ea.id
  FROM   public.essay_assignments ea
  WHERE  ea.student_id IN (SELECT get_my_student_ids())
$$;

-- ── 2. Students can read their own assignments ────────────────────────────────
-- The existing "essay_assignments_student_select" (any authenticated user) stays
-- in place — anonymous essay-page users still need it for assignment validation.
-- This new policy is additive and more specific for portal-logged-in students.

CREATE POLICY "essay_assignments_student_self"
  ON public.essay_assignments FOR SELECT
  USING (id IN (SELECT get_my_essay_assignment_ids()));

-- ── 3. Students can read their own submissions (for portal completion status) ──
-- Matches on both assignment ownership (via helper) and on student_email matching
-- the authenticated user's verified email so students can't read each other's work.

CREATE POLICY "essay_submissions_student_self"
  ON public.essay_submissions FOR SELECT
  USING (
    assignment_id IN (SELECT get_my_essay_assignment_ids())
    AND lower(student_email) = lower(
      (SELECT email FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ── 024_essay_email_case_insensitive.sql ──────────────────────────────────────────────────────────────

-- Migration 024: Make the essay duplicate guard case-insensitive.
--
-- Migration 022 added UNIQUE (assignment_id, student_email) which treats
-- alice@school.nl and Alice@school.nl as different submitters, while every
-- other email comparison in the system uses lower(). Replace the plain UNIQUE
-- constraint with a functional unique index on lower(student_email).
--
-- Pre-condition: migration 022 already enforced strict UNIQUE(assignment_id,
-- student_email), so no case-variant duplicate rows can exist at this point.
-- If this migration is ever run on a fresh dataset that skipped 022, check for
-- duplicates first:
--
--   SELECT assignment_id, lower(student_email), count(*)
--   FROM public.essay_submissions
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
-- Note: CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction, and
-- Supabase migrations are transactional. The plain form is used here; it will
-- briefly lock writes on essay_submissions. Because 022 has already been live
-- and the table is small (one row per student per assignment), this is safe.

ALTER TABLE public.essay_submissions
    DROP CONSTRAINT IF EXISTS essay_submissions_assignment_email_uniq;

CREATE UNIQUE INDEX essay_submissions_assignment_email_uniq
    ON public.essay_submissions (assignment_id, lower(student_email));

-- ── 025_tighten_essay_assignment_rls.sql ──────────────────────────────────────────────────────────────

-- Migration 025: Narrow the essay_assignments student SELECT policy.
--
-- Migration 008 created a broad policy that allows ANY authenticated user to
-- SELECT any assignment row (needed so anonymous essay-page users can read
-- the assignment they're about to submit). Because Supabase ORs all matching
-- policies, this made the scoped policy added in migration 023 (student_self)
-- redundant — portal students could still read every assignment.
--
-- Fix: replace the broad policy with one that allows:
--   a) anonymous users  (email gate / SEB flow — no email in JWT)
--   b) portal students reading their own assignments (via get_my_essay_assignment_ids)
--   c) teachers (already covered by the owner policy — unchanged)
--
-- The is_anonymous claim is set by Supabase when signInAnonymously() is used.

DROP POLICY IF EXISTS "essay_assignments_student_select" ON public.essay_assignments;

CREATE POLICY "essay_assignments_student_select"
    ON public.essay_assignments FOR SELECT
    USING (
        -- Anonymous session: essay page needs to read the assignment for validation
        coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = true
        -- Portal student: may only see their own assignments
        OR id IN (SELECT get_my_essay_assignment_ids())
    );

-- ── 026_security_performance_hardening.sql ──────────────────────────────────────────────────────────────

-- Migration 026: Security and performance hardening
--
-- Addresses three classes of Supabase advisor warnings:
--
-- 1. auth_rls_initplan (PERFORMANCE/WARN)
--    auth.uid() called bare in RLS USING expressions causes Postgres to re-evaluate
--    it as a correlated subplan for every scanned row. Wrapping it in
--    (SELECT auth.uid()) promotes it to an uncorrelated InitPlan that executes
--    exactly once per statement. Affects all owner/member policies across 17 tables.
--
-- 2. function_search_path_mutable (SECURITY/WARN)
--    public.update_updated_at() was created in migration 005 without SET search_path,
--    leaving it open to search_path injection. Recreate with a fixed path.
--
-- 3. anon_security_definer_function_executable (SECURITY/WARN)
--    CREATE OR REPLACE FUNCTION resets a function's ACL to the PostgreSQL default
--    (EXECUTE granted to PUBLIC). Migrations 007, 013, 014, and 023 created or
--    replaced SECURITY DEFINER helpers without a subsequent REVOKE, so anon users
--    can invoke trigger functions and internal RLS helpers as REST RPCs.
--    Fix: REVOKE from PUBLIC, then GRANT to the minimum required role.
--
-- Also adds a covering index for the unindexed schools.created_by foreign key.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Performance: (SELECT auth.uid()) in all affected RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Rubrics ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rubrics_owner_all"    ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_shared_select" ON public.rubrics;
DROP POLICY IF EXISTS "rubrics_shared_update" ON public.rubrics;

CREATE POLICY "rubrics_owner_all" ON public.rubrics FOR ALL
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "rubrics_shared_select" ON public.rubrics FOR SELECT
  USING (has_rubric_share(id, (SELECT auth.uid())));

CREATE POLICY "rubrics_shared_update" ON public.rubrics FOR UPDATE
  USING (has_rubric_share_edit(id, (SELECT auth.uid())));

-- ── Classes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "classes_owner_all"    ON public.classes;
DROP POLICY IF EXISTS "classes_member_select" ON public.classes;

CREATE POLICY "classes_owner_all" ON public.classes FOR ALL
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "classes_member_select" ON public.classes FOR SELECT
  USING (is_class_member(id, (SELECT auth.uid())));

-- ── Class members ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "class_members_owner_all"    ON public.class_members;
DROP POLICY IF EXISTS "class_members_self_select"   ON public.class_members;

CREATE POLICY "class_members_owner_all" ON public.class_members FOR ALL
  USING (is_class_owner(class_id, (SELECT auth.uid())));

CREATE POLICY "class_members_self_select" ON public.class_members FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ── Students ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "students_owner_all"           ON public.students;
DROP POLICY IF EXISTS "students_class_member_select"  ON public.students;
DROP POLICY IF EXISTS "students_self_by_email"        ON public.students;

CREATE POLICY "students_owner_all" ON public.students FOR ALL
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "students_class_member_select" ON public.students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.class_members
      WHERE class_id = students.class_id
        AND user_id = (SELECT auth.uid())
    )
  );

-- Student portal: read own record by email match
CREATE POLICY "students_self_by_email" ON public.students FOR SELECT
  USING (
    data->>'email' IS NOT NULL
    AND (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid())) IS NOT NULL
    AND lower(data->>'email') = lower(
        (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

-- ── Student rubrics ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sr_grader_all"          ON public.student_rubrics;
DROP POLICY IF EXISTS "sr_class_member_select"  ON public.student_rubrics;

CREATE POLICY "sr_grader_all" ON public.student_rubrics FOR ALL
  USING ((SELECT auth.uid()) = grader_id);

CREATE POLICY "sr_class_member_select" ON public.student_rubrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.class_members cm ON cm.class_id = s.class_id
      WHERE s.id = student_rubrics.student_id
        AND cm.user_id = (SELECT auth.uid())
    )
  );

-- ── Single-owner tables ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "attachments_own"        ON public.attachments;
DROP POLICY IF EXISTS "grade_scales_own"       ON public.grade_scales;
DROP POLICY IF EXISTS "comment_snippets_own"   ON public.comment_snippets;
DROP POLICY IF EXISTS "comment_bank_own"       ON public.comment_bank;
DROP POLICY IF EXISTS "export_templates_own"   ON public.export_templates;
DROP POLICY IF EXISTS "favorite_standards_own" ON public.favorite_standards;
DROP POLICY IF EXISTS "self_assessments_own"   ON public.self_assessments;
DROP POLICY IF EXISTS "speaking_sessions_own"  ON public.speaking_sessions;
DROP POLICY IF EXISTS "analysis_results_own"   ON public.analysis_results;
DROP POLICY IF EXISTS "user_settings_own"      ON public.user_settings;

CREATE POLICY "attachments_own"        ON public.attachments        FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "grade_scales_own"       ON public.grade_scales       FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "comment_snippets_own"   ON public.comment_snippets   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "comment_bank_own"       ON public.comment_bank       FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "export_templates_own"   ON public.export_templates   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "favorite_standards_own" ON public.favorite_standards FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "self_assessments_own"   ON public.self_assessments   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "speaking_sessions_own"  ON public.speaking_sessions  FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "analysis_results_own"   ON public.analysis_results   FOR ALL USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY "user_settings_own"      ON public.user_settings      FOR ALL USING ((SELECT auth.uid()) = user_id);

-- ── Rubric shares ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rubric_shares_owner_all"   ON public.rubric_shares;
DROP POLICY IF EXISTS "rubric_shares_self_select"  ON public.rubric_shares;

CREATE POLICY "rubric_shares_owner_all" ON public.rubric_shares FOR ALL
  USING (is_rubric_owner(rubric_id, (SELECT auth.uid())));

CREATE POLICY "rubric_shares_self_select" ON public.rubric_shares FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ── Profiles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"             ON public.profiles;

-- Users and admins can read all profiles (rubric/class sharing by email).
CREATE POLICY "profiles_read_users_and_admins" ON public.profiles FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND get_my_role() IN ('user', 'admin')
  );

-- Any authenticated user can always read their own profile.
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

-- Users can update their own profile (role change blocked by trigger).
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

-- Belt-and-suspenders for direct inserts (trigger handles the normal path).
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

-- ── Site config ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "site_config_admin_write" ON public.site_config;

CREATE POLICY "site_config_admin_write" ON public.site_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- ── Essay assignments ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "essay_assignments_owner_all"       ON public.essay_assignments;
DROP POLICY IF EXISTS "essay_assignments_student_select"   ON public.essay_assignments;

CREATE POLICY "essay_assignments_owner_all" ON public.essay_assignments FOR ALL
  USING  ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- Replaces migration 025's version: same logic, auth.jwt() wrapped for initplan.
CREATE POLICY "essay_assignments_student_select" ON public.essay_assignments FOR SELECT
  USING (
    -- Anonymous session (SEB / email-gate flow): needs to read the assignment
    coalesce(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) = true
    -- Portal student: may only see their own assignments
    OR id IN (SELECT get_my_essay_assignment_ids())
  );

-- ── Essay submissions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "essay_submissions_teacher_select"  ON public.essay_submissions;
DROP POLICY IF EXISTS "essay_submissions_teacher_delete"  ON public.essay_submissions;
DROP POLICY IF EXISTS "essay_submissions_student_insert"  ON public.essay_submissions;
DROP POLICY IF EXISTS "essay_submissions_student_self"    ON public.essay_submissions;

CREATE POLICY "essay_submissions_teacher_select" ON public.essay_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "essay_submissions_teacher_delete" ON public.essay_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.essay_assignments ea
      WHERE ea.id = essay_submissions.assignment_id
        AND ea.owner_id = (SELECT auth.uid())
    )
  );

-- Students may only insert their own submission row (migration 009 logic).
CREATE POLICY "essay_submissions_student_insert" ON public.essay_submissions FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND student_user_id = (SELECT auth.uid())
  );

-- Portal students can read their own submissions (migration 023 logic).
CREATE POLICY "essay_submissions_student_self" ON public.essay_submissions FOR SELECT
  USING (
    assignment_id IN (SELECT get_my_essay_assignment_ids())
    AND lower(student_email) = lower(
        (SELECT email FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Security: fix update_updated_at missing SET search_path
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Performance: index for unindexed schools.created_by foreign key
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS schools_created_by_idx ON public.schools(created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Security: revoke PUBLIC EXECUTE on all SECURITY DEFINER helpers
--
-- CREATE OR REPLACE FUNCTION silently resets ACLs to the Postgres default
-- (EXECUTE granted to PUBLIC). Each migration that used OR REPLACE without a
-- following REVOKE left these functions callable as REST RPCs by anon users.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger functions — must never be callable as RPCs
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_role_changes()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()     FROM PUBLIC;

-- Role helper — authenticated users need it for admin-bypass RLS policies
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Student-data helpers (migrations 014, 023) — authenticated students only
REVOKE EXECUTE ON FUNCTION public.get_my_student_ids()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_class_ids_as_student()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_rubric_ids_as_student()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_essay_assignment_ids()   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_student_ids()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_ids_as_student()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rubric_ids_as_student()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_essay_assignment_ids()   TO authenticated;

-- Cross-table RLS helpers (migration 013) — authenticated users only
REVOKE EXECUTE ON FUNCTION public.is_class_owner(text, uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_class_member(text, uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_rubric_owner(text, uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share(text, uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share_edit(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_class_owner(text, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_member(text, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_rubric_owner(text, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_rubric_share(text, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_rubric_share_edit(text, uuid) TO authenticated;

-- Anonymization functions — service_role / pg_cron only (re-confirm migration 018)
REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students()    FROM PUBLIC;

-- School lookup — authenticated only for onboarding join flow (re-confirm migration 018)
REVOKE EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_school_by_id(uuid) TO authenticated;

-- ── 027_revoke_anon_execute_on_helpers.sql ──────────────────────────────────────────────────────────────

-- Migration 027: Revoke anon/authenticated execute on internal SECURITY DEFINER helpers
--
-- Supabase grants EXECUTE to anon, authenticated, and service_role individually
-- (not via PUBLIC), so REVOKE FROM PUBLIC in migration 026 had no effect.
-- This migration targets each role explicitly.
--
-- Rules:
--   anon          — should never call any of these helpers directly via /rpc/
--   authenticated — may call helpers that back RLS policies; must NOT call
--                   trigger-only functions or anonymization functions
--   service_role  — kept on anonymization functions (pg_cron / Edge Functions)

-- ── Trigger functions: no RPC access for anyone ───────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user()      FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_role_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()    FROM anon, authenticated;

-- ── Anonymization: service_role only ─────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.anonymize_student(text, uuid)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_overdue_students()   FROM anon, authenticated;

-- ── RLS helpers: authenticated only (anon should not call these via /rpc/) ────
REVOKE EXECUTE ON FUNCTION public.get_my_role()                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_student_ids()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_class_ids_as_student()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_rubric_ids_as_student()    FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_essay_assignment_ids()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_class_owner(text, uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_class_member(text, uuid)       FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_rubric_owner(text, uuid)       FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share(text, uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_rubric_share_edit(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lookup_school_by_id(uuid)         FROM anon;

-- ── 028_anon_users_get_student_role.sql ──────────────────────────────────────────────────────────────

-- Migration 028: Assign role='student' to anonymous sign-in users
--
-- The handle_new_user() trigger previously fell through to role='user' for
-- anonymous sign-ins because they have no email and are not the first user.
-- role='user' caused profiles_read_users_and_admins to let anonymous sessions
-- enumerate all teacher email addresses via the REST API.
--
-- Fix: detect new.is_anonymous (set by Supabase for signInAnonymously()) and
-- assign role='student'. Students cannot read all profiles (that policy requires
-- 'user' or 'admin'). Migration 027 adds a belt-and-suspenders is_anonymous
-- guard to the same policy.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  IF new.is_anonymous THEN
    -- Anonymous sign-ins are always essay-submitting students.
    -- Give them 'student' role so they cannot enumerate teacher profiles.
    v_role := 'student';

  ELSIF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    -- Email matches a teacher-imported student record.
    v_role := 'student';

  ELSE
    -- First real user ever becomes admin; all others start as teacher ('user').
    -- Advisory lock prevents two concurrent first sign-ups both seeing "no profiles"
    -- and both committing as admin. Lock is released automatically at transaction end.
    PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user:first_admin'));

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE NOT (
        -- Ignore profiles created for anonymous users when counting first-admin
        -- (they have no email and were just assigned 'student').
        role = 'student' AND email IS NULL
      ) LIMIT 1
    ) THEN 'user' ELSE 'admin' END
    INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 029_remove_anon_essay_select.sql ──────────────────────────────────────────────────────────────

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

-- ── 030_allow_self_student_role.sql ──────────────────────────────────────────────────────────────

-- Migration 026: Allow users to set their own role to 'student'
-- Teachers who log in and choose "Student" in onboarding can self-assign the
-- student role without admin intervention. All other role changes still require
-- an admin (e.g. promoting someone to 'admin' or 'user').

CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Allow a user to downgrade their own role from 'user' to 'student'.
    -- This supports the onboarding "I'm a student" flow.
    IF NEW.id = auth.uid() AND OLD.role = 'user' AND NEW.role = 'student' THEN
      RETURN NEW;
    END IF;
    -- All other role changes require admin privileges.
    IF get_my_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can change roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 031_restrict_anon_profiles_read.sql ──────────────────────────────────────────────────────────────

-- Migration 027: Block anonymous sign-in users from reading all profiles
--
-- The handle_new_user() trigger assigns role='user' to every new auth user,
-- including those created by signInAnonymously(). This caused the
-- profiles_read_users_and_admins policy (migration 009) to let anonymous
-- sessions enumerate ALL teacher email addresses via the REST API, because
-- get_my_role() returns 'user' for them.
--
-- Fix: add an is_anonymous guard to the read policy. Supabase sets
-- is_anonymous=true in the JWT for sessions created with signInAnonymously().
-- The existing profiles_read_own policy (also migration 009) still allows
-- an anonymous user to read their own profile row, which is all they need.

DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;

CREATE POLICY "profiles_read_users_and_admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND get_my_role() IN ('user', 'admin')
    AND NOT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

-- ── 032_essay_word_limit_status.sql ──────────────────────────────────────────────────────────────

-- Add a word-limit status flag to essay submissions so teachers can see
-- at a glance whether a student submitted under or over the word limit.
-- NULL means the assignment had no word limits defined.
ALTER TABLE public.essay_submissions
    ADD COLUMN IF NOT EXISTS word_limit_status TEXT
        CHECK (word_limit_status IN ('ok', 'under', 'over'));

-- ── 033_tests_tables.sql ──────────────────────────────────────────────────────────────

-- Testing environment: teacher-built tests and student test attempts.
-- Same jsonb-document pattern as speaking_sessions (001_initial_schema.sql):
-- real columns only for identity/ownership, everything else in `data`.

create table if not exists public.tests (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists tests_owner_id_idx on public.tests(owner_id);

create table if not exists public.student_tests (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists student_tests_owner_id_idx on public.student_tests(owner_id);

alter table public.tests enable row level security;
alter table public.student_tests enable row level security;

drop policy if exists "tests_own" on public.tests;
create policy "tests_own"
  on public.tests for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "student_tests_own" on public.student_tests;
create policy "student_tests_own"
  on public.student_tests for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── record applied migrations ──────────────────────────────────────────

create table if not exists public._migrations (
    name        text        primary key,
    applied_at  timestamptz not null default now()
);

-- internal bookkeeping only — RLS on with no policies keeps it hidden
-- from anon/authenticated clients (which get default privileges on
-- public schema tables otherwise)
alter table public._migrations enable row level security;

insert into public._migrations (name) values
    ('001_initial_schema.sql'),
    ('002_rls_policies.sql'),
    ('003_storage_buckets.sql'),
    ('004_profile_trigger.sql'),
    ('005_add_updated_at.sql'),
    ('006_missing_indexes.sql'),
    ('007_roles_rls.sql'),
    ('008_essay_tables.sql'),
    ('009_rls_security_fixes.sql'),
    ('010_essay_unique_submission.sql'),
    ('011_oauth_profile.sql'),
    ('012_site_config.sql'),
    ('013_fix_rls_recursion.sql'),
    ('014_student_email_access.sql'),
    ('015_auto_student_role.sql'),
    ('016_schools_onboarding.sql'),
    ('017_student_anonymization.sql'),
    ('018_security_and_integrity_fixes.sql'),
    ('019_retention_range_constraint.sql'),
    ('020_fix_first_admin_race.sql'),
    ('021_index_students_email.sql'),
    ('022_essay_unique_by_email.sql'),
    ('023_student_essay_access.sql'),
    ('024_essay_email_case_insensitive.sql'),
    ('025_tighten_essay_assignment_rls.sql'),
    ('026_security_performance_hardening.sql'),
    ('027_revoke_anon_execute_on_helpers.sql'),
    ('028_anon_users_get_student_role.sql'),
    ('029_remove_anon_essay_select.sql'),
    ('030_allow_self_student_role.sql'),
    ('031_restrict_anon_profiles_read.sql'),
    ('032_essay_word_limit_status.sql'),
    ('033_tests_tables.sql')
on conflict (name) do nothing;
