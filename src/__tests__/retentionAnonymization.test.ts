import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../../supabase/migrations');

/** Body of the most recent `CREATE OR REPLACE FUNCTION public.<name>` across all NNN_ migrations. */
function latestDefinition(name: string): { file: string; body: string } {
    const files = readdirSync(dir)
        .filter((f) => /^\d{3}_.*\.sql$/.test(f))
        .sort();
    for (const file of files.reverse()) {
        const sql = readFileSync(resolve(dir, file), 'utf8');
        const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
        if (start === -1) continue;
        return { file, body: sql.slice(start, sql.indexOf('$$;', start)) };
    }
    throw new Error(`${name} is not defined in any migration`);
}

// The cron job runs unattended at 02:00; a broken definition fails silently (#627).
describe('retention anonymization job', () => {
    const { file, body } = latestDefinition('anonymize_overdue_students');

    it('is redefined after the broken 018 version', () => {
        expect(file >= '078').toBe(true);
    });

    it('only references columns that student_rubrics actually has', () => {
        expect(body).not.toMatch(/\bsr\.owner_id\b/);
        expect(body).not.toMatch(/sr\.data->>'studentId'/);
        expect(body).toContain('sr.student_id = s.id');
    });

    it('covers teachers who joined through school_members', () => {
        expect(body).toContain('public.school_members');
    });

    it('records each run in audit_logs and isolates per-student failures', () => {
        expect(body).toContain('INSERT INTO public.audit_logs');
        expect(body).toMatch(/EXCEPTION WHEN others/);
    });

    it('bumps updatedAt so a stale device cannot sync the original name back', () => {
        expect(latestDefinition('anonymize_student').body).toContain("'updatedAt'");
    });
});
