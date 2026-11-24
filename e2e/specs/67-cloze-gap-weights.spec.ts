/** Per-gap weights in the cloze gap list: set one, and see it reset to equal when the number of gaps changes. */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('cloze editor — gap weights', () => {
    test('a weight is kept, and resets to equal when a gap is added', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        const editor = appPage.locator('.cloze-gap-editor-content').first();
        await editor.click();
        const insert = appPage.getByRole('button', { name: /insert gap/i }).first();
        await insert.click();
        await insert.click();

        const weights = builder.questionCard(0).getByRole('spinbutton', { name: /weight/i });
        await expect(weights).toHaveCount(2);
        await expect(weights.first()).toHaveValue('1');

        await weights.first().fill('2');
        await expect(weights.first()).toHaveValue('2');
        await expect(weights.nth(1)).toHaveValue('1');

        await insert.click();
        await expect(weights).toHaveCount(3);
        for (let i = 0; i < 3; i++) await expect(weights.nth(i)).toHaveValue('1');
    });
});
