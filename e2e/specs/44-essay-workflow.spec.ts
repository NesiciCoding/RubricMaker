/**
 * Essay workflow — full lifecycle end-to-end (offline / no-DB mode).
 *
 * The counterpart to 21-test-environment.spec.ts (which does the same for
 * tests): the teacher builds an essay assignment in EssayBuilderPage, assigns
 * it to a class, the student opens the generated share link in a separate
 * browser context, writes and submits, and the teacher imports the submission
 * code back — the roster badge flips to "Submitted". Also covers the live
 * monitor's offline guard panel (live monitoring needs a database).
 *
 * Stays in offline mode (no Supabase) — see playwright.config.ts, which runs
 * this spec in the default chromium/firefox/webkit projects.
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { readLocalStorage } from '../fixtures/storage.helpers';
import { StudentEssayPage, buildEssayCode } from '../pages/StudentEssayPage';
import { EssayBuilderPage } from '../pages/EssayBuilderPage';
import type { Browser } from '@playwright/test';
import type { EssayAssignment } from '../../src/types';

test.describe('Essay workflow — full lifecycle (offline)', () => {
    test('teacher builds, assigns, student writes and submits, teacher imports the submission', async ({
        appPage,
        seedStorage,
        browser,
    }: {
        appPage: import('@playwright/test').Page;
        seedStorage: (d: Record<string, unknown>) => Promise<void>;
        browser: Browser;
    }) => {
        const klass = buildClass({ id: 'ew-class', name: 'E2E Essay Class' });
        const rubric = buildRubric({ id: 'ew-rubric', name: 'E2E Essay Rubric' });
        const studentA = buildStudent(klass.id, { id: 'ew-student-a', name: 'Ada Essay' });
        const studentB = buildStudent(klass.id, { id: 'ew-student-b', name: 'Bram Essay' });
        await seedStorage({
            rm_classes: [klass],
            rm_rubrics: [rubric],
            rm_students: [studentA, studentB],
        });

        // ── 1. Teacher builds the essay in EssayBuilderPage ─────────────────
        const builder = new EssayBuilderPage(appPage);
        await builder.gotoNew();
        await builder.fillBasics('Climate Change Essay', {
            prompt: 'Write about the impact of climate change on your region.',
            minWords: '20',
            maxWords: '200',
            timeLimit: '45',
        });
        await builder.selectRubric('E2E Essay Rubric');

        // ── 2. Teacher assigns the essay to the class ───────────────────────
        await builder.assignToClass('E2E Essay Class');

        // EssayAssignmentModal opens — the footer's "Assign to students" is the
        // one that persists the fan-out (the builder's trigger is aria-hidden
        // behind the Radix dialog, so target the dialog itself).
        await expect(appPage.getByRole('dialog').getByText('Essay Assignment — Ada Essay')).toBeVisible({
            timeout: 5_000,
        });
        await appPage
            .getByRole('dialog')
            .getByRole('button', { name: /assign to students/i })
            .click();

        // Navigating to the canonical group page (/essays/:teacherKey) proves
        // the fan-out persisted; both students appear on the roster.
        await appPage.waitForURL(/#\/essays\/[^/]+$/, { timeout: 10_000 });
        await expect(appPage.getByText('Ada Essay')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Bram Essay')).toBeVisible();

        const teacherKey = appPage.url().split('#/essays/')[1];

        // Build the student share code from the persisted assignment — mirrors
        // encodeEssayAssignment (src/utils/shareCode.ts) with no supabaseUrl, so
        // the assignment content is embedded in the URL itself.
        const savedAssignments = await readLocalStorage<EssayAssignment[]>(appPage, 'rm_essay_assignments');
        const assignment = (savedAssignments ?? []).find(
            (a) => a.teacherKey === teacherKey && a.studentId === studentA.id
        );
        expect(assignment).toBeTruthy();
        expect(assignment!.minWords).toBe(20);
        expect(assignment!.maxWords).toBe(200);
        expect(assignment!.timeLimitMinutes).toBe(45);
        const studentCode = buildEssayCode(assignment!);

        // ── 3. Student writes and submits in a fresh browser context ────────
        const studentContext = await browser.newContext();
        let submissionCode: string;
        try {
            const studentPage = await studentContext.newPage();
            const essay = new StudentEssayPage(studentPage);

            await essay.goto(studentCode);
            await expect(essay.editor()).toBeVisible({ timeout: 10_000 });
            // Assignment parameters set by the teacher reached the student page.
            await expect(studentPage.getByText('Climate Change Essay')).toBeVisible();
            await expect(
                studentPage.getByText('Write about the impact of climate change on your region.')
            ).toBeVisible();
            // Time limit from the builder surfaces as the countdown timer.
            await expect(essay.timerDisplay()).toContainText(/4\d:\d\d/, { timeout: 5_000 });

            await essay.typeInEditor(
                'Learning to write clearly takes practice patience and a willingness to revise your own work over and over again until it shines.'
            );
            await expect(essay.wordCountDisplay()).toContainText('22', { timeout: 5_000 });

            await essay.submitButton().click();
            await expect(essay.submittedConfirmation()).toBeVisible({ timeout: 10_000 });
            await expect(essay.submissionCodeArea()).toBeVisible({ timeout: 5_000 });
            submissionCode = await essay.submissionCodeArea().inputValue();
            expect(submissionCode.length).toBeGreaterThan(20);
        } finally {
            await studentContext.close();
        }

        // ── 4. Teacher imports the submission code on the builder page ──────
        await appPage.getByRole('button', { name: /import submission code/i }).click();
        const importDialog = appPage.getByRole('dialog');
        await expect(importDialog.getByRole('textbox')).toBeVisible({ timeout: 5_000 });
        await importDialog.getByRole('textbox').fill(submissionCode);
        await importDialog.getByRole('button', { name: /import submission code/i }).click();

        await expect(appPage.getByText(/submission imported/i)).toBeVisible({ timeout: 5_000 });
        // The student's roster row flips from Pending to Submitted.
        await expect(appPage.getByText('Ada Essay').first().locator('..')).toContainText('Submitted', {
            timeout: 5_000,
        });
        await expect(appPage.getByText('Bram Essay').first().locator('..')).toContainText('Pending');
    });

    test('live monitor without a database shows the guard panel', async ({ appPage }) => {
        await appPage.goto('/#/essays/any-key/monitor');
        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 20_000 });

        await expect(appPage.getByText('Live monitoring needs a database')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText(/supabase realtime connection/i)).toBeVisible();
    });
});
