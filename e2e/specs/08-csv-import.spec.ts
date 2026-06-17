import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '../fixtures/app.fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FIXTURE = path.join(__dirname, '../fixtures/students.csv');

test.describe('CSV student import', () => {
    test('uploading CSV opens the import modal', async ({ appPage }) => {
        await appPage.goto('/#/students');

        const [fileChooser] = await Promise.all([
            appPage.waitForEvent('filechooser'),
            appPage.getByRole('button', { name: /import csv/i }).click(),
        ]);
        await fileChooser.setFiles(CSV_FIXTURE);

        await expect(appPage.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.locator('#csv-import-title')).toBeVisible();
    });

    test('CSV modal shows parsed rows and import button', async ({ appPage }) => {
        await appPage.goto('/#/students');

        const [fileChooser] = await Promise.all([
            appPage.waitForEvent('filechooser'),
            appPage.getByRole('button', { name: /import csv/i }).click(),
        ]);
        await fileChooser.setFiles(CSV_FIXTURE);

        const dialog = appPage.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 5_000 });

        // Should see the import button with student count
        await expect(dialog.getByRole('button', { name: /import 2 students/i })).toBeVisible({ timeout: 5_000 });
    });

    test('importing CSV adds students to the list', async ({ appPage }) => {
        await appPage.goto('/#/students');

        const [fileChooser] = await Promise.all([
            appPage.waitForEvent('filechooser'),
            appPage.getByRole('button', { name: /import csv/i }).click(),
        ]);
        await fileChooser.setFiles(CSV_FIXTURE);

        const dialog = appPage.getByRole('dialog');
        await dialog.getByRole('button', { name: /import 2 students/i }).click();

        // Dismiss the import summary and close the modal
        await dialog.getByRole('button', { name: /done/i }).click();

        // Select the imported class in the sidebar to make its students visible
        await appPage.locator('.nav-item').filter({ hasText: 'Year 3B' }).click();

        await expect(appPage.getByText('Bob Smith')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Carol Jones')).toBeVisible();
    });
});
