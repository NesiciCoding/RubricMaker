/**
 * Supabase integration tests for migrations 079/080: export_owner_backup covers every owner table (#631),
 * and erase_my_data removes exactly the caller's rows (#642).
 *
 * Requires a running local Supabase stack (npm run db:start, npm run e2e:supabase).
 */
import {
    test,
    expect,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY,
    querySql,
} from '../fixtures/supabase.fixture';

const svc = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};
const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
// Keep in sync with NOT_OWNER_DATA in src/__tests__/ownerDataRegistry.test.ts.
const NOT_OWNER_DATA = ['profiles', 'schools', 'school_members', 'audit_logs', 'client_logs', 'site_config'];

async function svcInsert(table: string, body: unknown): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`insert ${table} failed: ${res.status} ${await res.text()}`);
}

let ownerId: string;

test.describe('migration 079 owner data registry', () => {
    test.beforeAll(async () => {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: svc,
            body: JSON.stringify({ email: `backup-${uniq()}@example.com`, password: 'Backup-1!', email_confirm: true }),
        });
        ownerId = ((await res.json()) as { id: string }).id;
    });

    test.afterAll(async () => {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${ownerId}`, { method: 'DELETE', headers: svc });
    });

    test('every public table in the live schema is registered or allow-listed', () => {
        const live = querySql(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        ).split('\n');
        const registered = new Set(querySql('SELECT DISTINCT table_name FROM public.owner_data_tables()').split('\n'));
        expect(live.filter((t) => !registered.has(t) && !NOT_OWNER_DATA.includes(t))).toEqual([]);
    });

    test('the nightly backup includes rubric versions and messages', async () => {
        const rubricId = `r-bk-${uniq()}`;
        await svcInsert('rubrics', { id: rubricId, owner_id: ownerId, data: { id: rubricId, name: 'Backup' } });
        await svcInsert('rubric_versions', { id: `v-${rubricId}`, rubric_id: rubricId, owner_id: ownerId, data: {} });
        await svcInsert('messages', {
            id: `m-${rubricId}`,
            owner_id: ownerId,
            student_id: 's-none',
            context_type: 'general',
            sender: 'teacher',
            body: 'hello',
        });

        // Same call the nightly-backup edge function makes.
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/export_owner_backup`, {
            method: 'POST',
            headers: svc,
            body: JSON.stringify({ target_owner: ownerId }),
        });
        expect(res.ok).toBe(true);
        const snapshot = (await res.json()) as Record<string, unknown[]>;
        expect(snapshot.rubrics).toHaveLength(1);
        expect(snapshot.rubric_versions).toHaveLength(1);
        expect(snapshot.messages).toHaveLength(1);
        for (const key of ['standard_mastery_targets', 'test_assignments', 'recording_metadata', 'scan_metadata']) {
            expect(snapshot[key]).toEqual([]);
        }
    });

    test("erase_my_data deletes the caller's rows and nothing else", async () => {
        const email = `erase-${uniq()}@example.com`;
        const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: svc,
            body: JSON.stringify({ email, password: 'Erase-Test-1!', email_confirm: true }),
        });
        const eraserId = ((await created.json()) as { id: string }).id;
        const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({ email, password: 'Erase-Test-1!' }),
        });
        const token = ((await login.json()) as { access_token: string }).access_token;
        try {
            const mine = `r-erase-${uniq()}`;
            const theirs = `r-keep-${uniq()}`;
            await svcInsert('rubrics', { id: mine, owner_id: eraserId, data: { id: mine } });
            await svcInsert('rubric_versions', { id: `v-${mine}`, rubric_id: mine, owner_id: eraserId, data: {} });
            await svcInsert('rubrics', { id: theirs, owner_id: ownerId, data: { id: theirs } });

            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/erase_my_data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${token}`,
                },
                body: '{}',
            });
            expect(res.ok).toBe(true);
            const body = (await res.json()) as { deleted: Record<string, number>; errors: Record<string, string> };
            expect(body.errors).toEqual({});
            expect(body.deleted.rubrics).toBe(1);
            expect(body.deleted.rubric_versions).toBe(1);
            expect(querySql(`SELECT count(*) FROM public.rubrics WHERE id IN ('${mine}', '${theirs}')`)).toBe('1');
        } finally {
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${eraserId}`, { method: 'DELETE', headers: svc });
        }
    });
});
