/**
 * Supabase integration tests for migration 076 (write-path guards).
 *
 * Requires a running local Supabase stack (npm run db:start, npm run e2e:supabase).
 * Everything goes through the REST/auth APIs, so no browser page is needed.
 */
import { test, expect, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';

const svc = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

const PASSWORD = 'Hardening-Test-1!';
const created: string[] = [];

async function createUser(email: string): Promise<{ id: string; token: string }> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: svc,
        body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`createUser failed: ${res.status} ${await res.text()}`);
    const { id } = (await res.json()) as { id: string };
    created.push(id);
    const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
    return { id, token: ((await login.json()) as { access_token: string }).access_token };
}

function asUser(token: string) {
    return { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
}

async function profileRole(id: string): Promise<string | undefined> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&select=role`, { headers: svc });
    return ((await res.json()) as { role: string }[])[0]?.role;
}

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe('migration 076 write-path guards', () => {
    test.afterAll(async () => {
        for (const id of created) {
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: svc });
        }
    });

    test('a user cannot change their profile email', async () => {
        const u = await createUser(`hardening-email-${uniq()}@example.com`);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${u.id}`, {
            method: 'PATCH',
            headers: { ...asUser(u.token), Prefer: 'return=minimal' },
            body: JSON.stringify({ email: 'someone-else@example.com' }),
        });
        expect(res.ok).toBe(false);
    });

    test('a user can still update their display name', async () => {
        const u = await createUser(`hardening-name-${uniq()}@example.com`);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${u.id}`, {
            method: 'PATCH',
            headers: { ...asUser(u.token), Prefer: 'return=minimal' },
            body: JSON.stringify({ display_name: 'New Name' }),
        });
        expect(res.ok).toBe(true);
    });

    test('a share editor cannot reassign rubric ownership but can edit content', async () => {
        const owner = await createUser(`hardening-owner-${uniq()}@example.com`);
        const editor = await createUser(`hardening-editor-${uniq()}@example.com`);
        const rubricId = `r-${uniq()}`;
        const insert = await fetch(`${SUPABASE_URL}/rest/v1/rubrics`, {
            method: 'POST',
            headers: { ...svc, Prefer: 'return=minimal' },
            body: JSON.stringify({ id: rubricId, owner_id: owner.id, data: { name: 'Shared' } }),
        });
        expect(insert.ok).toBe(true);
        const share = await fetch(`${SUPABASE_URL}/rest/v1/rubric_shares`, {
            method: 'POST',
            headers: { ...svc, Prefer: 'return=minimal' },
            body: JSON.stringify({ rubric_id: rubricId, user_id: editor.id, mode: 'edit' }),
        });
        expect(share.ok).toBe(true);

        const steal = await fetch(`${SUPABASE_URL}/rest/v1/rubrics?id=eq.${rubricId}`, {
            method: 'PATCH',
            headers: { ...asUser(editor.token), Prefer: 'return=minimal' },
            body: JSON.stringify({ owner_id: editor.id }),
        });
        expect(steal.ok).toBe(false);

        const edit = await fetch(`${SUPABASE_URL}/rest/v1/rubrics?id=eq.${rubricId}`, {
            method: 'PATCH',
            headers: { ...asUser(editor.token), Prefer: 'return=minimal' },
            body: JSON.stringify({ data: { name: 'Edited' } }),
        });
        expect(edit.ok).toBe(true);
    });

    test('a roster row owned by an anonymous student account does not grant the student role', async () => {
        const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
            body: JSON.stringify({}),
        });
        expect(signup.ok).toBe(true);
        const planter = ((await signup.json()) as { user: { id: string } }).user;
        created.push(planter.id);
        expect(await profileRole(planter.id)).toBe('student');
        const email = `hardening-victim-${uniq()}@example.com`;
        const plant = await fetch(`${SUPABASE_URL}/rest/v1/students`, {
            method: 'POST',
            headers: { ...svc, Prefer: 'return=minimal' },
            body: JSON.stringify({ id: `s-${uniq()}`, owner_id: planter.id, class_id: 'c1', data: { email } }),
        });
        expect(plant.ok).toBe(true);
        const victim = await createUser(email);
        expect(await profileRole(victim.id)).not.toBe('student');
    });

    test('a roster row owned by a teacher still yields the student role', async () => {
        const first = await createUser(`hardening-teacher-${uniq()}@example.com`);
        const email = `hardening-pupil-${uniq()}@example.com`;
        const roster = await fetch(`${SUPABASE_URL}/rest/v1/students`, {
            method: 'POST',
            headers: { ...svc, Prefer: 'return=minimal' },
            body: JSON.stringify({ id: `s-${uniq()}`, owner_id: first.id, class_id: 'c1', data: { email } }),
        });
        expect(roster.ok).toBe(true);
        const pupil = await createUser(email);
        expect(await profileRole(pupil.id)).toBe('student');
    });

    test('attachment timestamps are set by the server on insert', async () => {
        const u = await createUser(`hardening-att-${uniq()}@example.com`);
        const id = `a-${uniq()}`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/attachments`, {
            method: 'POST',
            headers: { ...asUser(u.token), Prefer: 'return=representation' },
            body: JSON.stringify({ id, owner_id: u.id, data: {}, updated_at: '2001-01-01T00:00:00Z' }),
        });
        expect(res.ok).toBe(true);
        const [row] = (await res.json()) as { updated_at: string }[];
        expect(Date.now() - new Date(row.updated_at).getTime()).toBeLessThan(60_000);
    });
});
