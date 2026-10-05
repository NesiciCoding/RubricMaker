/**
 * Supabase integration test for migration 078: the nightly retention job (#627).
 *
 * Requires a running local Supabase stack (npm run db:start, npm run e2e:supabase).
 * The job is called the way pg_cron calls it (SQL as postgres); everything else goes through REST.
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY, querySql } from '../fixtures/supabase.fixture';

const svc = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};
const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function svcInsert(table: string, body: unknown): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`insert ${table} failed: ${res.status} ${await res.text()}`);
}

let teacherId: string;
let schoolId: string;
const classId = `c-ret-${uniq()}`;
const overdue = `s-ret-old-${uniq()}`;
const recent = `s-ret-new-${uniq()}`;

test.describe('migration 078 retention anonymization', () => {
    test.beforeAll(async () => {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: svc,
            body: JSON.stringify({
                email: `retention-${uniq()}@example.com`,
                password: 'Retention-1!',
                email_confirm: true,
            }),
        });
        teacherId = ((await res.json()) as { id: string }).id;

        // Membership through school_members only (no profiles.school_id) — the path 018 skipped.
        const school = await fetch(`${SUPABASE_URL}/rest/v1/schools`, {
            method: 'POST',
            headers: { ...svc, Prefer: 'return=representation' },
            body: JSON.stringify({ name: `Retention ${uniq()}`, created_by: teacherId, retention_years: 1 }),
        });
        schoolId = ((await school.json()) as { id: string }[])[0].id;
        await svcInsert('school_members', { school_id: schoolId, profile_id: teacherId });

        await svcInsert('classes', { id: classId, owner_id: teacherId, data: { id: classId, name: 'Retention' } });
        for (const [id, gradedAt] of [
            [overdue, '2019-01-01T00:00:00.000Z'],
            [recent, new Date().toISOString()],
        ]) {
            await svcInsert('students', {
                id,
                owner_id: teacherId,
                class_id: classId,
                data: { id, classId, name: `Pupil ${id}`, email: `${id}@example.com` },
            });
            await svcInsert('student_rubrics', {
                id: `sr-${id}`,
                grader_id: teacherId,
                rubric_id: 'r-retention',
                student_id: id,
                is_peer_review: false,
                data: { id: `sr-${id}`, gradedAt },
            });
        }
    });

    test.afterAll(async () => {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${teacherId}`, { method: 'DELETE', headers: svc });
        await fetch(`${SUPABASE_URL}/rest/v1/schools?id=eq.${schoolId}`, { method: 'DELETE', headers: svc });
    });

    test('anonymizes only students whose latest grade is past retention, and logs the run', async () => {
        const before = Number(querySql("SELECT count(*) FROM public.audit_logs WHERE action = 'retention_anonymize'"));
        // Throws (non-zero psql exit) if the function errors, which is what 018 did on every run.
        querySql('SELECT public.anonymize_overdue_students()');

        const rows = await fetch(`${SUPABASE_URL}/rest/v1/students?id=in.(${overdue},${recent})&select=id,data`, {
            headers: svc,
        });
        const byId = Object.fromEntries(
            ((await rows.json()) as { id: string; data: Record<string, unknown> }[]).map((r) => [r.id, r.data])
        );
        expect(byId[overdue].anonymizedAt).toBeTruthy();
        expect(byId[overdue].name).toMatch(/^Student-/);
        expect(byId[overdue].email).toBeNull();
        expect(byId[overdue].updatedAt).toBe(byId[overdue].anonymizedAt);
        expect(byId[recent].anonymizedAt).toBeUndefined();
        expect(byId[recent].name).toBe(`Pupil ${recent}`);

        const after = Number(querySql("SELECT count(*) FROM public.audit_logs WHERE action = 'retention_anonymize'"));
        expect(after).toBe(before + 1);
    });
});
