import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { StudentsPage } from '../pages/StudentsPage';

test.describe('Student CRUD', () => {
    test('add a new student', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Year 3B' });
        await seedStorage({ rm_classes: [cls] });

        const page = new StudentsPage(appPage);
        await page.goto();
        await page.openAddStudentModal();
        await page.fillStudentName('Bob Smith');
        await page.fillStudentEmail('bob@school.edu');
        await page.selectClass('Year 3B');
        await page.submitStudentForm();

        await expect(appPage.getByText('Bob Smith')).toBeVisible({ timeout: 5_000 });
    });

    test('delete a student via confirm dialog', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Class A' });
        const student = buildStudent(cls.id, { name: 'Delete Me Student' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentsPage(appPage);
        await page.goto();
        await expect(appPage.getByText('Delete Me Student')).toBeVisible();

        const studentRow = appPage.getByRole('row').filter({
            has: appPage.getByText('Delete Me Student', { exact: true }),
        });
        await studentRow.getByRole('button', { name: /delete/i }).click();
        await expect(appPage.getByRole('dialog')).toBeVisible();
        await appPage.getByRole('dialog').getByRole('button', { name: /delete/i }).click();

        await expect(appPage.getByText('Delete Me Student')).not.toBeVisible({ timeout: 5_000 });
    });

    test('student list shows added students', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Class B' });
        const students = [
            buildStudent(cls.id, { name: 'Alice A' }),
            buildStudent(cls.id, { name: 'Bob B' }),
        ];
        await seedStorage({ rm_classes: [cls], rm_students: students });

        const page = new StudentsPage(appPage);
        await page.goto();
        await expect(appPage.getByText('Alice A')).toBeVisible();
        await expect(appPage.getByText('Bob B')).toBeVisible();
    });
});
