import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    resolve(__dirname, '../../supabase/migrations/104_live_writing_finals_insights_grading.sql'),
    'utf8'
);
const bootstrap = readFileSync(resolve(__dirname, '../../supabase/bootstrap.sql'), 'utf8');

describe('migration 104: show_live_writing_finals', () => {
    const fn = migration.slice(
        migration.indexOf('function public.show_live_writing_finals'),
        migration.indexOf('revoke all on function public.show_live_writing_finals')
    );

    it('is security definer and owner-scoped', () => {
        expect(fn).toContain('SECURITY DEFINER');
        expect(fn).toMatch(/owner_id = auth\.uid\(\)/);
        expect(fn).toContain("RAISE EXCEPTION 'not_session_owner'");
    });

    it('moves voting to finals, closes voting and stops the timer', () => {
        expect(fn).toContain("status = 'finals'");
        expect(fn).toContain('votes_open = false');
        expect(fn).toContain("timer_state = 'ended'");
        expect(fn).toContain("status IN ('voting', 'finals')");
        expect(fn).toContain("RAISE EXCEPTION 'session_not_voting'");
    });

    it('is callable only by authenticated users', () => {
        expect(migration).toMatch(/revoke all on function public\.show_live_writing_finals\(uuid\) from public/);
        expect(migration).toMatch(
            /grant execute on function public\.show_live_writing_finals\(uuid\) to authenticated/
        );
    });

    it('ships in the bootstrap schema', () => {
        expect(bootstrap).toContain('function public.show_live_writing_finals');
    });
});

describe('migration 104: essay_submissions teacher policies', () => {
    it('lets the assignment owner insert a handed-off submission', () => {
        const policy = migration.slice(
            migration.indexOf('create policy essay_submissions_teacher_insert'),
            migration.indexOf('drop policy if exists essay_submissions_teacher_update')
        );
        expect(policy).toContain('for insert');
        expect(policy).toContain('ea.id = essay_submissions.assignment_id');
        expect(policy).toMatch(/ea\.owner_id = \(select auth\.uid\(\)\)/i);
    });

    it('lets the assignment owner update it with the same scope on both sides', () => {
        const policy = migration.slice(migration.indexOf('create policy essay_submissions_teacher_update'));
        expect(policy).toContain('for update');
        expect(policy).toContain('using');
        expect(policy).toContain('with check');
        expect(policy.match(/ea\.owner_id = \(select auth\.uid\(\)\)/gi)).toHaveLength(2);
    });

    it('ships in the bootstrap schema', () => {
        expect(bootstrap).toContain('essay_submissions_teacher_insert');
        expect(bootstrap).toContain('essay_submissions_teacher_update');
    });
});
