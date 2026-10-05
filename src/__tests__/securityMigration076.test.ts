import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/076_security_hardening.sql'), 'utf8');

describe('migration 076', () => {
    it.each([
        ['profiles_protect_identity', 'BEFORE UPDATE ON public.profiles'],
        ['rubrics_protect_owner', 'BEFORE UPDATE ON public.rubrics'],
        ['messages_protect_columns', 'BEFORE UPDATE ON public.messages'],
        ['attachments_set_created_at', 'BEFORE INSERT ON public.attachments'],
    ])('installs %s', (name, clause) => {
        expect(sql).toContain(`CREATE TRIGGER ${name}`);
        expect(sql).toContain(clause);
    });

    it('resolves the student identity from the confirmed auth email, not profiles.email', () => {
        const fn = sql.slice(
            sql.indexOf('FUNCTION public.get_my_verified_email'),
            sql.indexOf('FUNCTION public.get_my_student_ids')
        );
        expect(fn).toContain('auth.users');
        expect(fn).toContain('email_confirmed_at IS NOT NULL');
        const after = sql.slice(sql.indexOf('FUNCTION public.get_my_student_ids'), sql.indexOf('-- ── 3.'));
        expect(after).not.toMatch(/public\.profiles/);
    });

    it('only matches roster rows owned by teacher or admin accounts in handle_new_user', () => {
        const fn = sql.slice(sql.indexOf('FUNCTION public.handle_new_user'), sql.indexOf('-- ── 4.'));
        expect(fn).toContain("owner_p.role IN ('teacher', 'admin')");
    });

    it('limits marketplace updates to descriptive columns', () => {
        expect(sql).toContain('REVOKE UPDATE ON public.marketplace_listings FROM authenticated');
        expect(sql).toMatch(/GRANT UPDATE \(name, subject, description, attribution\)/);
    });

    it('keeps guard functions off the public API', () => {
        for (const fn of ['protect_profile_identity', 'protect_rubric_owner', 'protect_message_columns']) {
            expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC`));
        }
    });
});
