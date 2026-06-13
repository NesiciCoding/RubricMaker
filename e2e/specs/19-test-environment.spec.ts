/**
 * Item 19 — Testing environment end-to-end lifecycle (roadmap 3.4, offline mode).
 *
 * Covers, in order:
 *  1. Teacher builds a test with one question of each type (multiple-choice,
 *     short-answer, open) via TestBuilderPage.
 *  2. Teacher opens the assignment modal (TestAssignmentModal) for the test.
 *  3. A fresh browser context (the student) opens /test/:code, answers every
 *     question, triggers a tab-switch (window blur — see
 *     useLiveSessionTelemetry), submits, and reads back the offline
 *     submission code.
 *  4. Teacher imports the submission code via TestSubmissionImportModal.
 *  5. Teacher opens TestResultsPage, manually grades the open question, and
 *     sees the correct totals/grade — including the tab-switch count in the
 *     "session integrity" panel.
 *  6. Teacher opens ClassAverageAdjuster on /tests, previews and applies an
 *     adjustment, and the results page reflects the adjusted score.
 *
 * Stays in offline mode (no Supabase) — see playwright.config.ts, which
 * excludes 14-17 from the default chromium/firefox/webkit projects for the
 * same reason this spec is included in them.
 */
import type { Browser } from '@playwright/test';
import { test, expect as appExpect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';
import { TestListPage } from '../pages/TestListPage';
import { StudentTestPage } from '../pages/StudentTestPage';
import { readLocalStorage } from '../fixtures/storage.helpers';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import type { Test as RmTest, Class, Student } from '../../src/types';

test.describe('Testing environment — full lifecycle (offline)', () => {
    test('teacher builds, assigns, student submits, teacher grades and adjusts', async ({
        appPage,
        seedStorage,
        browser,
    }: { appPage: import('@playwright/test').Page; seedStorage: (d: Record<string, unknown>) => Promise<void>; browser: Browser }) => {
        const klass: Class = buildClass({ name: 'E2E Class' });
        const student: Student = buildStudent(klass.id, { name: 'Eva Example' });
        await seedStorage({ rm_classes: [klass], rm_students: [student] });

        // ── 1. Teacher builds the test ──────────────────────────────────────
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.fillName('E2E Vocabulary Quiz');
        await builder.fillDescription('Covers chapter 4 vocabulary.');

        // Question 1 — multiple choice (2 points)
        await builder.addQuestion();
        await builder.setQuestionPrompt(0, 'What is the capital of France?');
        await builder.setQuestionPoints(0, 2);
        await builder.setOptionText(0, 0, 'Paris');
        await builder.setOptionText(0, 1, 'Berlin');
        await builder.markOptionCorrect(0, 0);

        // Question 2 — short answer with expected answer (2 points, auto-scored)
        await builder.addQuestion();
        await builder.setQuestionPrompt(1, 'What is 2 + 2?');
        await builder.setQuestionType(1, 'short-answer');
        await builder.setQuestionPoints(1, 2);
        await builder.setExpectedAnswer(1, '4');

        // Question 3 — open / essay (4 points, manually graded)
        await builder.addQuestion();
        await builder.setQuestionPrompt(2, 'Describe your favourite season and why.');
        await builder.setQuestionType(2, 'open');
        await builder.setQuestionPoints(2, 4);

        await builder.save();
        await builder.waitForSaved();

        // ── 2. Teacher opens the assignment modal ───────────────────────────
        const list = new TestListPage(appPage);
        await list.goto();
        await appExpect(appPage.getByRole('heading', { name: 'E2E Vocabulary Quiz' })).toBeVisible();

        await list.openAssignModal('E2E Vocabulary Quiz');
        await appExpect(list.assignmentModal()).toBeVisible();
        await list.setAssignmentClass('E2E Class');
        const assignmentLink = await list.getStudentAssignmentLink('Eva Example');
        appExpect(assignmentLink).toContain('#/test/');
        await list.closeAssignmentModal();

        // Offline mode: TestAssignmentModal embeds the full test content in the
        // share code so the student page can load it without a database.
        const studentCode = assignmentLink.split('#/test/')[1];

        const savedTests = await readLocalStorage<RmTest[]>(appPage, 'rm_tests');
        const savedTest = (savedTests ?? []).find((t) => t.name === 'E2E Vocabulary Quiz');
        appExpect(savedTest).toBeTruthy();
        const test1 = savedTest!;
        appExpect(test1.questions).toHaveLength(3);

        // ── 3. Student answers the test in a fresh browser context ─────────
        const studentContext = await browser.newContext();
        const studentPage = await studentContext.newPage();
        const studentTestPage = new StudentTestPage(studentPage);

        await studentTestPage.goto(studentCode);
        await appExpect(studentTestPage.testTitle('E2E Vocabulary Quiz')).toBeVisible({ timeout: 10_000 });

        // Trigger a tab-switch event early in the session.
        await studentTestPage.triggerTabSwitch();

        // Question 1 — multiple choice
        await studentTestPage.selectMultipleChoiceOption('Paris');
        await studentTestPage.clickNext();

        // Question 2 — short answer
        await studentTestPage.fillShortAnswer('4');
        await studentTestPage.clickNext();

        // Question 3 — open
        await studentTestPage.fillOpenAnswer('I love autumn because of the colours and cooler weather.');

        await studentTestPage.submit();
        await appExpect(studentTestPage.submittedConfirmation()).toBeVisible({ timeout: 10_000 });
        await appExpect(studentTestPage.submissionCodeArea()).toBeVisible({ timeout: 5_000 });
        const submissionCode = await studentTestPage.getSubmissionCode();
        appExpect(submissionCode.length).toBeGreaterThan(20);

        await studentContext.close();

        // ── 4. Teacher imports the submission code ──────────────────────────
        await list.goto();
        await list.openImportModal('E2E Vocabulary Quiz');
        await appExpect(list.importModal()).toBeVisible();
        await list.pasteSubmissionCode(submissionCode);
        await list.clickImport();
        await appExpect(list.importSuccessMessage()).toBeVisible({ timeout: 5_000 });
        await list.closeImportModal();

        // ── 5. Teacher opens results and grades the open question ───────────
        const savedStudentTests = await readLocalStorage<Array<{ id: string; testId: string }>>(
            appPage,
            'rm_student_tests'
        );
        const studentTestRecord = (savedStudentTests ?? []).find((st) => st.testId === test1.id);
        appExpect(studentTestRecord).toBeTruthy();

        await appPage.goto(`/#/tests/${test1.id}/results/${studentTestRecord!.id}`);
        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 20_000 });

        // Auto-scored questions: MC correct (2/2), short-answer exact match (2/2)
        await appExpect(appPage.getByText(/auto-scored: 2 \/ 2 points/i).first()).toBeVisible();

        // Session integrity — tab switch recorded
        await appExpect(appPage.getByText(/tab switches: 1/i)).toBeVisible();

        // Manually grade the open question (3 / 4 points)
        const openQuestionCard = appPage.locator('.card').filter({ hasText: 'Describe your favourite season' });
        await openQuestionCard.locator('input[type="number"]').fill('3');
        await openQuestionCard.getByRole('button', { name: /save score/i }).click();

        // Total: 2 (MC) + 2 (short-answer) + 3 (open) = 7 / 8 = 87.5%
        await appExpect(appPage.getByText('7.00 / 8')).toBeVisible({ timeout: 5_000 });
        await appExpect(appPage.getByText('87.5%')).toBeVisible();

        // ── 6. Teacher applies a class-average adjustment ────────────────────
        await list.goto();
        await list.openResultsList('E2E Vocabulary Quiz');
        await appExpect(list.classAverageAdjuster('E2E Vocabulary Quiz')).toBeVisible();

        // Current average is 87.5% — target a lower average to get a negative
        // adjustment that's easy to assert on the results page.
        await list.setTargetAverage('E2E Vocabulary Quiz', 75);
        await list.applyAdjustment('E2E Vocabulary Quiz');
        await appExpect(appPage.getByText(/adjustment to apply/i)).toBeVisible();

        // ── Results page reflects the adjustment ─────────────────────────────
        await appPage.goto(`/#/tests/${test1.id}/results/${studentTestRecord!.id}`);
        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 20_000 });

        await appExpect(appPage.getByText(/raw points: 7\.00/i)).toBeVisible({ timeout: 5_000 });
        // 75% of 8 points = 6.00
        await appExpect(appPage.getByText('6.00 / 8')).toBeVisible();
        await appExpect(appPage.getByText('75.0%')).toBeVisible();
    });
});
