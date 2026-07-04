import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { StudentCefrOverviewPage } from '../pages/StudentCefrOverviewPage';

test.describe('Student CEFR detail', () => {
    test('shows an empty state for a student with no graded CEFR-linked rubrics', async ({
        appPage,
        seedStorage,
    }) => {
        const cls = buildClass({ id: 'scd-class', name: 'SCD Class' });
        const student = buildStudent(cls.id, { id: 'scd-student', name: 'SCD Student' });

        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentCefrOverviewPage(appPage);
        await page.goto(student.id);

        await expect(appPage.getByText('SCD Student')).toBeVisible();
        await expect(appPage.getByText(/no cefr/i)).toBeVisible();
    });

    test('copy link writes the current URL to the clipboard and shows confirmation', async ({
        appPage,
        seedStorage,
        browserName,
    }) => {
        // Clipboard permission grants are Chromium-only in Playwright — Firefox/WebKit
        // reject grantPermissions(['clipboard-read', ...]) with "Unknown permission".
        test.skip(browserName !== 'chromium', 'clipboard permissions are only grantable in Chromium');

        const cls = buildClass({ id: 'scd-class-2', name: 'SCD Class 2' });
        const student = buildStudent(cls.id, { id: 'scd-student-2', name: 'SCD Student 2' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        await appPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);

        const page = new StudentCefrOverviewPage(appPage);
        await page.goto(student.id);
        await page.copyShareLink();

        await expect(appPage.getByRole('button', { name: /copied/i }).first()).toBeVisible();
        const clipboardText = await appPage.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toContain(`/students/${student.id}/cefr-overview`);
    });

    test('navigates to learning path and vocabulary dashboard', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ id: 'scd-class-3', name: 'SCD Class 3' });
        const student = buildStudent(cls.id, { id: 'scd-student-3', name: 'SCD Student 3' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        const page = new StudentCefrOverviewPage(appPage);
        await page.goto(student.id);

        await page.goToLearningPath();
        await expect(appPage).toHaveURL(new RegExp(`/students/${student.id}/learning-path`));

        await appPage.goBack();
        await page.goToVocabulary();
        await expect(appPage).toHaveURL(/\/vocabulary/);
    });
});
