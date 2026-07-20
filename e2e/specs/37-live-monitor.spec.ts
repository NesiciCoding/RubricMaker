/**
 * Item 37 — Live monitor Realtime presence/telemetry (teacher side of
 * useLiveSessionTelemetry, test kind).
 *
 * This is the file playwright.config.ts's `supabase` project has referenced
 * since it was written, but it never actually existed — the two Known Issues
 * this closes out were both "written but never verified in this sandbox."
 * Writing it surfaced two real bugs in src/pages/LiveMonitorPage.tsx, both
 * fixed alongside this spec (see AppContext.tsx/SupabaseAdapter.ts/
 * StorageSync.ts's new fetchTestAssignmentTeacherKeys):
 *
 *  1. The Realtime channel name the teacher subscribed to for a 'test' kind
 *     session was guessed as `${testId}:${studentId}`, but StudentTestPage
 *     actually broadcasts on the bare per-student teacherKey (a random
 *     nanoid unrelated to testId/studentId) via useLiveSessionTelemetry — the
 *     channel names never matched, so realtime never connected for tests.
 *  2. `monitorStudents` for 'test' kind was built entirely from persisted
 *     `student_tests` rows, which only exist after final submit (see
 *     supabase/functions/submit-test/index.ts) — an in-progress student who
 *     hadn't submitted yet never appeared in the list at all, so there was
 *     nothing to subscribe a channel for even with fix #1 in place.
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import { test, expect, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { StudentTestPage } from '../pages/StudentTestPage';
import type { Test as RmTest } from '../../src/types';

const adminHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

async function resolveUserId(userEmail: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: adminHeaders,
    });
    if (!res.ok) throw new Error(`Failed to list users: ${res.status} ${await res.text()}`);
    const { users } = (await res.json()) as { users: { id: string; email: string }[] };
    const user = users?.find((u) => u.email === userEmail);
    if (!user) throw new Error(`Test user ${userEmail} not found in Supabase`);
    return user.id;
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`Insert into ${table} failed: ${res.status} ${await res.text()}`);
}

test.describe('Live monitor — test kind', () => {
    test('a student who has opened but not submitted appears live, and their tab-switch reaches the teacher in real time', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const cls = buildClass({ id: `monitor-class-${runId}`, name: 'Monitor Class' });
        const student = buildStudent(cls.id, { id: `monitor-student-${runId}`, name: 'Monitor Student' });
        const rmTest: RmTest = {
            id: `monitor-test-${runId}`,
            name: 'DB Monitor Quiz',
            questions: [{ id: 'q1', prompt: 'What is 2 + 2?', type: 'short-answer', points: 2, expectedAnswer: '4' }],
            requireSEB: false,
            shuffleQuestions: false,
            createdAt: new Date().toISOString(),
        };
        const teacherKey = `monitor-assignment-${runId}`;

        await Promise.all([
            insertRow('classes', { id: cls.id, owner_id: ownerId, data: cls }),
            insertRow('students', { id: student.id, owner_id: ownerId, class_id: student.classId, data: student }),
            insertRow('tests', { id: rmTest.id, owner_id: ownerId, data: rmTest }),
        ]);
        // Mirrors what TestAssignmentModal's handleSaveAllToDb persists once a share link is generated.
        await insertRow('test_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            test_id: rmTest.id,
            student_id: student.id,
            test_name: rmTest.name,
            require_seb: false,
        });

        // Teacher: navigate to the live monitor — a fresh navigation + reload so
        // AppContext re-hydrates the test/class/student rows just inserted directly.
        await supabasePage.goto(`http://localhost:5173/#/tests/${rmTest.id}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        // Topbar renders its title as a plain <span>, not a heading role.
        await expect(supabasePage.getByText(`Live monitor — ${rmTest.name}`)).toBeVisible({
            timeout: 15_000,
        });

        // Bug #2 fixed: the assigned-but-not-yet-submitted student shows up at all
        // (rendered both in the presence row and the answers grid — just check one exists).
        await expect(supabasePage.getByText('Monitor Student').first()).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('tests.monitor.no_students')).not.toBeVisible();

        // Student: open the share link in a separate, unauthenticated browser context
        // (mirrors a real share-link recipient — anonymous sign-in via TestAdapter).
        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
            // A DB-mode share code is just the bare teacherKey (encodeTestAssignment
            // in src/utils/shareCode.ts) — StudentTestPage resolves which Supabase
            // project to talk to from rm_supabase_config in localStorage (or env
            // vars), not from the code itself. A fresh, unauthenticated context has
            // neither, so seed it the same way the magic-link sign-in flow does.
            await studentPage.addInitScript(
                ({ url, key }: { url: string; key: string }) => {
                    localStorage.setItem(
                        'rm_supabase_config',
                        JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })
                    );
                },
                { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
            );
            const studentTestPage = new StudentTestPage(studentPage);
            await studentTestPage.goto(teacherKey);
            await expect(studentTestPage.testTitle(rmTest.name)).toBeVisible({ timeout: 15_000 });

            // Bug #1 fixed: this broadcasts on the teacherKey channel, which the teacher
            // is now actually subscribed to (previously a channel-name mismatch, so this
            // event would silently vanish).
            await studentTestPage.triggerTabSwitch();

            await expect(supabasePage.getByText(/1 tab switch/i)).toBeVisible({ timeout: 15_000 });
        } finally {
            await studentContext.close();
        }
    });
});
