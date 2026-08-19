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
        // The Safe Exam Browser user agent makes seb_status broadcast true at mount,
        // so the teacher's monitor must show the SEB proctoring badge.
        const studentContext = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 SEB 3.2.0',
        });
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

            // Live answers stream to the teacher's monitor via the ~5s snapshot
            // broadcast. The ResponsesGrid cells only render status dots — the raw
            // answer text is shown in the per-question gallery dialog (opened by
            // clicking the question header), so assert it there.
            await studentTestPage.fillShortAnswer('4');
            await supabasePage.getByRole('button', { name: 'What is 2 + 2?' }).click();
            await expect(supabasePage.getByRole('dialog').getByText('4', { exact: true })).toBeVisible({
                timeout: 20_000,
            });

            // Proctoring clipboard flag: a copy on the student side reaches the teacher
            // as a "1 copy/paste" badge on the shared Realtime channel.
            await studentPage.evaluate(() => document.dispatchEvent(new Event('copy')));
            await expect(supabasePage.getByText(/1 copy\/paste/i)).toBeVisible({ timeout: 15_000 });

            // SEB detection: the seb_status broadcast (pushed at mount, buffered until
            // the channel joins) marks the student as running inside Safe Exam Browser —
            // the teacher's monitor shows the SEB badge.
            await expect(supabasePage.getByText('SEB', { exact: true })).toBeVisible({ timeout: 15_000 });
        } finally {
            await studentContext.close();
        }
    });

    test('a student handing in a quiz mid-session flips the monitor to Submitted in real time', async ({
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
            name: 'DB Monitor Submit Quiz',
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
        await insertRow('test_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            test_id: rmTest.id,
            student_id: student.id,
            test_name: rmTest.name,
            require_seb: false,
        });

        // Teacher: open the live monitor BEFORE the hand-in.
        await supabasePage.goto(`http://localhost:5173/#/tests/${rmTest.id}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText(`Live monitor — ${rmTest.name}`)).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Student').first()).toBeVisible({ timeout: 15_000 });
        // Nothing handed in yet — no Submitted badge before the student submits.
        await expect(supabasePage.getByLabel('Submitted')).not.toBeVisible();

        // Student: open the share link in a separate, anonymous context and answer.
        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
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

            // ── SIMULTANEOUS: the student hands in while the teacher watches ───
            // The 'submitted' broadcast fires just before telemetry tears down,
            // so the teacher's monitor flips to Submitted with no reload/polling.
            await studentTestPage.fillShortAnswer('4');
            await studentTestPage.submit();

            await expect(studentTestPage.submittedConfirmation()).toBeVisible({ timeout: 15_000 });
            await expect(supabasePage.getByLabel('Submitted').first()).toBeVisible({ timeout: 15_000 });

            // The student page locks after a DB submit — the answer inputs and
            // the submit control are gone, only the confirmation remains (the
            // test-kind mirror of the essay page's locked editor).
            await expect(studentTestPage.submitButton()).not.toBeVisible();
            await expect(studentPage.getByPlaceholder(/type your answer/i)).not.toBeVisible();

            // The online submission actually persisted (submit-test wrote the row).
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/student_tests?assignment_id=eq.${teacherKey}&select=id,data`,
                { headers: adminHeaders }
            );
            expect(res.ok).toBeTruthy();
            const rows = (await res.json()) as { id: string; data: { status: string } }[];
            expect(rows).toHaveLength(1);
            expect(rows[0].data.status).toBe('submitted');
        } finally {
            await studentContext.close();
        }
    });

    test('the monitor shows Submitted when the teacher opens it after the student already submitted (persisted path, no broadcast)', async ({
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
            name: 'DB Monitor Persisted Quiz',
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
        await insertRow('test_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            test_id: rmTest.id,
            student_id: student.id,
            test_name: rmTest.name,
            require_seb: false,
        });

        // ── Student: submit BEFORE the teacher ever opens the monitor ──────────
        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
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

            await studentTestPage.fillShortAnswer('4');
            await studentTestPage.submit();
            await expect(studentTestPage.submittedConfirmation()).toBeVisible({ timeout: 15_000 });
        } finally {
            // Close the student tab — no live channel remains, so the monitor below
            // cannot learn about the hand-in from a 'submitted' broadcast. The
            // Submitted state must come from the persisted student_tests row that
            // AppContext hydrates on load.
            await studentContext.close();
        }

        // ── Teacher: open the monitor after the fact ─────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/tests/${rmTest.id}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText(`Live monitor — ${rmTest.name}`)).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Student').first()).toBeVisible({ timeout: 15_000 });
        // No student tab is open — this is the persisted-submission path (the
        // student_tests row's status), not the live broadcast path.
        await expect(supabasePage.getByLabel('Submitted').first()).toBeVisible({ timeout: 15_000 });

        // ── The same persisted student_tests row drives the results surface ─────
        // Open the test list: the card shows the submitted count, and the Results
        // panel lists the attempt — with no student tab anywhere.
        await supabasePage.goto('http://localhost:5173/#/tests');
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('1 submitted', { exact: true }).first()).toBeVisible({ timeout: 10_000 }); // Expand the Results panel — the student's attempt row is listed (the
        // button is only enabled once a student_tests row exists).
        await supabasePage
            .getByRole('button', { name: /results/i })
            .first()
            .click();
        await expect(supabasePage.getByText('Monitor Student', { exact: true }).first()).toBeVisible({
            timeout: 10_000,
        });
    });

    test('a teacher nudging a student mid-session shows the check-in banner on the student screen', async ({
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
            name: 'DB Monitor Nudge Quiz',
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
        await insertRow('test_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            test_id: rmTest.id,
            student_id: student.id,
            test_name: rmTest.name,
            require_seb: false,
        });

        // Teacher: open the live monitor so the session channel is subscribed.
        await supabasePage.goto(`http://localhost:5173/#/tests/${rmTest.id}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText(`Live monitor — ${rmTest.name}`)).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Student').first()).toBeVisible({ timeout: 15_000 });

        // Student: connect so the session channel is live.
        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
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

            // Wait until the student's session channel is actually live — the
            // live-monitoring disclosure only renders once the telemetry hook
            // reports SUBSCRIBED, so the nudge can't be sent before the student
            // is ready to receive it.
            await expect(studentPage.getByText(/can see your work live while you take this test/i)).toBeVisible({
                timeout: 15_000,
            });

            // Teacher-side readiness: the row only shows "Active" once the
            // teacher's channel has received the student's join heartbeat — i.e.
            // BOTH sides are subscribed on the shared channel, so the nudge is
            // guaranteed to arrive (a broadcast sent before the teacher's channel
            // finished joining is silently dropped). Exact match — the sort
            // select's "Active first" option also contains the substring.
            await expect(supabasePage.getByText('Active', { exact: true }).first()).toBeVisible({
                timeout: 15_000,
            });

            // Teacher sends the check-in nudge on the shared Realtime channel.
            await supabasePage.getByRole('button', { name: 'Nudge' }).click();

            // The student's screen shows the live check-in banner (a toast with
            // role="alert") within its ~4s lifetime.
            await expect(studentPage.getByRole('alert').getByText(/check in/i)).toBeVisible({ timeout: 5_000 });
        } finally {
            await studentContext.close();
        }
    });

    test('a submission after the test due date shows the Late badge on the monitor (persisted path)', async ({
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
            name: 'DB Monitor Late Quiz',
            questions: [{ id: 'q1', prompt: 'What is 2 + 2?', type: 'short-answer', points: 2, expectedAnswer: '4' }],
            requireSEB: false,
            shuffleQuestions: false,
            // Soft deadline in the past: the hand-in succeeds (the assignment has no
            // expires_at) but the monitor must flag it Late.
            dueDate: new Date(Date.now() - 60_000).toISOString(),
            createdAt: new Date().toISOString(),
        };
        const teacherKey = `monitor-assignment-${runId}`;

        await Promise.all([
            insertRow('classes', { id: cls.id, owner_id: ownerId, data: cls }),
            insertRow('students', { id: student.id, owner_id: ownerId, class_id: student.classId, data: student }),
            insertRow('tests', { id: rmTest.id, owner_id: ownerId, data: rmTest }),
        ]);
        await insertRow('test_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            test_id: rmTest.id,
            student_id: student.id,
            test_name: rmTest.name,
            require_seb: false,
        });

        // Student submits before the teacher opens the monitor.
        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
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
            await studentTestPage.fillShortAnswer('4');
            await studentTestPage.submit();
            await expect(studentTestPage.submittedConfirmation()).toBeVisible({ timeout: 15_000 });
        } finally {
            await studentContext.close();
        }

        // Teacher: the monitor derives 'late' from the persisted student_tests row
        // (submittedAt after dueDate) — no live session involved.
        await supabasePage.goto(`http://localhost:5173/#/tests/${rmTest.id}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText(`Live monitor — ${rmTest.name}`)).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Student').first()).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByLabel('Late')).toBeVisible({ timeout: 15_000 });
    });

    test('practice mode allows a retake — the second hand-in gets attempt number 2', async ({
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
            name: 'DB Practice Retake Quiz',
            questions: [{ id: 'q1', prompt: 'What is 2 + 2?', type: 'short-answer', points: 2, expectedAnswer: '4' }],
            requireSEB: false,
            shuffleQuestions: false,
            allowMultipleAttempts: true,
            createdAt: new Date().toISOString(),
        };
        const teacherKey = `monitor-assignment-${runId}`;

        await Promise.all([
            insertRow('classes', { id: cls.id, owner_id: ownerId, data: cls }),
            insertRow('students', { id: student.id, owner_id: ownerId, class_id: student.classId, data: student }),
            insertRow('tests', { id: rmTest.id, owner_id: ownerId, data: rmTest }),
        ]);
        await insertRow('test_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            test_id: rmTest.id,
            student_id: student.id,
            test_name: rmTest.name,
            require_seb: false,
            mode: 'practice',
        });

        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
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

            // ── Attempt 1 ──────────────────────────────────────────────────────
            await studentTestPage.fillShortAnswer('4');
            await studentTestPage.submit();
            await expect(studentTestPage.submittedConfirmation()).toBeVisible({ timeout: 15_000 });

            // Practice mode offers a retake from the confirmation screen.
            await studentPage.getByRole('button', { name: /take again/i }).click();
            await expect(studentTestPage.submitButton()).toBeVisible({ timeout: 10_000 });

            // ── Attempt 2 ──────────────────────────────────────────────────────
            await studentTestPage.fillShortAnswer('4');
            await studentTestPage.submit();
            await expect(studentTestPage.submittedConfirmation()).toBeVisible({ timeout: 15_000 });

            // Server-side: exactly two rows with attempt numbers 1 and 2 — the
            // submit-test practice branch counted the first row and bumped the attempt.
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/student_tests?assignment_id=eq.${teacherKey}&select=id,data`,
                { headers: adminHeaders }
            );
            expect(res.ok).toBeTruthy();
            const rows = (await res.json()) as { id: string; data: { attemptNumber: number } }[];
            expect(rows).toHaveLength(2);
            expect(rows.map((r) => r.data.attemptNumber).sort((a, b) => a - b)).toEqual([1, 2]);

            // The teacher's results panel lists the second attempt with its label.
            await supabasePage.goto('http://localhost:5173/#/tests');
            await supabasePage.reload();
            await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
            await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
            await supabasePage
                .getByRole('button', { name: /results/i })
                .first()
                .click();
            await expect(supabasePage.getByText('(Attempt 2)')).toBeVisible({ timeout: 10_000 });
        } finally {
            await studentContext.close();
        }
    });
});
