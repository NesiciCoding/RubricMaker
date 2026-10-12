import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/088_site_config_anon_providers.sql'), 'utf8');
const bootstrap = readFileSync(resolve(__dirname, '../../supabase/bootstrap.sql'), 'utf8');

describe('migration 088 (#626)', () => {
    it('lets logged-out visitors read site_config', () => {
        expect(sql).toContain('GRANT SELECT ON public.site_config TO anon;');
    });

    it('limits anon to the auth_providers key, since other values can hold API keys', () => {
        const anonPolicy = sql.slice(sql.indexOf('CREATE POLICY site_config_read_public'));
        expect(anonPolicy).toMatch(/FOR SELECT TO anon\s+USING \(key = 'auth_providers'\);/);
        expect(sql).toContain('DROP POLICY IF EXISTS "site_config_read_all" ON public.site_config;');
        expect(sql).toMatch(
            /CREATE POLICY site_config_read_authenticated ON public\.site_config FOR SELECT TO authenticated/
        );
    });

    it('is part of the regenerated bootstrap', () => {
        expect(bootstrap).toContain('site_config_read_public');
    });
});
