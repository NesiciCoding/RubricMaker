import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../../supabase/migrations');
const migrations = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(resolve(dir, file), 'utf8') }));

// Account- or org-level tables that are deliberately not part of a teacher's own data
// (mirrors the comment in 079_owner_data_registry.sql). Adding a table here is a decision:
// it will be missing from nightly backups.
const NOT_OWNER_DATA = ['profiles', 'schools', 'school_members', 'audit_logs', 'client_logs', 'site_config'];

function publicTables(): Set<string> {
    const tables = new Set<string>();
    for (const { sql } of migrations) {
        for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi)) {
            tables.add(m[1].toLowerCase());
        }
        for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
            tables.delete(m[1].toLowerCase());
        }
    }
    return tables;
}

function latestBody(fn: string): string {
    for (const { sql } of [...migrations].reverse()) {
        const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
        if (start !== -1) return sql.slice(start, sql.indexOf('$$;', start));
    }
    throw new Error(`${fn} not found`);
}

const registered = new Set([...latestBody('owner_data_tables').matchAll(/\('(\w+)',\s*'(\w+)',/g)].map((m) => m[2]));

// #631: hand-maintained table lists drifted and nightly backups silently lost data.
describe('owner data registry (owner_data_tables)', () => {
    it('covers every public table that is not explicitly allow-listed', () => {
        const missing = [...publicTables()].filter((t) => !registered.has(t) && !NOT_OWNER_DATA.includes(t));
        expect(missing, 'register these in owner_data_tables() or add them to NOT_OWNER_DATA').toEqual([]);
    });

    it('only registers tables that exist', () => {
        const tables = publicTables();
        expect([...registered].filter((t) => !tables.has(t))).toEqual([]);
    });

    it('includes the tables earlier backups dropped or never had', () => {
        for (const t of [
            'rubric_versions',
            'standard_mastery_targets',
            'messages',
            'test_assignments',
            'recording_metadata',
            'scan_metadata',
            'rubric_shares',
            'class_members',
        ]) {
            expect(registered).toContain(t);
        }
    });

    it('drives export_owner_backup instead of a hand-written table list', () => {
        const body = latestBody('export_owner_backup');
        expect(body).toContain('public.owner_data_tables()');
        expect(body).not.toMatch(/FROM public\.rubrics t WHERE/);
    });
});
