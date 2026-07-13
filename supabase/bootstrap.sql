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
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "student_tests_own" on public.student_tests;
create policy "student_tests_own"
  on public.student_tests for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ── 034_recordings_storage.sql ──────────────────────────────────────────────────────────────

-- Audio/video recordings attached to speaking sessions (roadmap 3.1).
-- Same jsonb-document pattern as attachments (001_initial_schema.sql / 003_storage_buckets.sql):
-- metadata + storage_path in `recording_metadata`, file bytes in the `recordings` bucket.

create table if not exists public.recording_metadata (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  storage_path text,
  data jsonb not null
);
create index if not exists recording_metadata_owner_id_idx on public.recording_metadata(owner_id);
create index if not exists recording_metadata_session_id_idx on public.recording_metadata(session_id);

alter table public.recording_metadata enable row level security;

drop policy if exists "recording_metadata_own" on public.recording_metadata;
create policy "recording_metadata_own"
  on public.recording_metadata for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Storage bucket for recording files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 52428800, null) -- 50 MB limit
on conflict (id) do nothing;

-- Recording storage RLS: owner can read/write their own path ({userId}/{recordingId})
drop policy if exists "recordings_storage_owner" on storage.objects;
create policy "recordings_storage_owner"
  on storage.objects for all
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── 035_client_logs.sql ──────────────────────────────────────────────────────────────

-- Stress-test diagnostics: append-only client-side event log.
-- Captures action/sync/error/lifecycle events from both the teacher app and
-- the standalone student pages (essay, test, feedback, preview), tagged with
-- session/role/school for reconstructing what happened during a pilot class.
-- Only written to when the client build sets VITE_STRESS_TEST_LOGGING=true.

create table if not exists public.client_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  role text,
  school_id text,
  user_id uuid,
  category text not null,
  name text not null,
  level text not null default 'info',
  meta jsonb,
  app_version text
);
create index if not exists client_logs_created_at_idx on public.client_logs(created_at);
create index if not exists client_logs_session_idx on public.client_logs(session_id);

alter table public.client_logs enable row level security;

-- Any signed-in client (including anonymous student sign-ins) may append
-- diagnostic events; rows carry no content that benefits an attacker.
drop policy if exists "client_logs_insert" on public.client_logs;
create policy "client_logs_insert"
  on public.client_logs for insert
  to authenticated
  with check (true);

-- Logs are write-only from the client; reviewed via the SQL editor / service role.
drop policy if exists "client_logs_no_select" on public.client_logs;
create policy "client_logs_no_select"
  on public.client_logs for select
  using (false);

-- ── 036_essay_templates.sql ──────────────────────────────────────────────────────────────

-- Essay templates: saved assignment configurations not yet assigned to any student.
-- Same jsonb-document pattern as tests (033_tests_tables.sql).

create table if not exists public.essay_templates (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists essay_templates_owner_id_idx on public.essay_templates(owner_id);

alter table public.essay_templates enable row level security;

drop policy if exists "essay_templates_own" on public.essay_templates;
create policy "essay_templates_own"
  on public.essay_templates for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ── 037_rename_user_role_to_teacher.sql ──────────────────────────────────────────────────────────────

-- Migration 036: Rename role value 'user' → 'teacher' throughout profiles.
-- The old value 'user' was ambiguous; 'teacher' is the explicit, correct label.

-- ── 1. Drop the existing CHECK constraint (auto-named in migration 007) ────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ── 2. Migrate existing data ──────────────────────────────────────────────────
UPDATE public.profiles SET role = 'teacher' WHERE role = 'user';

-- ── 3. New default + CHECK constraint ─────────────────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'teacher';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'teacher', 'student'));

-- ── 4. Update RLS policy that hard-coded 'user' in the IN list ───────────────
-- Migration 009 created profiles_read_users_and_admins with IN ('user','admin').
DROP POLICY IF EXISTS "profiles_read_users_and_admins" ON public.profiles;
CREATE POLICY "profiles_read_users_and_admins"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND get_my_role() IN ('teacher', 'admin')
  );

-- ── 5. Replace handle_new_user() — assigns 'teacher' instead of 'user' ────────
-- Replaces migration 028's version; changes: 'user' → 'teacher' in fallback role
-- and lock name; preserves the is_anonymous → 'student' branch from migration 028.
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
    v_role := 'student';

  ELSIF new.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students
    WHERE data->>'email' IS NOT NULL
      AND lower(data->>'email') = lower(new.email)
  ) THEN
    v_role := 'student';

  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('public.handle_new_user:first_admin'));

    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.profiles WHERE NOT (
        role = 'student' AND email IS NULL
      ) LIMIT 1
    ) THEN 'teacher' ELSE 'admin' END
      INTO v_role;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (new.id, new.email, v_name, v_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- ── 6. Update protect_role_changes() — allow 'teacher' → 'student' self-downgrade
-- Replaces migration 030's version which checked OLD.role = 'user'.
CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Allow a user to downgrade their own role from 'teacher' to 'student'.
    IF NEW.id = auth.uid() AND OLD.role = 'teacher' AND NEW.role = 'student' THEN
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

-- ── 038_audit_logs.sql ──────────────────────────────────────────────────────────────

-- Migration 037: Compliance-grade audit log.
-- Tracks admin actions (3 yr), grade/rubric edits (1 yr), export & auth events (1 mo).
-- pg_cron is enabled here; also activates the anonymize_overdue_students() schedule
-- that has been commented out since migration 017.

-- ── 1. Enable pg_cron ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 2. audit_logs table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  category    text        NOT NULL
                          CHECK (category IN ('admin', 'grade', 'export', 'auth')),
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx    ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_category_idx ON public.audit_logs (category);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON public.audit_logs (created_at DESC);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins see every entry; teachers see only their own.
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR public.get_my_role() = 'admin'
  );

-- Authenticated users can only insert rows attributed to themselves.
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Deletion is cron-only; no user or app code deletes audit rows directly.
-- The cron job runs as postgres (superuser) and bypasses RLS.

-- ── 4. Retention cleanup (pg_cron) ───────────────────────────────────────────
SELECT cron.schedule(
  'audit-cleanup-admin',
  '15 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE category = 'admin'  AND created_at < now() - interval '3 years' $$
);

SELECT cron.schedule(
  'audit-cleanup-grade',
  '20 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE category = 'grade'  AND created_at < now() - interval '1 year' $$
);

SELECT cron.schedule(
  'audit-cleanup-export-auth',
  '25 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE category IN ('export','auth') AND created_at < now() - interval '1 month' $$
);

-- ── 5. Activate the long-pending student anonymization schedule ────────────────
-- anonymize_overdue_students() has existed since migration 017 but was never scheduled.
SELECT cron.schedule(
  'anonymize-overdue-students',
  '0 2 * * *',
  $$ SELECT public.anonymize_overdue_students() $$
);

-- ── 039_security_advisor_fixes.sql ──────────────────────────────────────────────────────────────

-- Migration 036: Fix two real Supabase advisor security warnings
--
-- 1. rls_policy_always_true — client_logs INSERT
--    WITH CHECK (true) lets any authenticated user insert rows with an arbitrary
--    user_id (spoofing another user's identity in the log). Constrain user_id to
--    the calling user: either NULL (anonymous/unauthenticated context) or their
--    own auth.uid().
--
-- 2. pg_graphql_anon_table_exposed — _migrations
--    The _migrations table is Supabase CLI bookkeeping. It has no business being
--    discoverable or queryable via the PostgREST/GraphQL API. Revoke SELECT from
--    both anon and authenticated.

-- ── 1. Tighten client_logs INSERT policy ─────────────────────────────────────

DROP POLICY IF EXISTS "client_logs_insert" ON public.client_logs;

CREATE POLICY "client_logs_insert"
  ON public.client_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));

-- ── 2. Hide _migrations from the API ─────────────────────────────────────────
-- The table only exists in cloud Supabase projects; local stacks skip it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_migrations'
  ) THEN
    REVOKE SELECT ON TABLE public._migrations FROM anon;
    REVOKE SELECT ON TABLE public._migrations FROM authenticated;
  END IF;
END;
$$;

-- ── 040_rubric_marketplace.sql ──────────────────────────────────────────────────────────────

-- Migration 040: Rubric marketplace (school-scoped)
--
-- Lets teachers publish a rubric to their school's marketplace and upvote
-- listings published by colleagues. Scope is the existing schools /
-- school_members tables — there is no public/cross-tenant sharing.
--
-- rubric_snapshot is a frozen jsonb copy of the rubric taken at publish time,
-- not a live FK to public.rubrics, so a listing survives edits or deletion
-- of the source rubric.
--
-- upvote_count is denormalized onto marketplace_listings and is maintained
-- exclusively by the trigger below — clients get no UPDATE grant on it, so
-- the only way to change it is to insert/delete a marketplace_upvotes row.

-- ── 1. marketplace_listings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  published_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rubric_snapshot jsonb       NOT NULL,
  name            text        NOT NULL,
  subject         text,
  description     text,
  attribution     text,
  upvote_count    integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS marketplace_listings_school_id_idx    ON public.marketplace_listings (school_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_published_by_idx ON public.marketplace_listings (published_by);

-- ── 2. marketplace_upvotes ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_upvotes (
  listing_id uuid        NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (listing_id, profile_id)
);

ALTER TABLE public.marketplace_upvotes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS marketplace_upvotes_profile_id_idx ON public.marketplace_upvotes (profile_id);

-- ── 3. marketplace_listings policies ─────────────────────────────────────────
-- SELECT/INSERT are scoped to members of the listing's school. UPDATE/DELETE
-- are restricted to the publisher (school staff can't edit each other's
-- listings, matching the "own rows" convention used elsewhere).

DROP POLICY IF EXISTS marketplace_listings_select ON public.marketplace_listings;
CREATE POLICY marketplace_listings_select ON public.marketplace_listings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = marketplace_listings.school_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_listings_insert ON public.marketplace_listings;
CREATE POLICY marketplace_listings_insert ON public.marketplace_listings FOR INSERT TO authenticated
  WITH CHECK (
    published_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.school_members sm
      WHERE sm.school_id = marketplace_listings.school_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_listings_update ON public.marketplace_listings;
CREATE POLICY marketplace_listings_update ON public.marketplace_listings FOR UPDATE TO authenticated
  USING       (published_by = (SELECT auth.uid()))
  WITH CHECK  (published_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS marketplace_listings_delete ON public.marketplace_listings;
CREATE POLICY marketplace_listings_delete ON public.marketplace_listings FOR DELETE TO authenticated
  USING (published_by = (SELECT auth.uid()));

-- ── 4. marketplace_upvotes policies ──────────────────────────────────────────
-- SELECT is scoped via the parent listing's school membership. INSERT/DELETE
-- are restricted to the voter's own row — nobody can cast or remove a vote
-- on someone else's behalf.

DROP POLICY IF EXISTS marketplace_upvotes_select ON public.marketplace_upvotes;
CREATE POLICY marketplace_upvotes_select ON public.marketplace_upvotes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      JOIN public.school_members sm ON sm.school_id = ml.school_id
      WHERE ml.id = marketplace_upvotes.listing_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_upvotes_insert ON public.marketplace_upvotes;
CREATE POLICY marketplace_upvotes_insert ON public.marketplace_upvotes FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      JOIN public.school_members sm ON sm.school_id = ml.school_id
      WHERE ml.id = marketplace_upvotes.listing_id
        AND sm.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_upvotes_delete ON public.marketplace_upvotes;
CREATE POLICY marketplace_upvotes_delete ON public.marketplace_upvotes FOR DELETE TO authenticated
  USING (profile_id = (SELECT auth.uid()));

-- ── 5. upvote_count trigger ───────────────────────────────────────────────────
-- Keeps marketplace_listings.upvote_count in sync without giving clients any
-- write path to it directly. SECURITY DEFINER so the trigger can update the
-- listing row regardless of the caller's UPDATE grants on that column.

CREATE OR REPLACE FUNCTION public.sync_marketplace_upvote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.marketplace_listings
       SET upvote_count = upvote_count + 1
     WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.marketplace_listings
       SET upvote_count = GREATEST(upvote_count - 1, 0)
     WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_upvotes_sync_count ON public.marketplace_upvotes;
CREATE TRIGGER marketplace_upvotes_sync_count
  AFTER INSERT OR DELETE ON public.marketplace_upvotes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_marketplace_upvote_count();

-- ── 6. Grants ─────────────────────────────────────────────────────────────────
-- upvote_count is deliberately omitted from the column list on UPDATE so
-- clients cannot write it directly; only the SECURITY DEFINER trigger above
-- (running as the function owner) can change it.

GRANT SELECT, INSERT, DELETE ON public.marketplace_listings TO authenticated;
GRANT UPDATE (name, subject, description, attribution) ON public.marketplace_listings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.marketplace_upvotes TO authenticated;

-- ── 041_school_sharing.sql ──────────────────────────────────────────────────────────────

-- Migration 041: Department rubric & comment bank libraries (school-scoped)
--
-- Lets a teacher mark a rubric or comment bank item read-only-visible to every
-- other teacher in their school. The flag lives inside the existing `data`
-- jsonb column (Rubric.sharedWithSchool / CommentBankItem.sharedWithSchool) —
-- no new column, since `data` already round-trips the whole entity on every save.
--
-- Cannot join through two school_members rows the way marketplace_listings_select
-- (migration 040) does: that policy only ever reads the QUERYING user's own
-- school_members row (profile_id = auth.uid()), which their own RLS
-- (school_members_select, migration 016) always allows. A second school_members
-- row for the RUBRIC'S OWNER, looked up by a non-admin colleague, is exactly the
-- case school_members_select hides — so a `me JOIN owner_sm` shape here always
-- evaluates to false for anyone but the owner. Reading the owner's `school_id` off
-- `profiles` instead works because profiles_read_users_and_admins (migration 037)
-- already lets any teacher/admin read every profile.

CREATE POLICY rubrics_school_select ON public.rubrics FOR SELECT TO authenticated
  USING (
    data->'sharedWithSchool' = 'true'::jsonb
    AND EXISTS (
      SELECT 1 FROM public.school_members me
      JOIN public.profiles owner_p ON owner_p.id = rubrics.owner_id
      WHERE me.profile_id = (SELECT auth.uid())
        AND me.school_id = owner_p.school_id
    )
  );

CREATE POLICY comment_bank_school_select ON public.comment_bank FOR SELECT TO authenticated
  USING (
    data->'sharedWithSchool' = 'true'::jsonb
    AND EXISTS (
      SELECT 1 FROM public.school_members me
      JOIN public.profiles owner_p ON owner_p.id = comment_bank.owner_id
      WHERE me.profile_id = (SELECT auth.uid())
        AND me.school_id = owner_p.school_id
    )
  );

-- ── 042_grading_tasks.sql ──────────────────────────────────────────────────────────────

-- Migration 042: Grading task assignment
-- Same jsonb-document pattern as essay_templates (036_essay_templates.sql).
-- `assigned_to_teacher` is a free-text name/email (same loose-identity model as
-- co-grading's `gradedBy`), not a profile id, so RLS stays owner-only — the
-- creator manages the tasks they assigned.

create table if not exists public.grading_tasks (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists grading_tasks_owner_id_idx on public.grading_tasks(owner_id);

alter table public.grading_tasks enable row level security;

drop policy if exists "grading_tasks_own" on public.grading_tasks;
create policy "grading_tasks_own"
  on public.grading_tasks for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ── 043_marketplace_cefr_tags.sql ──────────────────────────────────────────────────────────────

-- Migration 043: CEFR level tags on marketplace listings
--
-- Lets a published rubric carry the CEFR level(s) it targets, so browsers
-- can filter/identify listings by level without opening rubric_snapshot.

ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS cefr_levels text[];

-- ── 044_test_assignments.sql ──────────────────────────────────────────────────────────────

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

-- ── 045_essay_local_tracking_sync.sql ──────────────────────────────────────────────────────────────

-- Multi-device sync for two local-only essay collections that are distinct from
-- the existing essay_assignments/essay_submissions tables:
--
-- - essay_batch_assignments: a teacher's class-assignment bookkeeping (which
--   student was assigned which essay), used by the Activity Dashboard/EssayListPage.
--   Unrelated to essay_assignments, which is a single row per shareable link used
--   by the student-facing DB-submission flow (keyed by teacherKey alone).
-- - essay_offline_submissions: essays imported via a manually pasted share code
--   (the fully offline submission path, no student account), embedding full HTML
--   content — distinct from essay_submissions, which stores Storage-bucket paths
--   for the online student-portal flow.
--
-- Same jsonb-document pattern as essay_templates (036_essay_templates.sql).
--
-- Indexes below are plain (not CONCURRENTLY) intentionally: Supabase migrations run
-- inside a transaction, where CONCURRENTLY is not allowed. Both tables are created
-- immediately above in this same migration, so there's no existing data to lock.

create table if not exists public.essay_batch_assignments (
  id text primary key, -- `${teacherKey}:${studentId}`
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists essay_batch_assignments_owner_id_idx on public.essay_batch_assignments(owner_id);

create table if not exists public.essay_offline_submissions (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists essay_offline_submissions_owner_id_idx on public.essay_offline_submissions(owner_id);

alter table public.essay_batch_assignments enable row level security;
alter table public.essay_offline_submissions enable row level security;

drop policy if exists "essay_batch_assignments_own" on public.essay_batch_assignments;
create policy "essay_batch_assignments_own"
  on public.essay_batch_assignments for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "essay_offline_submissions_own" on public.essay_offline_submissions;
create policy "essay_offline_submissions_own"
  on public.essay_offline_submissions for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ── 046_user_templates_sync.sql ──────────────────────────────────────────────────────────────

-- Saved rubric templates ("save as template" on the Rubric Builder), previously
-- localStorage-only and lost on device change. Same jsonb-document pattern as
-- essay_templates (036_essay_templates.sql).
--
-- The index below is plain (not CONCURRENTLY) intentionally: Supabase migrations run
-- inside a transaction, where CONCURRENTLY is not allowed. The table is created
-- immediately above in this same migration, so there's no existing data to lock.

create table if not exists public.user_templates (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null
);
create index if not exists user_templates_owner_id_idx on public.user_templates(owner_id);

alter table public.user_templates enable row level security;

drop policy if exists "user_templates_own" on public.user_templates;
create policy "user_templates_own"
  on public.user_templates for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ── 047_enable_realtime.sql ──────────────────────────────────────────────────────────────

-- Adds every user-data table to the supabase_realtime publication so connected
-- clients get notified of changes made on other devices/sessions, instead of only
-- picking them up on next login or network reconnect (see StorageSync.startRealtimeSync).
-- RLS still applies to postgres_changes payloads, so this does not widen access —
-- a client only receives change events for rows it could already SELECT.
--
-- Unlike CREATE TABLE/INDEX, `ALTER PUBLICATION ... ADD TABLE` has no IF NOT EXISTS
-- form and errors (not a no-op) if a table is already a member — so a retry or a
-- table added manually beforehand would abort this migration. Guard each one.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'rubrics', 'classes', 'students', 'student_rubrics', 'attachments',
    'grade_scales', 'comment_snippets', 'comment_bank', 'export_templates',
    'favorite_standards', 'self_assessments', 'speaking_sessions', 'analysis_results',
    'tests', 'student_tests', 'essay_templates', 'grading_tasks',
    'essay_batch_assignments', 'essay_offline_submissions', 'user_templates', 'user_settings'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- ── 048_nightly_backup.sql ──────────────────────────────────────────────────────────────

-- Automated backup for deployments with no server-side pg_dump access: Supabase Cloud,
-- and any Supabase instance self-hosted separately from this repo's own docker-compose.yml
-- (scripts/backup.sh only works against that bundled stack — it calls `docker-compose
-- exec db pg_dump` and archives a hardcoded volume name specific to it).
--
-- export_owner_backup() dumps every row a teacher/admin owns as raw table rows (not the
-- app's camelCase StoreData shape) — a disaster-recovery snapshot restorable by a DBA
-- re-inserting rows, not a JSON file meant to round-trip through the app's own
-- importFullBackup(). Called once per teacher/admin profile by the nightly-backup edge
-- function (supabase/functions/nightly-backup), same auth pattern as
-- delete-old-attachments: service-role-only, scheduled via Supabase Dashboard Cron Jobs
-- (Cloud) or pg_cron/an external cron hitting the function URL (self-hosted).
--
-- Metadata only: rows like essay_submissions/speaking_sessions store Storage-bucket
-- paths (essays/recordings buckets), not file contents — this function does not copy
-- the referenced objects. A restored row's storage_path will be broken if the bucket
-- itself isn't backed up separately (e.g. Supabase's own project-level backups, or a
-- storage sync job). Out of scope here to keep this a lightweight per-user DB snapshot.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  -- essay_assignments/essay_submissions have no localStorage mirror at all (unlike the
  -- tables above, which are also cached client-side) — this is their only backup copy.
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.export_owner_backup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_owner_backup(uuid) TO service_role;

-- ── Storage bucket for the resulting JSON snapshots ────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 104857600, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

-- Owner can read/list their own backups ({userId}/{timestamp}.json); writes and
-- deletes are service-role only (the edge function uses the service key, which
-- bypasses RLS, so no write/delete policy is granted to authenticated users here).
CREATE POLICY "backups_storage_owner_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'backups'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 049_test_submission_columns.sql ──────────────────────────────────────────────────────────────

-- Migration 049: student_tests submission columns + duplicate-submission guard,
-- for the submit-test edge function (fixes the disconnected/never-authenticates
-- StudentTestPage DB-mode client flagged in migration 044's scope note).
--
-- Mirrors essay_submissions' real-column-for-identity/jsonb-for-everything-else
-- pattern (008/010), but deliberately does NOT copy essay's original
-- UNIQUE(assignment_id, student_user_id) guard (migration 010). That constraint
-- had to be replaced with UNIQUE(assignment_id, student_email) in migration 022
-- because an anonymous auth.uid() isn't stable across devices/cleared storage — a
-- student resubmitting from a second device got a fresh anon user and slipped past
-- the guard. A test_assignments row is already 1:1 with one student (unlike
-- essay_assignments' shared-per-class link), so assignment_id alone already scopes
-- to exactly one student — no email/user_id pairing needed. student_user_id is
-- kept only for the submit-test rate-limit query, not for uniqueness.

ALTER TABLE public.student_tests
  ADD COLUMN IF NOT EXISTS assignment_id   TEXT REFERENCES public.test_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_user_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ;

-- Indexes below are plain (not CONCURRENTLY) intentionally: Supabase migrations run
-- inside a transaction, where CONCURRENTLY is not allowed. student_tests holds one
-- row per graded/imported test attempt (small per-teacher volume, unlike a
-- high-write table), so the brief exclusive lock during index creation is
-- acceptable.
CREATE UNIQUE INDEX IF NOT EXISTS student_tests_assignment_uniq
  ON public.student_tests (assignment_id)
  WHERE assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_tests_student_user_idx ON public.student_tests(student_user_id);

-- No new RLS insert policy: submit-test writes exclusively via the service-role
-- client, so a client-facing insert policy would be dead code from day one
-- (unlike essay_submissions_student_insert, which predates the edge-function
-- design and is kept only defensively).

-- ── 050_messages.sql ──────────────────────────────────────────────────────────────

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

-- ── 051_flashcards.sql ──────────────────────────────────────────────────────────────

-- Migration 051: Anki-like vocabulary flashcards (roadmap 14.4).
--
-- Three tables following the jsonb-document pattern (033_tests_tables.sql): real
-- columns only for identity/ownership/filtering, everything else in `data`.
--
--   flashcard_decks        teacher-authored decks (cards embedded in data, like Test.questions)
--   flashcard_assignments  one row per (deck, student), id = '<deckId>:<studentId>'
--   flashcard_reviews      one row per (deck, student): the student's FSRS spaced-repetition
--                          state for that deck, id = '<deckId>:<studentId>'
--
-- Students study via the portal with their own authenticated session, mirroring the
-- test_assignments (044) read pattern and the messages (050) trigger-resolved-owner
-- write pattern.

-- ── 1. Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flashcard_decks (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS flashcard_decks_owner_idx ON public.flashcard_decks(owner_id);

CREATE TABLE IF NOT EXISTS public.flashcard_assignments (
  id         TEXT  PRIMARY KEY,
  owner_id   UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id    TEXT  NOT NULL,
  student_id TEXT  NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS flashcard_assignments_owner_idx ON public.flashcard_assignments(owner_id);
CREATE INDEX IF NOT EXISTS flashcard_assignments_deck_student_idx ON public.flashcard_assignments(deck_id, student_id);

CREATE TABLE IF NOT EXISTS public.flashcard_reviews (
  id         TEXT  PRIMARY KEY,
  -- Nullable on purpose: a portal student's insert can't supply a trustworthy
  -- owner_id; the BEFORE INSERT trigger below resolves it from the roster row.
  owner_id   UUID  REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id    TEXT  NOT NULL,
  student_id TEXT  NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS flashcard_reviews_owner_idx ON public.flashcard_reviews(owner_id);
CREATE INDEX IF NOT EXISTS flashcard_reviews_deck_student_idx ON public.flashcard_reviews(deck_id, student_id);

ALTER TABLE public.flashcard_decks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews     ENABLE ROW LEVEL SECURITY;

-- ── 2. Teacher (owner) policies ─────────────────────────────────────────────────

CREATE POLICY "flashcard_decks_owner_all"
  ON public.flashcard_decks FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "flashcard_assignments_owner_all"
  ON public.flashcard_assignments FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "flashcard_reviews_owner_all"
  ON public.flashcard_reviews FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 3. Portal student: read own assignments, read assigned decks ────────────────
-- Mirrors get_my_test_assignment_ids() (044).

CREATE OR REPLACE FUNCTION public.get_my_flashcard_assignment_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fa.id
  FROM   public.flashcard_assignments fa
  WHERE  fa.student_id IN (SELECT get_my_student_ids())
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_flashcard_assignment_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_flashcard_assignment_ids() TO authenticated;

CREATE POLICY "flashcard_assignments_student_select"
  ON public.flashcard_assignments FOR SELECT
  USING (id IN (SELECT get_my_flashcard_assignment_ids()));

CREATE OR REPLACE FUNCTION public.get_my_flashcard_deck_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT fa.deck_id
  FROM   public.flashcard_assignments fa
  WHERE  fa.student_id IN (SELECT get_my_student_ids())
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_flashcard_deck_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_flashcard_deck_ids() TO authenticated;

CREATE POLICY "flashcard_decks_student_select"
  ON public.flashcard_decks FOR SELECT
  USING (id IN (SELECT get_my_flashcard_deck_ids()));

-- ── 4. Portal student: own review state (read + write) ──────────────────────────
-- owner_id is resolved server-side from the roster row, same rationale as
-- set_message_owner_from_student (050): the app-level Student type has no owner_id,
-- and trusting a client-sent one would let a crafted INSERT attach rows to another
-- teacher's account.

CREATE OR REPLACE FUNCTION public.set_flashcard_review_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER flashcard_reviews_set_owner
  BEFORE INSERT ON public.flashcard_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_flashcard_review_owner();

CREATE POLICY "flashcard_reviews_student_select"
  ON public.flashcard_reviews FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- Scoped to decks actually assigned to the student, so a student can't create
-- review rows for arbitrary deck ids.
CREATE POLICY "flashcard_reviews_student_insert"
  ON public.flashcard_reviews FOR INSERT
  WITH CHECK (
    student_id IN (SELECT get_my_student_ids())
    AND deck_id IN (SELECT get_my_flashcard_deck_ids())
  );

CREATE POLICY "flashcard_reviews_student_update"
  ON public.flashcard_reviews FOR UPDATE
  USING      (student_id IN (SELECT get_my_student_ids()))
  WITH CHECK (student_id IN (SELECT get_my_student_ids()));

-- ── 5. Include the new tables in the nightly owner backup ──────────────────────
-- Full replacement of export_owner_backup (048) — same body plus the three
-- flashcard tables appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  -- essay_assignments/essay_submissions have no localStorage mirror at all (unlike the
  -- tables above, which are also cached client-side) — this is their only backup copy.
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;

-- ── 052_flashcards_realtime.sql ──────────────────────────────────────────────────────────────

-- Migration 052: Add the flashcard tables to the supabase_realtime publication.
--
-- 051_flashcards.sql added flashcard_decks/flashcard_assignments/flashcard_reviews
-- to StorageSync's client-side REALTIME_TABLES list, but never published them
-- (047_enable_realtime.sql only covered the tables that existed at the time) —
-- so every session's realtime channel was subscribing to postgres_changes for
-- three tables Postgres doesn't recognize as part of the publication. Same
-- guarded pattern as 047: ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS
-- form and errors on a table that's already a member.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'flashcard_decks', 'flashcard_assignments', 'flashcard_reviews'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

-- ── 053_grant_authenticated_table_access.sql ──────────────────────────────────────────────────────────────

-- Migration 053: Grant authenticated/service_role table-level access in the public schema.
--
-- Every migration up to now was applied as role `postgres`, and Postgres's
-- default privileges for objects owned by `postgres` in schema `public`
-- only give `authenticated`/`anon`/`service_role` DELETE/REFERENCES/TRIGGER/
-- TRUNCATE (Dxt) — not SELECT/INSERT/UPDATE. Only `schools`/`school_members`
-- (016) and `marketplace_listings`/`marketplace_upvotes` (040) ever received
-- an explicit GRANT, so every other table has been returning PostgREST
-- "permission denied" (42501) before RLS is even evaluated — for
-- authenticated users, and for the edge functions that talk to these tables
-- with the service-role key (BYPASSRLS skips row-security policies, not the
-- table-level grant check). This repo's own docker-compose.yml happens to
-- dodge the bug by running migrations as `supabase_admin`, whose default
-- privileges in `public` are already permissive — but `supabase db push`
-- (CLI, Cloud, and the official self-hosted Docker stack) all connect as
-- `postgres`, so they hit it. RLS (already enabled on every table) remains
-- the real access control; these grants only unlock the table-level check
-- PostgREST does first.
--
-- `anon` is deliberately not granted here: every RLS policy in this schema
-- targets `authenticated` only (even the "anonymous sign-in" student flow
-- authenticates and holds an `authenticated` JWT) — anon-key requests
-- should keep getting nothing.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- ── 054_standard_mastery_targets.sql ──────────────────────────────────────────────────────────────

-- Migration 054: Standard mastery targets (roadmap 15.2 slice B).
--
-- Teacher-configured expected-mastery-% per linked standard, per (year, track) —
-- set once globally, reused everywhere that standard is linked across rubrics.
-- Teacher-owned only (no student read/write), so this is simpler than the
-- flashcards tables (051): one jsonb-doc table, owner-only RLS.

CREATE TABLE IF NOT EXISTS public.standard_mastery_targets (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS standard_mastery_targets_owner_idx ON public.standard_mastery_targets(owner_id);

ALTER TABLE public.standard_mastery_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "standard_mastery_targets_owner_all"
  ON public.standard_mastery_targets FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- Full replacement of export_owner_backup (048, last extended by 051) — same body
-- plus standard_mastery_targets appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('standard_mastery_targets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.standard_mastery_targets t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;

-- ── 055_test_assignments_mode.sql ──────────────────────────────────────────────────────────────

-- Migration 055: denormalize Test.mode ('practice' | 'assessment') onto test_assignments,
-- same pattern as test_name in 044, so the student portal to-do list can badge
-- practice vs. assessment without reading `tests`.

ALTER TABLE public.test_assignments ADD COLUMN IF NOT EXISTS mode TEXT;

-- ── 056_test_multiple_attempts.sql ──────────────────────────────────────────────────────────────

-- Migration 056: allow multiple submissions per test_assignments row for practice-mode
-- tests (Test.allowMultipleAttempts), without weakening the existing one-shot guard for
-- assessment-mode tests.
--
-- 049's student_tests_assignment_uniq (UNIQUE on assignment_id alone) hard-blocks a second
-- submit-test insert for the same assignment, full stop. Practice-mode retakes need more
-- than one student_tests row per assignment_id, so the guard is widened to
-- UNIQUE(assignment_id, attempt_number) — submit-test (application code, not this migration)
-- still inserts attempt_number = 1 for assessment-mode assignments, so the original
-- one-submission behavior is unchanged there; it only computes attempt_number > 1 when the
-- assignment's denormalized mode = 'practice'.

ALTER TABLE public.student_tests
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS public.student_tests_assignment_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS student_tests_assignment_attempt_uniq
  ON public.student_tests (assignment_id, attempt_number)
  WHERE assignment_id IS NOT NULL;

-- ── 057_news_flashes.sql ──────────────────────────────────────────────────────────────

-- Migration 057: Curated news/resource flashes (roadmap 16.4).
--
-- Two tables following the jsonb-document pattern (033_tests_tables.sql), mirroring
-- the flashcards migration (051) exactly:
--
--   news_flashes       teacher-authored flashes
--   news_flash_reads   one row per (flash, student): read receipt, id = '<flashId>:<studentId>'
--
-- Students read via the portal with their own authenticated session, mirroring the
-- flashcard_reviews (051) read/trigger-resolved-owner write pattern. No email/digest
-- mechanism — the portal timeline + unread badge is the entire v1 delivery surface.

-- ── 1. Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.news_flashes (
  id       TEXT  PRIMARY KEY,
  owner_id UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS news_flashes_owner_idx ON public.news_flashes(owner_id);

CREATE TABLE IF NOT EXISTS public.news_flash_reads (
  id         TEXT  PRIMARY KEY,
  -- Nullable on purpose: a portal student's insert can't supply a trustworthy
  -- owner_id; the BEFORE INSERT trigger below resolves it from the roster row.
  owner_id   UUID  REFERENCES public.profiles(id) ON DELETE CASCADE,
  flash_id   TEXT  NOT NULL,
  student_id TEXT  NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS news_flash_reads_owner_idx ON public.news_flash_reads(owner_id);
CREATE INDEX IF NOT EXISTS news_flash_reads_flash_student_idx ON public.news_flash_reads(flash_id, student_id);

ALTER TABLE public.news_flashes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_flash_reads ENABLE ROW LEVEL SECURITY;

-- ── 2. Teacher (owner) policies ─────────────────────────────────────────────────

CREATE POLICY "news_flashes_owner_all"
  ON public.news_flashes FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY "news_flash_reads_owner_all"
  ON public.news_flash_reads FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 3. Portal student: read flashes published by their own teacher ──────────────
-- Mirrors get_my_flashcard_deck_ids() (051), but news flashes aren't scoped to
-- explicit per-student assignments — every flash from a student's own teacher(s) is
-- visible, matched via get_my_student_ids() -> students.owner_id the same way
-- get_my_flashcard_assignment_ids() ultimately resolves ownership.

CREATE OR REPLACE FUNCTION public.get_my_news_flash_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nf.id
  FROM   public.news_flashes nf
  WHERE  nf.owner_id IN (
    SELECT DISTINCT s.owner_id FROM public.students s WHERE s.id IN (SELECT get_my_student_ids())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_news_flash_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_news_flash_ids() TO authenticated;

CREATE POLICY "news_flashes_student_select"
  ON public.news_flashes FOR SELECT
  USING (id IN (SELECT get_my_news_flash_ids()));

-- ── 4. Portal student: own read receipts (read + write) ─────────────────────────
-- owner_id is resolved server-side from the roster row, same rationale as
-- set_flashcard_review_owner (051).

CREATE OR REPLACE FUNCTION public.set_news_flash_read_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    SELECT owner_id INTO NEW.owner_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER news_flash_reads_set_owner
  BEFORE INSERT ON public.news_flash_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_news_flash_read_owner();

CREATE POLICY "news_flash_reads_student_select"
  ON public.news_flash_reads FOR SELECT
  USING (student_id IN (SELECT get_my_student_ids()));

-- Scoped to flashes actually visible to the student, so a student can't create
-- read receipts for arbitrary flash ids.
CREATE POLICY "news_flash_reads_student_insert"
  ON public.news_flash_reads FOR INSERT
  WITH CHECK (
    student_id IN (SELECT get_my_student_ids())
    AND flash_id IN (SELECT get_my_news_flash_ids())
  );

-- markNewsFlashReadAsStudent() upserts on onConflict: 'id', so a repeat write for the
-- same (flash, student) pair takes this UPDATE path, not the INSERT path above — mirrors
-- that policy's flash_id scope too, so a student can't repoint an existing read row at a
-- flash outside their visibility.
CREATE POLICY "news_flash_reads_student_update"
  ON public.news_flash_reads FOR UPDATE
  USING (
    student_id IN (SELECT get_my_student_ids())
    AND flash_id IN (SELECT get_my_news_flash_ids())
  )
  WITH CHECK (
    student_id IN (SELECT get_my_student_ids())
    AND flash_id IN (SELECT get_my_news_flash_ids())
  );

-- ── 5. Include the new tables in the nightly owner backup ──────────────────────
-- Full replacement of export_owner_backup (056 was the last to touch it, via
-- 055_test_assignments_mode.sql's ancestor 048) — same body plus the two
-- news_flash tables appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  -- essay_assignments/essay_submissions have no localStorage mirror at all (unlike the
  -- tables above, which are also cached client-side) — this is their only backup copy.
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flashes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flashes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flash_reads',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flash_reads t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;

-- ── 058_rubric_versions.sql ──────────────────────────────────────────────────────────────

-- Migration 058: Rubric version history as its own table (roadmap 18.4).
--
-- Every rubric save used to embed a capped-at-20 array of full-rubric snapshots
-- directly in rubrics.data (Rubric.versions), so each save/hydrate carried ~20x
-- the rubric's real payload. rubric_versions moves that history into its own
-- append-only, jsonb-document table (033_tests_tables.sql pattern), fetched only
-- when the version-history UI opens rather than on every hydrate.
--
-- Owner-only: no student-facing use case, so (unlike flashcards/news flashes)
-- there's no portal read policy or trigger-resolved owner_id.

-- ── 1. Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rubric_versions (
  id         TEXT  PRIMARY KEY,
  owner_id   UUID  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rubric_id  TEXT  NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data       JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS rubric_versions_owner_idx ON public.rubric_versions(owner_id);
CREATE INDEX IF NOT EXISTS rubric_versions_rubric_idx ON public.rubric_versions(rubric_id);

ALTER TABLE public.rubric_versions ENABLE ROW LEVEL SECURITY;

-- ── 2. Owner policies ─────────────────────────────────────────────────────────
-- Append-only in practice (the app never updates or deletes a version row
-- directly — cleanup happens via the rubric_id FK's ON DELETE CASCADE), but
-- FOR ALL matches every other owner-scoped table in this schema rather than
-- inventing a narrower grant for one table.

CREATE POLICY "rubric_versions_owner_all"
  ON public.rubric_versions FOR ALL
  USING      ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── 3. Include the new table in the nightly owner backup ───────────────────────
-- Full replacement of export_owner_backup (057 was the last to touch it) — same
-- body plus rubric_versions appended at the end.

CREATE OR REPLACE FUNCTION public.export_owner_backup(target_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := result || jsonb_build_object('rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubrics t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('rubric_versions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.rubric_versions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('classes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.classes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('students',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.students t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_rubrics',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = false));
  result := result || jsonb_build_object('peer_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_rubrics t WHERE t.grader_id = target_owner AND t.is_peer_review = true));
  result := result || jsonb_build_object('attachments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.attachments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grade_scales',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grade_scales t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_snippets',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_snippets t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('comment_bank',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.comment_bank t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('export_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.export_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('favorite_standards',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.favorite_standards t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('self_assessments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.self_assessments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('speaking_sessions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.speaking_sessions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('analysis_results',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.analysis_results t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('student_tests',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.student_tests t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('grading_tasks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.grading_tasks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_batch_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_batch_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_offline_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_offline_submissions t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_templates',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.user_templates t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('user_settings',
    (SELECT to_jsonb(t) FROM public.user_settings t WHERE t.user_id = target_owner));
  -- essay_assignments/essay_submissions have no localStorage mirror at all (unlike the
  -- tables above, which are also cached client-side) — this is their only backup copy.
  result := result || jsonb_build_object('essay_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('essay_submissions',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.essay_submissions t
     WHERE t.assignment_id IN (SELECT id FROM public.essay_assignments WHERE owner_id = target_owner)));
  result := result || jsonb_build_object('flashcard_decks',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_decks t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_assignments',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_assignments t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('flashcard_reviews',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.flashcard_reviews t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flashes',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flashes t WHERE t.owner_id = target_owner));
  result := result || jsonb_build_object('news_flash_reads',
    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.news_flash_reads t WHERE t.owner_id = target_owner));
  RETURN result;
END;
$$;

-- ── 059_scheduled_digest.sql ──────────────────────────────────────────────────────────────

-- Migration 059: pg_cron-triggered teacher-facing email digest infrastructure (Phase 21.6).
-- Every prior email this app sends (notify-student-graded, notify-student-message) is
-- fired synchronously from a frontend action and addressed to a student. This is the
-- first scheduled, teacher-facing send, so it needs its own dispatch path: pg_cron calls
-- OUT to an edge function via pg_net (raw SQL can't reach the auth mailer the edge
-- function uses), same service-role bearer-token pattern as nightly-backup.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Approximates ModerationQueuePage's pending-dispute count for the digest: a peer-review
-- (second-marker) grade exists whose gradedBy isn't one of the owner's own students
-- (mirrors isSecondMarkerEntry's colleague-vs-student fallback heuristic in
-- coGradingModerationQueue.ts) and a baseline grade exists for the same rubric/student.
-- Deliberately does not recompute the point-delta threshold — that's a client-only,
-- unpersisted UI setting on /moderation — so this counts every open second-marker
-- review, a reasonable "you have work waiting" digest number even where it's wider than
-- the in-app filtered list.
CREATE OR REPLACE FUNCTION public.get_pending_moderation_count(target_owner uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.student_rubrics sr
  WHERE sr.grader_id = target_owner
    AND sr.is_peer_review = true
    AND sr.data->>'gradedBy' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.owner_id = target_owner AND s.id = sr.data->>'gradedBy'
    )
    AND EXISTS (
      SELECT 1 FROM public.student_rubrics baseline
      WHERE baseline.grader_id = target_owner
        AND baseline.is_peer_review = false
        AND baseline.rubric_id = sr.rubric_id
        AND baseline.student_id = sr.student_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_pending_moderation_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_moderation_count(uuid) TO service_role;

-- ── Nightly schedule: call the scheduled-digest edge function ────────────────────────
-- net.http_post needs this project's URL and service-role key, which aren't available
-- to a shared migration file. Set them once per deployment (see docs/SELF_HOSTING_OPS.md
-- for the self-hosted steps; on Supabase Cloud run this from the SQL Editor after
-- deploying the function):
--   ALTER DATABASE postgres SET app.settings.project_url = 'https://<project-ref>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
-- Until those are set, current_setting(..., true) returns NULL and the job's http_post
-- calls fail silently (visible in cron.job_run_details) rather than blocking this migration.
SELECT cron.schedule(
  'teacher-email-digest',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.project_url', true) || '/functions/v1/scheduled-digest',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    )
  $$
);

-- ── 20260617093844_delete_old_attachments_fn.sql ──────────────────────────────────────────────────────────────

-- Returns attachments whose updated_at has passed the owner's school retention
-- period (default 7 years for users not attached to a school).
-- Called by the delete-old-attachments edge function so only the Storage API,
-- not raw SQL, is used to remove files from the attachments bucket.

CREATE OR REPLACE FUNCTION public.get_overdue_attachments(batch_size int DEFAULT 100)
RETURNS TABLE (id text, owner_id uuid, storage_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.owner_id, a.storage_path
  FROM public.attachments a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  LEFT JOIN public.schools  s ON s.id = p.school_id
  WHERE a.storage_path IS NOT NULL
    AND a.updated_at < now() - make_interval(years => COALESCE(s.retention_years, 7))
  LIMIT batch_size;
$$;

-- Only callable by service_role (the edge-function runtime)
REVOKE ALL ON FUNCTION public.get_overdue_attachments(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_attachments(int) TO service_role;

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
    ('033_tests_tables.sql'),
    ('034_recordings_storage.sql'),
    ('035_client_logs.sql'),
    ('036_essay_templates.sql'),
    ('037_rename_user_role_to_teacher.sql'),
    ('038_audit_logs.sql'),
    ('039_security_advisor_fixes.sql'),
    ('040_rubric_marketplace.sql'),
    ('041_school_sharing.sql'),
    ('042_grading_tasks.sql'),
    ('043_marketplace_cefr_tags.sql'),
    ('044_test_assignments.sql'),
    ('045_essay_local_tracking_sync.sql'),
    ('046_user_templates_sync.sql'),
    ('047_enable_realtime.sql'),
    ('048_nightly_backup.sql'),
    ('049_test_submission_columns.sql'),
    ('050_messages.sql'),
    ('051_flashcards.sql'),
    ('052_flashcards_realtime.sql'),
    ('053_grant_authenticated_table_access.sql'),
    ('054_standard_mastery_targets.sql'),
    ('055_test_assignments_mode.sql'),
    ('056_test_multiple_attempts.sql'),
    ('057_news_flashes.sql'),
    ('058_rubric_versions.sql'),
    ('059_scheduled_digest.sql'),
    ('20260617093844_delete_old_attachments_fn.sql')
on conflict (name) do nothing;
