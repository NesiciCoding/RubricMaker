import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';
import { buildEssaySubmissionCode } from '../pages/StudentEssayPage';

/**
 * E2E tests for the "Import Essay" flow in offline (no-DB) mode.
 *
 * A student hands in an essay via the essay editor and receives a submission
 * code (see 13-essay-student.spec.ts). The teacher pastes that code into the
 * "Import Essay" modal on the grading page; the essay is added as a text/html
 * attachment linked to the rubric + student, and should then be visible in
 * both the normal grading view and the comparative grading view.
 */
test.describe('Essay import → grading views (offline mode)', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ id: 'essay-import-class', name: 'Essay Import Class' });
        const rubric = buildRubric({ id: 'essay-import-rubric', name: 'Essay Import Rubric' });
        const student = buildStudent(cls.id, { id: 'essay-import-student', name: 'Essay Import Student' });
        const otherStudent = buildStudent(cls.id, { id: 'essay-import-other', name: 'Other Student' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student, otherStudent],
        });
    });

    test('Import Essay modal offers the paste-code form (no database tab offline)', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('essay-import-rubric', 'essay-import-student');

        await appPage.getByRole('button', { name: /import essay/i }).click();
        await expect(appPage.getByText(/import essay — essay import student/i)).toBeVisible({ timeout: 10_000 });

        // No Supabase configured — the "From database" tab must not be offered.
        await expect(appPage.getByText('From database')).not.toBeVisible();
        await expect(appPage.getByPlaceholder(/paste the student's submission code/i)).toBeVisible();
    });

    test('rejects a submission code for a different rubric/student', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('essay-import-rubric', 'essay-import-student');

        await appPage.getByRole('button', { name: /import essay/i }).click();
        const code = buildEssaySubmissionCode({
            assignmentRubricId: 'some-other-rubric',
            assignmentStudentId: 'essay-import-student',
        });
        await appPage.getByPlaceholder(/paste the student's submission code/i).fill(code);
        await appPage.getByRole('button', { name: /^import essay$/i }).click();

        await expect(appPage.getByText(/different student or rubric/i)).toBeVisible({ timeout: 5_000 });
    });

    test('importing a valid submission code adds the essay as an attachment in the grading view', async ({
        appPage,
    }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('essay-import-rubric', 'essay-import-student');

        await appPage.getByRole('button', { name: /import essay/i }).click();
        const code = buildEssaySubmissionCode({
            assignmentRubricId: 'essay-import-rubric',
            assignmentStudentId: 'essay-import-student',
            contentHtml: '<p>My handed-in essay about rivers.</p>',
            wordCount: 5,
        });
        await appPage.getByPlaceholder(/paste the student's submission code/i).fill(code);
        await appPage.getByRole('button', { name: /^import essay$/i }).click();

        // The modal closes immediately on import and the Attachments panel opens,
        // showing the essay as an HTML attachment for this student.
        await expect(appPage.getByText(/essay – essay import student/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('imported essay attachment is visible in the comparative grading view', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('essay-import-rubric', 'essay-import-student');

        await appPage.getByRole('button', { name: /import essay/i }).click();
        const code = buildEssaySubmissionCode({
            assignmentRubricId: 'essay-import-rubric',
            assignmentStudentId: 'essay-import-student',
            contentHtml: '<p>My handed-in essay about rivers.</p>',
            wordCount: 5,
        });
        await appPage.getByPlaceholder(/paste the student's submission code/i).fill(code);
        await appPage.getByRole('button', { name: /^import essay$/i }).click();

        // The modal closes immediately on import and the Attachments panel opens.
        await expect(appPage.getByText(/essay – essay import student/i).first()).toBeVisible({ timeout: 10_000 });

        // Comparative grading anchors on the imported student via ?start=
        await appPage.goto(
            '/#/grade-comparative/essay-import-class/essay-import-rubric?start=essay-import-student'
        );
        await expect(appPage.locator('.main-area')).toBeVisible({ timeout: 10_000 });
        await expect(appPage.getByText(/essay – essay import student/i).first()).toBeVisible({ timeout: 10_000 });
    });
});
