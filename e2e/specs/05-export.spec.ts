import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent, buildStudentRubric } from '../fixtures/data.factory';
import { ExportPage } from '../pages/ExportPage';

test.describe('Export page', () => {
    test.beforeEach(async ({ seedStorage }) => {
        const cls = buildClass({ name: 'Export Class' });
        const rubric = buildRubric({ id: 'export-rubric', name: 'Export Test Rubric' });
        const student = buildStudent(cls.id, { id: 'export-student', name: 'Export Student' });
        const secondStudent = buildStudent(cls.id, { id: 'export-student-2', name: 'Second Student' });
        const sr = buildStudentRubric(rubric, student);
        const secondSr = buildStudentRubric(rubric, secondStudent);
        await seedStorage({
            rm_classes: [cls],
            rm_rubrics: [rubric],
            rm_students: [student, secondStudent],
            rm_student_rubrics: [sr, secondSr],
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

    test('switching export types shows the matching workbench', async ({ appPage }) => {
        const page = new ExportPage(appPage);
        await page.goto();
        const typeGroup = appPage.getByRole('group', { name: 'What do you want to export?' });

        await typeGroup.getByRole('button', { name: /Exam booklet/ }).click();
        await expect(appPage.getByRole('heading', { name: 'Exam booklets', exact: true })).toBeVisible();
        await expect(appPage.getByText('The grading key is always exported separately.')).toBeVisible();
        await expect(appPage.getByRole('heading', { name: 'Rubric grades', exact: true })).toBeHidden();

        await typeGroup.getByRole('button', { name: /Progress reports/ }).click();
        await expect(appPage.getByRole('heading', { name: 'Progress reports', exact: true })).toBeVisible();
        await expect(appPage.getByRole('group', { name: 'Report output' })).toBeVisible();

        await typeGroup.getByRole('button', { name: /Essays/ }).click();
        await expect(appPage.getByRole('heading', { name: 'Essays', exact: true })).toBeVisible();
        await expect(appPage.getByLabel('Select Essay Assignment')).toBeVisible();
        await expect(appPage.getByRole('heading', { name: 'Exam booklets', exact: true })).toBeHidden();

        await typeGroup.getByRole('button', { name: /Rubric grades/ }).click();
        await expect(appPage.getByRole('heading', { name: 'Rubric grades', exact: true })).toBeVisible();
        await expect(appPage.getByText('Select Rubric to Export')).toBeVisible();
    });

    test('report card toggle switches the merged report workbench', async ({ appPage }) => {
        const page = new ExportPage(appPage);
        await page.goto();
        await appPage
            .getByRole('group', { name: 'What do you want to export?' })
            .getByRole('button', { name: /Progress reports/ })
            .click();

        const outputGroup = appPage.getByRole('group', { name: 'Report output' });
        await expect(outputGroup.getByRole('button', { name: 'Period report' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        await expect(appPage.getByRole('button', { name: 'Generate 0 report(s)', exact: true })).toBeVisible();

        await outputGroup.getByRole('button', { name: 'Report card' }).click();
        await expect(outputGroup.getByRole('button', { name: 'Report card' })).toHaveAttribute('aria-pressed', 'true');
        await expect(
            appPage.getByText('Generate a consolidated DOCX report card per student with customizable sections.')
        ).toBeVisible();
        await expect(appPage.getByRole('checkbox', { name: 'Standards coverage' })).toBeVisible();
        await expect(appPage.getByRole('button', { name: 'Export report card', exact: true })).toBeVisible();
        await expect(appPage.getByRole('button', { name: 'Generate 0 report(s)', exact: true })).toBeHidden();

        await outputGroup.getByRole('button', { name: 'Period report' }).click();
        await expect(appPage.getByRole('button', { name: 'Generate 0 report(s)', exact: true })).toBeVisible();
        await expect(appPage.getByRole('button', { name: 'Export report card', exact: true })).toBeHidden();
    });

    test('bulk selection updates the footer actions', async ({ appPage }) => {
        const page = new ExportPage(appPage);
        await page.goto();
        await page.selectRubricById('export-rubric');

        await expect(appPage.getByText('0 of 2 selected').first()).toBeVisible();
        await appPage.getByRole('checkbox', { name: 'Export Student', exact: true }).check();
        await expect(appPage.getByText('1 of 2 selected').first()).toBeVisible();
        await expect(appPage.getByRole('button', { name: /Export 1 as DOCX/ })).toBeEnabled();

        await appPage.getByRole('button', { name: 'Select All', exact: true }).click();
        await expect(appPage.getByText('2 of 2 selected').first()).toBeVisible();
        await expect(appPage.getByRole('checkbox', { name: 'Second Student', exact: true })).toBeChecked();
        await expect(appPage.getByRole('button', { name: /Export 2 as DOCX/ })).toBeEnabled();
        await expect(appPage.getByRole('button', { name: /Print 2 to PDF/ })).toBeEnabled();

        await appPage.getByRole('button', { name: 'Deselect All', exact: true }).click();
        await expect(appPage.getByText('0 of 2 selected').first()).toBeVisible();
        await expect(appPage.getByRole('checkbox', { name: 'Export Student', exact: true })).not.toBeChecked();
        await expect(appPage.getByRole('button', { name: /Export 0 as DOCX/ })).toBeDisabled();
    });
});
