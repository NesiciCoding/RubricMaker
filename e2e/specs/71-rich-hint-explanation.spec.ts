/** Hints and explanations are rich text: the editor opens from "More options" and keeps its formatting. */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('question hint and explanation — rich text', () => {
    test('both fields are rich editors that keep bold text', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('short-answer');

        const card = builder.questionCard(0);
        await card.getByRole('button', { name: /hint/i }).first().click();

        // Each field is a label plus its own toolbar and editor in one block, so scope to the label's parent.
        const field = (label: RegExp) => card.locator('label', { hasText: label }).locator('xpath=..');

        const hintBlock = field(/hint/i);
        const hint = hintBlock.getByRole('textbox', { name: /hint/i });
        await hint.fill('Think about the verb');
        await hint.press('ControlOrMeta+a');
        await hintBlock.getByTitle(/^bold/i).click();
        await expect(hintBlock.locator('.essay-editor-content strong')).toContainText('Think about the verb');

        const explanationBlock = field(/explanation/i);
        const explanation = explanationBlock.getByRole('textbox', { name: /explanation/i });
        await explanation.fill('The past tense takes -ed');
        await expect(explanation).toContainText('The past tense takes -ed');
        // The hint keeps its own text and formatting.
        await expect(hintBlock.locator('.essay-editor-content strong')).toContainText('Think about the verb');
    });
});
