import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { ExportPage } from '../pages/ExportPage';

test.describe('Export page', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ name: 'Export Class' });
        const rubric = buildRubric({ id: 'export-rubric', name: 'Export Test Rubric' });
        const student = buildStudent(cls.id, { id: 'export-student', name: 'Export Student' });
        const sr = buildStudentRubric(rubric, student);
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student],
            rm_student_rubrics: [sr],
        });
    });

    test('export page loads and shows rubric selector', async ({ appPage }) => {
        const page = new ExportPage(appPage);
        await page.goto();
        await expect(appPage.locator('select').first()).toBeVisible({ timeout: 10_000 });
    });

    test('graded student appears after selecting rubric', async ({ appPage }) => {
        const page = new ExportPage(appPage);
        await page.goto();
        await page.selectRubricById('export-rubric');
        await expect(appPage.getByText('Export Student')).toBeVisible({ timeout: 10_000 });
    });

    test('select all enables export button', async ({ appPage }) => {
        const page = new ExportPage(appPage);
        await page.goto();
        await page.selectRubricById('export-rubric');
        await page.selectAllStudents();
        const exportBtn = appPage.getByRole('button', { name: /print.*pdf/i });
        await expect(exportBtn).toBeEnabled({ timeout: 5_000 });
    });
});
