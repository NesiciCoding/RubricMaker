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
