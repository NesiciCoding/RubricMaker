import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { CefrOverviewPage } from '../pages/CefrOverviewPage';

test.describe('CEFR overview (class-wide)', () => {
    test('empty state shown when there are no students', async ({ appPage, seedStorage }) => {
        await seedStorage({ rm_classes: [], rm_students: [] });

        const page = new CefrOverviewPage(appPage);
        await page.goto();

        await expect(appPage.getByText(/no students found/i)).toBeVisible();
    });

    test('class filter narrows the table to the selected class, and detail opens the student overview', async ({
        appPage,
        seedStorage,
    }) => {
        const classA = buildClass({ id: 'cefr-class-a', name: 'CEFR Class A' });
        const classB = buildClass({ id: 'cefr-class-b', name: 'CEFR Class B' });
        const studentA = buildStudent(classA.id, { id: 'cefr-student-a', name: 'CEFR Student A' });
        const studentB = buildStudent(classB.id, { id: 'cefr-student-b', name: 'CEFR Student B' });

        await seedStorage({
            rm_classes: [classA, classB],
            rm_students: [studentA, studentB],
        });

        const page = new CefrOverviewPage(appPage);
        await page.goto();

        await expect(page.heatmap()).toContainText('CEFR Student A');
        await expect(page.heatmap()).toContainText('CEFR Student B');

        await page.filterByClass('CEFR Class A');
        await expect(page.heatmap()).toContainText('CEFR Student A');
        await expect(page.heatmap()).not.toContainText('CEFR Student B');

        await page.openStudentDetail('CEFR Student A');
        await expect(appPage).toHaveURL(new RegExp(`/students/${studentA.id}/cefr-overview`));
    });
});
