import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';

test.describe('Grading workflow', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ name: 'Test Class' });
        const rubric = buildRubric({ id: 'rubric-grade-test', name: 'Grade Test Rubric' });
        const student = buildStudent(cls.id, { id: 'student-grade-test', name: 'Grade Test Student' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });
    });

    test('grade page loads with rubric name visible', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-test', 'student-grade-test');
        await expect(appPage.getByText('Grade Test Rubric')).toBeVisible();
    });

    test('select a level and it appears highlighted', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-test', 'student-grade-test');

        await page.selectLevel(0, 'Excellent');
        const isSelected = await page.isLevelSelected('Excellent', 0);
        expect(isSelected).toBe(true);
    });

    test('fill comment and save — grade persists after reload', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-test', 'student-grade-test');

        await page.selectLevel(0, 'Excellent');
        await page.fillCriterionComment(0, 'Exceptional work on this criterion');
        await page.save();
        await page.waitForSaved();

        await appPage.goto('/rubrics');
        await page.goto('rubric-grade-test', 'student-grade-test');

        await expect(page.getLevelBtn('Excellent', 0)).toHaveClass(/selected/);
        await expect(appPage.getByText('Exceptional work on this criterion')).toBeVisible();
    });

    test('grade summary footer is visible after grading', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-test', 'student-grade-test');

        await page.selectLevel(0, 'Excellent');
        await page.save();
        await page.waitForSaved();

        await expect(page.getGradeSummary()).toBeVisible();
    });

    test('save button text changes to Saved! then reverts', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-test', 'student-grade-test');

        await page.selectLevel(0, 'Good');
        await page.save();
        await page.waitForSaved();
        await expect(appPage.getByRole('button', { name: /^save$/i })).toBeVisible({ timeout: 5_000 });
    });
});
