/**
 * Supabase integration tests for migration 077 (profile read scope, grade row write check).
 *
 * Requires a running local Supabase stack (npm run db:start, npm run e2e:supabase).
 * Everything goes through the REST/auth APIs, so no browser page is needed.
 */
import {
    test,
    expect,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_KEY,
    promoteToAdmin,
} from '../fixtures/supabase.fixture';

const svc = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

const PASSWORD = 'Policy-Test-1!';
const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdUsers: string[] = [];
const createdSchools: string[] = [];

type User = { id: string; email: string; token: string };

async function createUser(email: string): Promise<User> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: svc,
        body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`createUser failed: ${res.status} ${await res.text()}`);
    const { id } = (await res.json()) as { id: string };
    createdUsers.push(id);
    const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
    return { id, email, token: ((await login.json()) as { access_token: string }).access_token };
}

const asUser = (u: User) => ({
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${u.token}`,
});

async function svcInsert(table: string, body: unknown): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`insert ${table} failed: ${res.status} ${await res.text()}`);
}

async function createSchool(members: User[]): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/schools`, {
        method: 'POST',
        headers: { ...svc, Prefer: 'return=representation' },
        body: JSON.stringify({ name: `Policy School ${uniq()}`, created_by: members[0].id }),
    });
    const [{ id }] = (await res.json()) as { id: string }[];
    createdSchools.push(id);
    for (const m of members) {
        await svcInsert('school_members', { school_id: id, profile_id: m.id });
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${m.id}`, {
            method: 'PATCH',
            headers: svc,
            body: JSON.stringify({ school_id: id }),
        });
    }
    return id;
}

async function visibleProfileIds(u: User, ids: string[]): Promise<string[]> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id`, {
        headers: asUser(u),
    });
    expect(res.ok).toBe(true);
    return ((await res.json()) as { id: string }[]).map((r) => r.id);
}

async function lookup(u: User, email: string): Promise<Response> {
    return fetch(`${SUPABASE_URL}/rest/v1/rpc/find_profile_by_email`, {
        method: 'POST',
        headers: asUser(u),
        body: JSON.stringify({ p_email: email }),
    });
}

async function writeGrade(u: User, studentId: string, extra: Record<string, unknown> = {}): Promise<Response> {
    const id = `sr-${uniq()}`;
    return fetch(`${SUPABASE_URL}/rest/v1/student_rubrics`, {
        method: 'POST',
        headers: { ...asUser(u), Prefer: 'return=minimal' },
        body: JSON.stringify({
            id,
            grader_id: u.id,
            rubric_id: 'r-policy',
            student_id: studentId,
            is_peer_review: false,
            data: { id },
            ...extra,
        }),
    });
}

let teacherA: User;
let teacherA2: User;
let teacherB: User;
let viewerA: User;
let student: User;
let admin: User;
let classId: string;
let studentId: string;

test.describe('migration 077 profile scope and grade write check', () => {
    test.describe.configure({ mode: 'default' });

    test.beforeAll(async () => {
        // The first profile in an empty stack becomes admin; take that slot with a throwaway user.
        await createUser(`policy-seed-${uniq()}@example.com`);
        teacherA = await createUser(`policy-a-${uniq()}@example.com`);
        teacherA2 = await createUser(`policy-a2-${uniq()}@example.com`);
        viewerA = await createUser(`policy-viewer-${uniq()}@example.com`);
        teacherB = await createUser(`policy-b-${uniq()}@example.com`);
        admin = await createUser(`policy-admin-${uniq()}@example.com`);
        promoteToAdmin(admin.email);

        classId = `c-${uniq()}`;
        studentId = `s-${uniq()}`;
        const studentEmail = `policy-pupil-${uniq()}@example.com`;
        await svcInsert('classes', { id: classId, owner_id: teacherA.id, data: { id: classId, name: 'Policy' } });
        await svcInsert('students', {
            id: studentId,
            owner_id: teacherA.id,
            class_id: classId,
            data: { id: studentId, classId, name: 'Pupil', email: studentEmail },
        });
        student = await createUser(studentEmail);

        await createSchool([teacherA, teacherA2, viewerA, student]);
        await createSchool([teacherB]);
    });

    test.afterAll(async () => {
        for (const id of createdUsers) {
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: svc });
        }
        for (const id of createdSchools) {
            await fetch(`${SUPABASE_URL}/rest/v1/schools?id=eq.${id}`, { method: 'DELETE', headers: svc });
        }
        await fetch(`${SUPABASE_URL}/rest/v1/classes?id=eq.${classId}`, { method: 'DELETE', headers: svc });
        await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${studentId}`, { method: 'DELETE', headers: svc });
    });

    test('a teacher sees same-school teachers but not other schools or students', async () => {
        const seen = await visibleProfileIds(teacherA, [teacherA.id, teacherA2.id, teacherB.id, student.id]);
        expect(seen.sort()).toEqual([teacherA.id, teacherA2.id].sort());
    });

    test('an admin sees every profile', async () => {
        const all = [teacherA.id, teacherA2.id, teacherB.id, student.id];
        expect((await visibleProfileIds(admin, all)).sort()).toEqual([...all].sort());
    });

    test('a student only sees their own profile', async () => {
        expect(await visibleProfileIds(student, [teacherA.id, student.id])).toEqual([student.id]);
    });

    test('email lookup finds a teacher in another school and returns only id and name', async () => {
        const res = await lookup(teacherA, `  ${teacherB.email.toUpperCase()} `);
        expect(res.ok).toBe(true);
        const rows = (await res.json()) as Record<string, unknown>[];
        expect(rows).toHaveLength(1);
        expect(Object.keys(rows[0]).sort()).toEqual(['display_name', 'id']);
        expect(rows[0].id).toBe(teacherB.id);
    });

    test('email lookup does not return student accounts', async () => {
        const res = await lookup(teacherA, student.email);
        expect(res.ok).toBe(true);
        expect(await res.json()).toEqual([]);
    });

    test('email lookup is refused for student callers', async () => {
        expect((await lookup(student, teacherA.email)).ok).toBe(false);
    });

    test('email lookup is capped per caller', async () => {
        const caller = await createUser(`policy-cap-${uniq()}@example.com`);
        for (let i = 0; i < 30; i++) expect((await lookup(caller, `nobody-${i}@example.com`)).ok).toBe(true);
        expect((await lookup(caller, 'one-more@example.com')).ok).toBe(false);
    });

    test('sharing a rubric makes the colleague profile readable across schools', async () => {
        const rubricId = `r-${uniq()}`;
        await svcInsert('rubrics', { id: rubricId, owner_id: teacherA.id, data: { id: rubricId, name: 'Shared' } });
        const share = await fetch(`${SUPABASE_URL}/rest/v1/rubric_shares`, {
            method: 'POST',
            headers: { ...asUser(teacherA), Prefer: 'return=minimal' },
            body: JSON.stringify({ rubric_id: rubricId, user_id: teacherB.id, mode: 'read' }),
        });
        expect(share.ok).toBe(true);
        expect(await visibleProfileIds(teacherA, [teacherB.id])).toEqual([teacherB.id]);
        expect(await visibleProfileIds(teacherB, [teacherA.id])).toEqual([teacherA.id]);
        await fetch(`${SUPABASE_URL}/rest/v1/rubrics?id=eq.${rubricId}`, { method: 'DELETE', headers: svc });
    });

    test('the student owner can write a grade row', async () => {
        expect((await writeGrade(teacherA, studentId)).ok).toBe(true);
    });

    test("a teacher cannot write a grade row for another teacher's student", async () => {
        const res = await writeGrade(teacherB, studentId);
        expect(res.ok).toBe(false);
        expect((await writeGrade(teacherB, studentId, { is_peer_review: true })).ok).toBe(false);
    });

    test('a class editor can write grade rows, a viewer cannot', async () => {
        for (const [u, role] of [
            [teacherA2, 'editor'],
            [viewerA, 'viewer'],
        ] as const) {
            const add = await fetch(`${SUPABASE_URL}/rest/v1/class_members`, {
                method: 'POST',
                headers: { ...asUser(teacherA), Prefer: 'return=minimal' },
                body: JSON.stringify({ class_id: classId, user_id: u.id, role }),
            });
            expect(add.ok).toBe(true);
        }
        expect((await writeGrade(teacherA2, studentId)).ok).toBe(true);
        expect((await writeGrade(viewerA, studentId)).ok).toBe(false);
    });

    test('a student account cannot write grade rows, even for itself', async () => {
        expect((await writeGrade(student, studentId)).ok).toBe(false);
    });

    test("the portal shows the owner's grades but not rows from unrelated graders", async () => {
        const own = `sr-own-${uniq()}`;
        const foreign = `sr-foreign-${uniq()}`;
        await svcInsert('student_rubrics', [
            {
                id: own,
                grader_id: teacherA.id,
                rubric_id: 'r-policy',
                student_id: studentId,
                is_peer_review: false,
                data: { id: own },
            },
            {
                id: foreign,
                grader_id: teacherB.id,
                rubric_id: 'r-policy',
                student_id: studentId,
                is_peer_review: false,
                data: { id: foreign },
            },
        ]);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/student_rubrics?id=in.(${own},${foreign})&select=id`, {
            headers: asUser(student),
        });
        expect(res.ok).toBe(true);
        expect(((await res.json()) as { id: string }[]).map((r) => r.id)).toEqual([own]);
    });
});
