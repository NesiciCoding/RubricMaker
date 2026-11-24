import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/108_admin_set_user_password.sql'), 'utf8');
const bootstrap = readFileSync(resolve(__dirname, '../../supabase/bootstrap.sql'), 'utf8');

describe('migration 108 admin_set_user_password', () => {
    it('is restricted to signed-in, non-anonymous admins', () => {
        expect(sql).toContain("coalesce(public.get_my_role(), '') <> 'admin'");
        expect(sql).toContain("auth.jwt() ->> 'is_anonymous'");
        expect(sql).toContain('FROM PUBLIC, anon;');
        expect(sql).toMatch(
            /GRANT\s+EXECUTE ON FUNCTION public\.admin_set_user_password\(text, text, boolean, boolean\) TO authenticated;/
        );
    });

    it('matches the email exactly and refuses ambiguous or missing accounts', () => {
        expect(sql).toContain('lower(u.email) = v_email');
        expect(sql).toContain('IF v_matches <> 1');
    });

    it('hashes with bcrypt and bounds the password to what bcrypt reads', () => {
        expect(sql).toContain("extensions.crypt(p_password, extensions.gen_salt('bf'))");
        expect(sql).toContain('octet_length(p_password) > 72');
    });

    it('never writes the password to the audit log', () => {
        const details = sql.slice(sql.indexOf('jsonb_build_object('), sql.indexOf('RETURN jsonb_build_object'));
        expect(details).not.toContain('p_password');
    });

    it('is part of the regenerated bootstrap', () => {
        expect(bootstrap).toContain('admin_set_user_password');
    });
});
