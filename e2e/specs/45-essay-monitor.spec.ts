/**
 * Item 45 — Live monitor Realtime telemetry for the ESSAY kind (teacher side
 * of useLiveSessionTelemetry). The essay/test workflow and the monitoring
 * workflow run SIMULTANEOUSLY: the student is writing the essay in a separate
 * anonymous browser context while the teacher watches the live monitor update
 * in real time — live word count, the expandable draft preview, presence, and
 * the tab-switch proctoring flag.
 *
 * This is the essay counterpart to 37-live-monitor.spec.ts (test kind). The
 * essay monitor subscribes to `monitor:essay:{teacherKey}:{studentId}`, which
 * matches exactly what StudentEssayPage broadcasts on (see
 * src/pages/StudentEssayPage.tsx useLiveSessionTelemetry wiring).
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import { test, expect, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { StudentEssayPage } from '../pages/StudentEssayPage';
import type { Browser } from '@playwright/test';

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

/**
 * Seed a class + student + essay_assignments row for one monitor test, mirroring
 * what EssayAssignmentModal's "Save to DB" persists. The essay_assignments row id
 * IS the teacherKey (the student's share code and the /essays/:assignmentId/monitor
 * route param). Kept ≤ 40 chars: StudentEssayPage treats longer strings as legacy
 * (non-short-code) links and rejects them as invalid.
 */
async function seedEssayAssignment(ownerId: string, runId: string, title: string) {
    const cls = buildClass({ id: `monitor-essay-class-${runId}`, name: 'Monitor Essay Class' });
    const student = buildStudent(cls.id, {
        id: `monitor-essay-student-${runId}`,
        name: 'Monitor Essay Student',
    });
    const teacherKey = `essmon${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await Promise.all([
        insertRow('classes', { id: cls.id, owner_id: ownerId, data: cls }),
        insertRow('students', { id: student.id, owner_id: ownerId, class_id: student.classId, data: student }),
        insertRow('essay_assignments', {
            id: teacherKey,
            owner_id: ownerId,
            rubric_id: `monitor-essay-rubric-${runId}`,
            student_id: student.id,
            title,
        }),
        // The teacher-side roster (EssayBuilderPage) hydrates assignments from
        // essay_batch_assignments (id = `${teacherKey}:${studentId}`), NOT from
        // essay_assignments — mirror what EssayAssignmentModal's "Save to DB"
        // persists so the builder/list pages can render the roster for this
        // assignment.
        insertRow('essay_batch_assignments', {
            id: `${teacherKey}:${student.id}`,
            owner_id: ownerId,
            data: {
                teacherKey,
                studentId: student.id,
                rubricId: `monitor-essay-rubric-${runId}`,
                title,
                prompt: null,
                readOnlyAfterSubmit: true,
                createdAt: new Date().toISOString(),
            },
        }),
    ]);
    return { teacherKey, student };
}

/**
 * Open the essay share link in a fresh, anonymous browser context (mirrors a real
 * share-link recipient — no teacher session) and pass the email gate. A DB-mode
 * share code is just the bare teacherKey — StudentEssayPage resolves which Supabase
 * project to talk to from rm_supabase_config in localStorage (or env vars), not
 * from the code itself, so seed it the same way the magic-link flow does.
 */
async function openStudentEssay(browser: Browser, teacherKey: string, email: string) {
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.addInitScript(
        ({ url, key }: { url: string; key: string }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
        },
        { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
    );
    const essay = new StudentEssayPage(studentPage);
    await essay.goto(teacherKey);
    await expect(essay.emailInput()).toBeVisible({ timeout: 15_000 });
    await essay.fillEmailAndStart(email);
    await expect(essay.editor()).toBeVisible({ timeout: 15_000 });
    return { studentContext, studentPage, essay };
}

test.describe('Live monitor — essay kind', () => {
    test('student writes while the teacher watches live word count, draft preview, presence, and tab switches', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const cls = buildClass({ id: `monitor-essay-class-${runId}`, name: 'Monitor Essay Class' });
        const student = buildStudent(cls.id, {
            id: `monitor-essay-student-${runId}`,
            name: 'Monitor Essay Student',
        });
        // The essay_assignments row id IS the teacherKey (what the student's
        // share code resolves to) and the /essays/:assignmentId/monitor route
        // param — mirrors what EssayAssignmentModal's "Save to DB" persists.
        // Keep it ≤ 40 chars: StudentEssayPage treats longer strings as legacy
        // (non-short-code) links and rejects them as invalid.
        const teacherKey = `essmon${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

        await Promise.all([
            insertRow('classes', { id: cls.id, owner_id: ownerId, data: cls }),
            insertRow('students', { id: student.id, owner_id: ownerId, class_id: student.classId, data: student }),
            insertRow('essay_assignments', {
                id: teacherKey,
                owner_id: ownerId,
                rubric_id: `monitor-essay-rubric-${runId}`,
                student_id: student.id,
                title: 'Live Essay Monitor Draft',
            }),
        ]);

        // ── Teacher: open the live essay monitor ─────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        // Topbar renders its title as a plain <span>, not a heading role.
        await expect(supabasePage.getByText('Live monitor — Live Essay Monitor Draft')).toBeVisible({
            timeout: 15_000,
        });
        // The assigned student shows up immediately (fetchEssayAssignmentByKey +
        // the hydrated students list) — before the student even connects.
        await expect(supabasePage.getByText('Monitor Essay Student').first()).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('No students to monitor yet.')).not.toBeVisible();

        // ── Student: open the essay link in a separate, anonymous context ─────
        const studentContext = await browser.newContext();
        try {
            const studentPage = await studentContext.newPage();
            // A DB-mode share code is just the bare teacherKey — StudentEssayPage
            // resolves which Supabase project to talk to from rm_supabase_config.
            await studentPage.addInitScript(
                ({ url, key }: { url: string; key: string }) => {
                    localStorage.setItem(
                        'rm_supabase_config',
                        JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })
                    );
                },
                { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
            );
            const essay = new StudentEssayPage(studentPage);
            await essay.goto(teacherKey);
            await expect(essay.emailInput()).toBeVisible({ timeout: 15_000 });
            await essay.fillEmailAndStart('monitor.student@school.nl');
            await expect(essay.editor()).toBeVisible({ timeout: 15_000 });

            // ── SIMULTANEOUS: student writes while the teacher watches ────────
            // Snapshots broadcast every ~5s (SNAPSHOT_INTERVAL_MS), so the live
            // word count should reach the monitor shortly after typing stops.
            const sentence = 'The autumn leaves fell gently on the quiet lane while students walked home.';
            await essay.typeInEditor(sentence);
            await expect(supabasePage.getByText('13 words')).toBeVisible({ timeout: 25_000 });

            // Expand the draft preview on the teacher side and verify the live
            // draft text arrived (stripped of markup by LiveDraftPanel).
            await supabasePage.getByRole('button', { name: 'Toggle draft preview' }).click();
            await expect(supabasePage.getByText(/the autumn leaves fell gently/i)).toBeVisible({ timeout: 10_000 });

            // Proctoring: a tab switch on the student side reaches the teacher
            // in real time on the shared Realtime channel.
            await essay.triggerTabSwitch();
            await expect(supabasePage.getByText(/1 tab switch/i)).toBeVisible({ timeout: 15_000 });

            // Proctoring clipboard flag: a copy on the student side reaches the
            // teacher as a "1 copy/paste" badge (same flags path as tests).
            await studentPage.evaluate(() => document.dispatchEvent(new Event('copy')));
            await expect(supabasePage.getByText(/1 copy\/paste/i)).toBeVisible({ timeout: 15_000 });

            // Presence: the first heartbeat (~20s after the session starts)
            // marks the student Active on the monitor. Exact match — the sort
            // select's "Active first" option also contains the substring.
            await expect(supabasePage.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 35_000 });
        } finally {
            await studentContext.close();
        }
    });

    test('a student submitting mid-session flips the monitor to Submitted in real time and locks their editor', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { teacherKey, student } = await seedEssayAssignment(ownerId, runId, 'Live Essay Submit');

        // ── Teacher: open the live essay monitor ────────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('Live monitor — Live Essay Submit')).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText(student.name).first()).toBeVisible({ timeout: 15_000 });
        // Nothing submitted yet — no Submitted badge before the hand-in.
        await expect(supabasePage.getByLabel('Submitted')).not.toBeVisible();

        // ── Student: connect and write while the teacher watches ───────────────
        const { studentContext, studentPage, essay } = await openStudentEssay(
            browser,
            teacherKey,
            'monitor.submit@school.nl'
        );
        try {
            const sentence =
                'The tide came in slowly covering the sandbars where the gulls had been resting all morning.';
            await essay.typeInEditor(sentence);
            // Proves the live channel is up before the hand-in (snapshots every ~5s).
            await expect(supabasePage.getByText('16 words')).toBeVisible({ timeout: 25_000 });

            // ── SIMULTANEOUS: student hands in while the teacher watches ────────
            await essay.submitButton().click();

            // Student side: DB-mode confirmation, the backup code, and the editor
            // locks (readOnlyAfterSubmit defaults true on essay_assignments).
            await expect(essay.submittedConfirmation()).toBeVisible({ timeout: 15_000 });
            await expect(essay.submissionCodeArea()).toBeVisible({ timeout: 5_000 });
            await expect(essay.lockedEditor()).toBeVisible({ timeout: 5_000 });
            await expect(essay.submitButton()).not.toBeVisible();

            // Teacher side: the monitor flips to Submitted via the student's live
            // 'submitted' broadcast — no reload, no polling.
            await expect(supabasePage.getByLabel('Submitted').first()).toBeVisible({ timeout: 15_000 });

            // The online submission actually persisted (submit-essay edge function
            // wrote the row + storage object) — what the assignment roster shows.
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/essay_submissions?assignment_id=eq.${teacherKey}&select=id,word_count`,
                { headers: adminHeaders }
            );
            expect(res.ok).toBeTruthy();
            const rows = (await res.json()) as { id: string; word_count: number }[];
            expect(rows).toHaveLength(1);
            expect(rows[0].word_count).toBe(16);
        } finally {
            await studentContext.close();
        }
    });

    test('a teacher nudging a student mid-session shows the check-in banner on the student screen', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { teacherKey } = await seedEssayAssignment(ownerId, runId, 'Live Essay Nudge');

        // ── Teacher: open the live essay monitor ────────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('Live monitor — Live Essay Nudge')).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Essay Student').first()).toBeVisible({ timeout: 15_000 });

        // ── Student: connect so the session channel is live ─────────────────────
        const { studentContext, studentPage } = await openStudentEssay(browser, teacherKey, 'monitor.nudge@school.nl');
        try {
            // Wait until the student's session channel is actually live — the
            // live-monitoring disclosure only renders once the telemetry hook
            // reports SUBSCRIBED, so the nudge can't be sent before the student
            // is ready to receive it.
            await expect(studentPage.getByText(/can see your work live while you take this essay/i)).toBeVisible({
                timeout: 15_000,
            });

            // Teacher-side readiness: the row only shows "Active" once the
            // teacher's channel has received the student's join heartbeat — i.e.
            // BOTH sides are subscribed on the shared channel, so the nudge is
            // guaranteed to arrive (a broadcast sent before the teacher's channel
            // finished joining is silently dropped).
            await expect(supabasePage.getByText('Active').first()).toBeVisible({ timeout: 15_000 });

            // Teacher sends the check-in nudge on the shared Realtime channel.
            await supabasePage.getByRole('button', { name: 'Nudge' }).click();

            // The student's screen shows the live check-in banner (a toast with
            // role="alert") within its ~4s lifetime.
            await expect(studentPage.getByRole('alert').getByText(/check in/i)).toBeVisible({ timeout: 5_000 });
        } finally {
            await studentContext.close();
        }
    });

    test('the monitor shows Submitted when the teacher opens it after the student already handed in (persisted path, no broadcast)', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { teacherKey, student } = await seedEssayAssignment(ownerId, runId, 'Live Essay Persisted');

        // ── Student: hand in BEFORE the teacher ever opens the monitor ──────────
        const { studentContext, essay } = await openStudentEssay(browser, teacherKey, 'monitor.persisted@school.nl');
        try {
            await essay.typeInEditor(
                'The harbor lights blinked twice before the ferry finally departed for the mainland.'
            );
            await essay.submitButton().click();
            await expect(essay.submittedConfirmation()).toBeVisible({ timeout: 15_000 });
        } finally {
            // Close the student tab — no live channel remains, so the monitor below
            // cannot learn about the hand-in from a 'submitted' broadcast. The
            // Submitted state must come from the persisted essay_submissions check
            // LiveMonitorPage runs on mount.
            await studentContext.close();
        }

        // ── Teacher: open the monitor after the fact ─────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('Live monitor — Live Essay Persisted')).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Essay Student').first()).toBeVisible({ timeout: 15_000 });
        // No student tab is open — this is the persisted-submission path, not the
        // live broadcast path.
        await expect(supabasePage.getByLabel('Submitted').first()).toBeVisible({ timeout: 15_000 });

        // ── The same persisted row drives the roster surfaces ────────────────────
        // The builder page's roster badge used to stay Pending for online hand-ins:
        // the hydrated essaySubmissions only track offline (pasted-code) imports,
        // so the badge never saw essay_submissions. useOnlineEssaySubmissions fixes
        // that — open the builder for this assignment and the badge must show
        // Submitted with no student tab anywhere.
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText(student.name).first()).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Submitted', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

        // The essay list page shows the same hand-in in its submitted progress (1/1).
        await supabasePage.goto('http://localhost:5173/#/essays');
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('1/1', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    });

    test('presence ages from Active to Idle to Disconnected once heartbeats stop', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        // The first heartbeat needs ~20s of real time; the Idle/Disconnected
        // assertions then wait for the monitor's next 5s tick after each
        // fast-forward, so the default 30s test timeout is too tight.
        test.setTimeout(120_000);
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { teacherKey } = await seedEssayAssignment(ownerId, runId, 'Live Essay Presence');

        // ── Teacher: open the live essay monitor ─────────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('Live monitor — Live Essay Presence')).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Essay Student').first()).toBeVisible({ timeout: 15_000 });

        // ── Student: connect long enough for the first heartbeat ────────────────
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
            const essay = new StudentEssayPage(studentPage);
            await essay.goto(teacherKey);
            await expect(essay.emailInput()).toBeVisible({ timeout: 15_000 });
            await essay.fillEmailAndStart('monitor.presence@school.nl');
            await expect(essay.editor()).toBeVisible({ timeout: 15_000 });

            // First heartbeat (~20s after the session starts) marks the student Active.
            await expect(supabasePage.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 35_000 });
        } finally {
            // Close the tab — no further heartbeats arrive, so the last heartbeat's
            // age grows on the teacher side.
            await studentContext.close();
        }

        // ── Presence aging via the teacher's clock ───────────────────────────────
        // derivePresence (proctorAggregator): active < 40s, idle 40–90s, disconnected
        // ≥ 90s after the last heartbeat. Freeze the teacher's clock and fast-forward
        // past each threshold; the monitor's 5s tick re-derives presence against the
        // emulated now (the tick interval itself was created before install, so it
        // keeps firing on real time — the assertions simply wait for it).
        await supabasePage.clock.install();
        await supabasePage.clock.fastForward(60_000);
        await expect(supabasePage.getByText('Idle', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

        await supabasePage.clock.fastForward(50_000);
        await expect(supabasePage.getByText('Disconnected', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    });

    test('an idle student shows Idle and flips back to Active once activity resumes, while staying connected', async ({
        supabasePage,
        testUserEmail,
        browser,
    }) => {
        // First heartbeat needs ~20s of real time; the idle heartbeat arrives on
        // the next real 20s tick after the clock jump, so the default 30s test
        // timeout is too tight.
        test.setTimeout(120_000);
        const ownerId = await resolveUserId(testUserEmail);
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { teacherKey } = await seedEssayAssignment(ownerId, runId, 'Live Essay Idle');

        // ── Teacher: open the live essay monitor ─────────────────────────────────
        await supabasePage.goto(`http://localhost:5173/#/essays/${teacherKey}/monitor`);
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });
        await expect(supabasePage.getByText('Live monitor — Live Essay Idle')).toBeVisible({ timeout: 15_000 });
        await expect(supabasePage.getByText('Monitor Essay Student').first()).toBeVisible({ timeout: 15_000 });

        // ── Student: start the session and keep the tab OPEN the whole time ─────
        const { studentContext, studentPage, essay } = await openStudentEssay(
            browser,
            teacherKey,
            'monitor.idle@school.nl'
        );
        try {
            // First heartbeat (~20s after the session starts) marks the student Active.
            await expect(supabasePage.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 35_000 });

            // ── Value-driven idle: fake 60s of inactivity on the STUDENT's clock ──
            // The heartbeat interval (created at session start) keeps firing on real
            // time; only Date.now() is emulated now. The next real heartbeat computes
            // `Date.now() - lastActivity >= 60s` → true, so it broadcasts
            // value='idle'. Its `at` is the student's (future-dated) emulated now, so
            // the teacher's age-based branches (idle ≥ 40s, disconnected ≥ 90s) can't
            // trigger — only the value branch maps this fresh heartbeat to Idle.
            await studentPage.clock.install();
            await studentPage.clock.fastForward(60_000);

            await expect(supabasePage.getByText('Idle', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

            // ── Activity resumes: flip back to Active on the same connection ────
            // The window-level pointerdown listener refreshes lastActivityRef with
            // the (emulated) now, so the next real heartbeat computes an age < 60s
            // and broadcasts value='active'. Its `at` is still future-dated, so the
            // teacher's age branches stay untriggerable — Active can only come from
            // the value path, proving the recovery is value-driven too.
            await studentPage.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')));
            await expect(supabasePage.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

            // The student is still connected: the tab is open and the editor is live.
            await expect(essay.editor()).toBeVisible({ timeout: 5_000 });
        } finally {
            await studentContext.close();
        }
    });
});
