import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { StudentLearningPathPage } from '../pages/StudentLearningPathPage';

test.describe('Student learning path', () => {
    test('shows empty recommendations and interventions for a student with no grading history', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'slp-class', name: 'SLP Class' });
        const student = buildStudent(cls.id, { id: 'slp-student', name: 'SLP Student' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentLearningPathPage(appPage);
        await page.goto(student.id);

        await expect(appPage.getByText('SLP Student')).toBeVisible();
        await expect(appPage.getByText(/no recommendations/i)).toBeVisible();
        await expect(appPage.getByText(/no intervention/i)).toBeVisible();
    });

    test('navigates to CEFR overview and vocabulary dashboard', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'slp-class-2', name: 'SLP Class 2' });
        const student = buildStudent(cls.id, { id: 'slp-student-2', name: 'SLP Student 2' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentLearningPathPage(appPage);
        await page.goto(student.id);

        await page.goToCefrOverview();
        await expect(appPage).toHaveURL(new RegExp(`/students/${student.id}/cefr-overview`));

        await appPage.goBack();
        await page.goToVocabulary();
        await expect(appPage).toHaveURL(/\/vocabulary/);
    });

    test('shows an empty state when the student cannot be found', async ({ appPage, seedStorage }) => {
        await seedStorage({ rm_classes: [], rm_students: [] });

        const page = new StudentLearningPathPage(appPage);
        await page.goto('missing-student-id');

        await expect(appPage.getByText(/student not found/i)).toBeVisible();
    });
});
