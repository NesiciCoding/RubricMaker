/**
 * Live writing loop (#1153) — teacher console, projector and joined student screen in one run.
 *
 * The loop is a two-actor protocol: the console mints a short code, an anonymous student screen
 * joins with it, and every later step is gated on the other side having acted (hand-in before the
 * self-check, self-check before peer voting, voting closed before the finals hand-off). Two browser
 * contexts drive both actors against `liveWritingBackend`, an in-process fake of the RPC/table
 * surface the pages call, so the spec runs in every PR without a local Supabase stack.
 *
 * What this does not cover: RLS, the SECURITY DEFINER RPC bodies and the SQL state machine. Those
 * belong to the migration tests and the stack-backed specs that need `npm run db:start`.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { APP_ORIGIN } from '../appUrl';
import { buildA11ySeed } from '../fixtures/a11y.fixture';
import {
    createLiveWritingBackend,
    seedLiveWritingApp,
    studentJoinStorage,
    type LiveWritingBackend,
} from '../fixtures/liveWritingBackend';
import { LiveWritingConsolePage } from '../pages/LiveWritingConsolePage';
import { LiveWritingProjectorPage } from '../pages/LiveWritingProjectorPage';
import { LiveWritingStudentPage } from '../pages/LiveWritingStudentPage';

const STUDENT_NAME = 'Aiko Tanaka';

/** The a11y seed doubles as a complete local snapshot: a class to pick and rubrics to hand off to. */
function teacherSeed(): Record<string, unknown> {
    const seed = buildA11ySeed('light') as unknown as Record<string, unknown>;
    seed.rm_local_mode = false;
    return seed;
}

/**
 * The projector is a second device in the room, so it gets its own context: the app keeps a
 * single-tab lock per origin, which a tab in the teacher's context would trip.
 */
async function openProjector(context: BrowserContext, backend: LiveWritingBackend): Promise<LiveWritingProjectorPage> {
    const page = await context.newPage();
    await backend.install(page);
    await seedLiveWritingApp(page, { localStorage: teacherSeed() });
    const projector = new LiveWritingProjectorPage(page);
    await projector.open(backend.sessionId);
    return projector;
}

async function openStudent(
    context: BrowserContext,
    backend: LiveWritingBackend,
    options: { resume?: boolean } = {}
): Promise<LiveWritingStudentPage> {
    const page = await context.newPage();
    await backend.install(page);
    await seedLiveWritingApp(page, {
        localStorage: { rm_local_mode: false },
        sessionStorage: options.resume ? studentJoinStorage(backend.joinCode, backend) : undefined,
    });
    return new LiveWritingStudentPage(page);
}

test.describe('live writing session', () => {
    test.setTimeout(150_000);

    test('runs create → project → join → write → hand in → self-check → vote → finals → grading', async ({
        page,
        browser,
    }) => {
        const backend = createLiveWritingBackend();
        await backend.install(page);
        await seedLiveWritingApp(page, { localStorage: teacherSeed() });

        const consolePage = new LiveWritingConsolePage(page);
        await consolePage.openNew();
        await consolePage.fillDraft({
            title: 'My perfect weekend',
            prompt: 'Describe what your perfect weekend would look like.',
        });
        await consolePage.saveDraft();
        await consolePage.expectJoinCode(backend.joinCode);
        await consolePage.openLobby();

        const studentContext = await browser.newContext();
        const projectorContext = await browser.newContext();
        try {
            const student = await openStudent(studentContext, backend);
            await student.openJoin();
            await student.submitCode(backend.joinCode);
            await student.pickName(STUDENT_NAME);
            await student.expectWaiting();

            const projector = await openProjector(projectorContext, backend);
            await projector.expectJoined(STUDENT_NAME);
            await projector.startWriting();

            await student.write('My perfect weekend starts with a long walk before breakfast.');
            await student.handIn();
            await student.selfCheck('I want a clearer ending.');

            await projector.endWriting();
            await student.vote();

            await projector.endSession();
            await student.expectClosed();

            // The console only re-reads the session on mount, so a reload is what shows `closed`.
            await page.reload();
            await expect(page.getByRole('heading', { name: /Finals · round 1/ })).toBeVisible({ timeout: 20_000 });
            await expect(page.locator('#live-finals-rubric')).not.toHaveValue('');
            await page.getByRole('button', { name: 'Send to grading' }).first().click();
            // The card's button switches from "Send to grading" to "Sent" once the hand-off lands.
            await expect(page.getByRole('button', { name: 'Sent', exact: true }).first()).toBeVisible({
                timeout: 20_000,
            });
            expect(backend.participant.gradingSubmissionId).not.toBeNull();
        } finally {
            await studentContext.close();
            await projectorContext.close();
        }
    });

    test('resumes the student draft after a reload', async ({ page, browser }) => {
        const backend = createLiveWritingBackend({ status: 'writing' });
        await backend.install(page);

        const studentContext = await browser.newContext();
        try {
            const student = await openStudent(studentContext, backend, { resume: true });
            await student.page.goto(`${APP_ORIGIN}/#/join/${backend.joinCode}`);
            await student.page.locator('.essay-editor-content, .ProseMirror').first().waitFor({ timeout: 20_000 });

            const draft = 'The best weekend begins with coffee and no alarm.';
            await student.write(draft);
            // Autosave is debounced; the state poll is what proves the server kept it.
            await expect.poll(() => backend.participant.contentHtml, { timeout: 20_000 }).toContain('coffee');

            await student.page.reload();
            await student.expectEditorText('coffee and no alarm');
        } finally {
            await studentContext.close();
        }
    });

    test('rejects a code that is not active', async ({ page, browser }) => {
        const backend = createLiveWritingBackend({ status: 'lobby' });
        await backend.install(page);

        const studentContext = await browser.newContext();
        try {
            const student = await openStudent(studentContext, backend);
            await student.openJoin();
            await student.submitCode('RM-ZZZZZZ');
            await student.expectError('That code is not active. Check the board and try again.');
        } finally {
            await studentContext.close();
        }
    });
});
