/**
 * Item 72 — Live writing end to end (Phase 43.6, #1153).
 *
 * Covers the class loop from the WeWillWrite-style request in #851:
 * teacher creates a session → lobby → projector starts the round → three
 * students join with the code and a roster name → write (one reconnects
 * mid-write) → hand in → self-check → peer vote → teacher shows the finals →
 * send the round to grading.
 *
 * Also pins the invalid-code path. The spec seeds its class/roster through
 * Postgres (`querySql`) because a class with three named students is setup, not
 * the behaviour under test — the live-writing UI is exercised end to end.
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import type { Browser, Page } from '@playwright/test';
import { test, expect, querySql, SUPABASE_URL, SUPABASE_ANON_KEY } from '../fixtures/supabase.fixture';
import { APP_ORIGIN } from '../appUrl';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';

const STUDENTS = ['Ana Live', 'Bram Live', 'Cato Live'];
const CLASS_NAME = 'Live Writing E2E';
const PROMPT = 'Write about a time you changed your mind.';

function seedClassAndStudents(email: string): void {
    const owner = querySql(`SELECT id FROM profiles WHERE email = '${email.replace(/'/g, "''")}'`);
    const stamp = Date.now();
    const classId = `lw-e2e-class-${stamp}`;
    const classData = JSON.stringify({ id: classId, name: CLASS_NAME, year: 'jaar-2' });
    querySql(`INSERT INTO classes (id, owner_id, data) VALUES ('${classId}', '${owner}', '${classData}'::jsonb)`);
    STUDENTS.forEach((name, index) => {
        const id = `lw-e2e-student-${stamp}-${index}`;
        const data = JSON.stringify({ id, name, classId });
        querySql(
            `INSERT INTO students (id, owner_id, class_id, data) VALUES ('${id}', '${owner}', '${classId}', '${data}'::jsonb)`
        );
    });
}

/** A public student screen in its own browser context, configured for the local stack. */
async function joinAsStudent(browser: Browser, name: string, code: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(
        ({ url, key }: { url: string; key: string }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
            localStorage.setItem('rm_migration_done', 'true');
        },
        { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
    );

    await page.goto(`${APP_ORIGIN}/#/join`);
    await page.getByLabel('Join code').fill(code);
    await page.getByRole('button', { name: 'Find my name' }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: "You're in" })).toBeVisible({ timeout: 20_000 });
    return { context, page };
}

async function writeDraft(page: Page, text: string) {
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.fill(text);
    await expect(page.getByText(/Draft saved at/)).toBeVisible({ timeout: 15_000 });
}

async function handInAndSelfCheck(page: Page) {
    await page.getByRole('button', { name: 'Hand in early' }).click();
    await expect(page.getByText('How do you feel about your text?')).toBeVisible({ timeout: 20_000 });
    const group = page.getByRole('group', { name: 'How do you feel about your text?' });
    await group.getByRole('button', { name: "I'm happy with it" }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

async function voteForFirstPair(page: Page) {
    await expect(page.getByText('Which text is stronger?')).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: 'Choose this text' }).first().click();
    await expect(page.getByText('Vote recorded')).toBeVisible({ timeout: 15_000 });
}

test.describe('Live writing', () => {
    test('create → project → join → write → hand in → self-check → vote → finals → grading', async ({
        supabasePage,
        secondSupabasePage,
        testUserEmail,
        browser,
    }) => {
        test.setTimeout(240_000);

        // A rubric so the finals panel can hand the round to the essay pipeline.
        const builder = new RubricBuilderPage(supabasePage);
        await builder.gotoNew();
        await builder.fillName('Live writing rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Content');
        await builder.save();
        await builder.waitForSaved();

        seedClassAndStudents(testUserEmail);
        await supabasePage.goto(`${APP_ORIGIN}/#/live`);
        // Rehydrate so the seeded class is in app state for the class picker.
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 30_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 20_000 });

        await supabasePage.goto(`${APP_ORIGIN}/#/live/new`);
        await supabasePage.locator('#live-title').fill('E2E live write');
        await supabasePage.locator('#live-prompt').fill(PROMPT);
        await supabasePage.locator('#live-class').selectOption({ label: CLASS_NAME });
        await supabasePage.getByRole('button', { name: 'Save draft' }).click();
        await supabasePage.waitForURL((url) => /\/#\/live\/[0-9a-f-]{36}$/.test(url.href), {
            timeout: 20_000,
        });
        const sessionId = supabasePage.url().split('/').pop() as string;
        const joinCode = querySql(`SELECT join_code FROM live_writing_sessions WHERE id = '${sessionId}'`);
        expect(joinCode).toMatch(/^RM-[0-9A-Z]{6}$/);

        await supabasePage.getByRole('button', { name: 'Open lobby' }).click();
        await expect(supabasePage.getByRole('button', { name: 'Open lobby' })).toHaveCount(0);

        const students = [] as Awaited<ReturnType<typeof joinAsStudent>>[];
        for (const name of STUDENTS) {
            students.push(await joinAsStudent(browser, name, joinCode));
        }

        // The projector is a second device signed in as the same teacher.
        await secondSupabasePage.goto(`${APP_ORIGIN}/#/live/${sessionId}/project`);
        await secondSupabasePage.getByRole('button', { name: 'Start writing round' }).click();
        await expect(secondSupabasePage.getByRole('button', { name: 'End writing' })).toBeVisible({
            timeout: 20_000,
        });

        for (const student of students) {
            await writeDraft(student.page, `${PROMPT} I changed my mind after listening to a friend.`);
        }

        // Reconnect mid-write: the hand-in is still possible and the autosaved draft comes back.
        await students[0].page.reload();
        const reconnectedEditor = students[0].page.locator('.ProseMirror[contenteditable="true"]');
        await expect(reconnectedEditor).toBeVisible({ timeout: 25_000 });
        await expect(reconnectedEditor).toContainText('I changed my mind');

        for (const student of students) {
            await handInAndSelfCheck(student.page);
        }

        await secondSupabasePage.getByRole('button', { name: 'End writing' }).click();

        for (const student of students) {
            await voteForFirstPair(student.page);
        }

        // The console polls slowly; reloading makes the voting phase deterministic.
        await supabasePage.reload();
        await supabasePage.getByRole('button', { name: 'Show finals' }).click();
        await expect(supabasePage.getByText('Finals · round 1')).toBeVisible({ timeout: 20_000 });

        await supabasePage.getByLabel('Rubric for grading').selectOption({ label: 'Live writing rubric' });
        await supabasePage.getByRole('button', { name: /Send 3 to grading/ }).click();
        await expect(supabasePage.getByText('All selected texts were sent to grading.')).toBeVisible({
            timeout: 20_000,
        });

        for (const student of students) {
            await student.context.close();
        }
    });

    test('an invalid join code explains itself instead of opening a session', async ({ supabasePage }) => {
        await supabasePage.goto(`${APP_ORIGIN}/#/join/RM-ZZZZZZ`);
        await expect(supabasePage.getByRole('alert')).toContainText(
            'That code is not active. Check the board and try again.',
            { timeout: 20_000 }
        );
    });
});
