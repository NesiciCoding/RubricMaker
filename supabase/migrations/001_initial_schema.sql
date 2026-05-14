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
