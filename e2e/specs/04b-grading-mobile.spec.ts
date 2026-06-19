import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';
import { GradeStudentPage } from '../pages/GradeStudentPage';

test.describe('Mobile grading (touch viewport)', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ name: 'Test Class' });
        const rubric = buildRubric({ id: 'rubric-grade-mobile', name: 'Grade Mobile Rubric' });
        const student = buildStudent(cls.id, { id: 'student-grade-mobile', name: 'Grade Mobile Student' });
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
        });
    });

    test('touch stepper is visible after selecting a level', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-mobile', 'student-grade-mobile');

        await page.selectLevel(0, 'Excellent');

        await expect(page.getStepper().first()).toBeVisible({ timeout: 10_000 });
    });

    test('sticky grade footer is visible after grading', async ({ appPage }) => {
        const page = new GradeStudentPage(appPage);
        await page.goto('rubric-grade-mobile', 'student-grade-mobile');

        await page.selectLevel(0, 'Excellent');

        await expect(page.getGradeFooter()).toBeVisible({ timeout: 10_000 });
    });
});
