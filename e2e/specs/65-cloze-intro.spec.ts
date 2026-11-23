/** The optional formatted instructions above a cloze question's gap text. */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('cloze editor — instructions above the text', () => {
    test('the button reveals a rich editor whose text and formatting stay put', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        const card = builder.questionCard(0);
        await expect(card.locator('.essay-editor-content')).toHaveCount(0);
        await card.getByRole('button', { name: /instructions or context/i }).click();

        const intro = card.locator('.essay-editor-content').first();
        await expect(intro).toBeVisible();
        await intro.fill('Read the rules first');
        await intro.press('ControlOrMeta+a');
        await card.getByTitle(/^bold/i).first().click();
        await expect(intro.locator('strong')).toContainText('Read the rules first');

        // The gap text below it is a separate editor and is not affected.
        await card.locator('.cloze-gap-editor-content').fill('The cat sat');
        await expect(intro).toContainText('Read the rules first');
        await expect(card.locator('.cloze-gap-editor-content')).toContainText('The cat sat');
    });
});
