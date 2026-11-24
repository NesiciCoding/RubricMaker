/**
 * Formatting inside cloze text: the toolbar applies bold and lists around a gap, and everything that reads the
 * prompt back as text (here the collapsed card summary) sees the words, never the markup.
 */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('cloze editor — formatting', () => {
    test('bold and a list around a gap stay editable, and the summary shows plain text', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('cloze');

        const editor = appPage.locator('.cloze-gap-editor-content').first();
        await editor.fill('The cat sat on the mat');
        await editor.press('ControlOrMeta+a');
        await appPage.getByRole('button', { name: /^bold$/i }).click();
        await expect(editor.locator('strong')).toContainText('The cat sat on the mat');

        await editor.press('End');
        await appPage
            .getByRole('button', { name: /insert gap/i })
            .first()
            .click();
        await expect(appPage.locator('.cloze-gap-pill')).toHaveCount(1);

        await appPage.getByRole('button', { name: /bullet list/i }).click();
        await expect(editor.locator('ul li')).toHaveCount(1);
        await expect(appPage.getByRole('button', { name: /bullet list/i })).toHaveAttribute('aria-pressed', 'true');

        // The card summary is built from the prompt as text: no tags, and the gap shows its answer.
        await appPage.getByRole('button', { name: /collapse question 1/i }).click();
        const summary = builder.questionCard(0);
        await expect(summary).toContainText('The cat sat on the mat');
        await expect(summary).not.toContainText('<');
        await expect(summary).not.toContainText('{{');
    });
});
