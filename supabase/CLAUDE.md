# Supabase — Claude Code Guide

See root `CLAUDE.md` for overall project context.

## Local development

```bash
npm run db:start   # starts local Supabase stack (PostgreSQL + Auth + Storage)
npm run db:stop
npm run db:reset   # drops everything and re-applies all migrations
```

Supabase CLI config is in `supabase/config.toml`. The local studio runs at http://localhost:54323.

## Migrations

### Naming convention

Files are numbered sequentially: `NNN_description.sql`. The next number is always one higher than the highest existing migration.

```
migrations/
  001_initial_schema.sql
  002_rls_policies.sql
  003_storage_buckets.sql
  004_profile_trigger.sql
  005_add_updated_at.sql
  006_missing_indexes.sql
  007_roles_rls.sql
  008_essay_tables.sql
  009_rls_security_fixes.sql
  010_essay_unique_submission.sql
  011_oauth_profile.sql
  012_site_config.sql
  013_fix_rls_recursion.sql
```

When creating a new migration, use `014_` as the next prefix.

### Rules

- Every `CREATE TABLE` must be in a migration file, never executed ad-hoc.
- Always include `IF NOT EXISTS` guards so migrations are idempotent when possible.
- Never modify an already-applied migration — create a new one instead.
- Run `npm run db:reset` locally to verify a new migration applies cleanly from scratch.

## Row-level security (RLS)

All tables have RLS enabled. The pattern is:
- Users can only access rows they own (matched by `auth.uid() = user_id`).
- Public/shared data uses specific policies defined per table.
- The `site_config` table has its own access rules (see `010_site_config.sql`).

When adding a table, always:
1. Enable RLS: `ALTER TABLE foo ENABLE ROW LEVEL SECURITY;`
2. Add ownership policies for SELECT, INSERT, UPDATE, DELETE.
3. Do not rely on application-level auth checks alone.

The RLS recursion bug (fixed in `011_fix_rls_recursion.sql`) was caused by policies that referenced the same table in a subquery. Avoid circular policy references.

## Storage buckets

Defined in `003_storage_buckets.sql`:
- `attachments` — file attachments for grading (DOCX, PDF, images)
- `essays` — essay submission files

Access is controlled via storage policies that match `auth.uid()` to the uploader.

## Edge functions

Located in `supabase/functions/`. Written in TypeScript for Deno.

Current functions:
- `submit-essay/index.ts` — handles anonymous essay submissions via a submission code (no auth required for students)

### Edge function rules

- Use the Deno standard library and `@supabase/supabase-js` only (already available in the Supabase edge runtime).
- Validate the request body and return proper HTTP status codes.
- The service role key is available as `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` inside edge functions — never expose it to the client.
- Deploy via: `supabase functions deploy <function-name>`

## Key tables

| Table | Purpose |
|---|---|
| `profiles` | User profile, created automatically on signup via trigger |
| `rubrics` | Rubric templates owned by a user |
| `students` | Student records |
| `classes` | Class/group records |
| `student_rubrics` | Grade records (student + rubric + scores) |
| `attachments` | File attachment metadata |
| `comment_snippets` | Reusable comment bank entries |
| `essay_assignments` | Essay prompts created by teachers |
| `essay_submissions` | Student essay submissions |
| `site_config` | Per-user app configuration |

The full schema is in `001_initial_schema.sql` and `008_essay_tables.sql`.

## Offline-first constraint

The Supabase layer is **optional**. The application must work with no database connection. Sync logic lives in `src/services/database/StorageSync.ts`. Do not add Supabase calls directly to components or pages — route them through the service adapters in `src/services/database/`.
