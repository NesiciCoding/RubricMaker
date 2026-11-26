import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    resolve(__dirname, '../../supabase/migrations/112_live_writing_portal_join.sql'),
    'utf8'
);
const bootstrap = readFileSync(resolve(__dirname, '../../supabase/bootstrap.sql'), 'utf8');

const fn = migration.slice(
    migration.indexOf('function public.join_live_writing_portal'),
    migration.indexOf('revoke all on function public.join_live_writing_portal')
);

describe('migration 112: portal join', () => {
    it('adds the per-session opt-in, off by default', () => {
        expect(migration).toMatch(
            /alter table public\.live_writing_sessions\s+add column if not exists portal_join boolean not null default false/i
        );
    });

    it('resolves the roster row from the portal profile, not a client-supplied id', () => {
        expect(fn).toContain('SECURITY DEFINER');
        expect(fn).toMatch(/auth\.uid\(\) IS NULL/);
        // The same identity seam as get_my_student_ids() (migration 014).
        expect(fn).toContain("JOIN public.profiles p ON lower(s.data ->> 'email') = lower(p.email)");
        expect(fn).toContain('p.id = auth.uid()');
        expect(fn).toContain('s.class_id = v_session.class_id');
        expect(fn).toContain('s.owner_id = v_session.owner_id');
        expect(fn).toContain("s.data ->> 'archivedAt' IS NULL");
        expect(fn).not.toContain('p_student_id');
    });

    it('requires the session to opt in and keeps the public join guards', () => {
        expect(fn).toContain('IF NOT v_session.portal_join');
        expect(fn).toContain("RAISE EXCEPTION 'portal_join_disabled'");
        expect(fn).toContain("RAISE EXCEPTION 'invalid_code'");
        expect(fn).toContain("RAISE EXCEPTION 'student_not_in_class'");
        expect(fn).toContain("v_session.status NOT IN ('lobby', 'writing')");
        expect(fn).toContain('v_session.lock_after_start');
    });

    it('issues a fresh participant token and returns the join payload', () => {
        expect(fn).toContain('gen_random_uuid()');
        expect(fn).toContain('ON CONFLICT (session_id, student_id) DO UPDATE');
        expect(fn).toContain('RETURN QUERY SELECT');
    });

    it('is callable only by authenticated users', () => {
        expect(migration).toMatch(/revoke all on function public\.join_live_writing_portal\(text\) from public/);
        expect(migration).toMatch(
            /grant execute on function public\.join_live_writing_portal\(text\) to authenticated/
        );
        expect(migration).not.toMatch(/join_live_writing_portal\(text\) to anon/);
    });

    it('ships the column and RPC in the bootstrap schema', () => {
        expect(bootstrap).toContain('portal_join boolean NOT NULL DEFAULT false');
        expect(bootstrap).toContain('function public.join_live_writing_portal');
        expect(bootstrap).toContain("('112_live_writing_portal_join.sql')");
    });
});
