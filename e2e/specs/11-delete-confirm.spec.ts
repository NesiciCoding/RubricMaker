import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildRubric, buildStudent } from '../fixtures/data.factory';

test.describe('ConfirmDialog — delete flows', () => {
    test('rubric delete: confirm removes rubric', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ name: 'Confirm Delete Rubric' });
        await seedStorage({ rm_rubrics: [rubric] });

        await appPage.goto('/#/rubrics');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');
        await expect(appPage.getByText('Confirm Delete Rubric')).toBeVisible();

        const card = appPage.locator('.rubric-card, .card').filter({ has: appPage.getByText('Confirm Delete Rubric', { exact: true }) }).first();
        await card.getByRole('button', { name: /delete/i }).click();

        const dialog = appPage.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const confirmBtn = dialog.getByRole('button', { name: /delete/i });
        await expect(confirmBtn).toHaveClass(/btn-danger/);
        await confirmBtn.click();

        await expect(appPage.getByText('Confirm Delete Rubric')).not.toBeVisible({ timeout: 5_000 });
    });

    test('rubric delete: cancel keeps rubric', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ name: 'Cancel Delete Rubric' });
        await seedStorage({ rm_rubrics: [rubric] });

        await appPage.goto('/#/rubrics');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');
        const card = appPage.locator('.rubric-card, .card').filter({ has: appPage.getByText('Cancel Delete Rubric', { exact: true }) }).first();
        await card.getByRole('button', { name: /delete/i }).click();

        const dialog = appPage.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: /cancel/i }).click();

        await expect(dialog).not.toBeVisible();
        await expect(appPage.getByText('Cancel Delete Rubric')).toBeVisible();
    });

    test('pressing Escape dismisses dialog without deleting', async ({ appPage, seedStorage }) => {
        const rubric = buildRubric({ name: 'Escape Test Rubric' });
        await seedStorage({ rm_rubrics: [rubric] });

        await appPage.goto('/#/rubrics');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');
        const card = appPage.locator('.rubric-card, .card').filter({ has: appPage.getByText('Escape Test Rubric', { exact: true }) }).first();
        await card.getByRole('button', { name: /delete/i }).click();

        await expect(appPage.getByRole('dialog')).toBeVisible();
        await appPage.keyboard.press('Escape');
        await expect(appPage.getByRole('dialog')).not.toBeVisible({ timeout: 3_000 });
        await expect(appPage.getByText('Escape Test Rubric')).toBeVisible();
    });

    test('student delete: confirm removes student', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Test Class' });
        const student = buildStudent(cls.id, { name: 'Student To Delete' });
        await seedStorage({ rm_classes: [cls], rm_students: [student] });

        await appPage.goto('/#/students');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');
        await expect(appPage.getByText('Student To Delete')).toBeVisible();

        const row = appPage.locator('table tbody tr').filter({ has: appPage.getByText('Student To Delete', { exact: true }) });
        await row.locator('button.btn-ghost.btn-icon').last().click();

        // Student delete confirm uses <div class="modal"> without role="dialog"
        await expect(appPage.locator('.modal-overlay')).toBeVisible();
        await appPage.locator('.modal').locator('button.btn-primary').click();
        await expect(appPage.getByText('Student To Delete')).not.toBeVisible({ timeout: 5_000 });
    });
});
