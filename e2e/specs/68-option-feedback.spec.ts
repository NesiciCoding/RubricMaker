/** Per-option feedback on a multiple-choice question: the speech-bubble button reveals a field, and the text sticks. */
import { test, expect } from '../fixtures/app.fixture';
import { TestBuilderPage } from '../pages/TestBuilderPage';

test.describe('multiple choice — option feedback', () => {
    test('an option can carry feedback that survives collapsing the card', async ({ appPage }) => {
        const builder = new TestBuilderPage(appPage);
        await builder.gotoNew();
        await builder.addQuestion('multiple-choice');

        const card = builder.questionCard(0);
        await expect(card.getByRole('textbox', { name: 'Feedback for this option' })).toHaveCount(0);
        await card.getByRole('button', { name: 'Feedback for this option' }).first().click();

        const field = card.getByRole('textbox', { name: 'Feedback for this option' });
        await field.fill('Close, but check the verb tense.');
        await expect(field).toHaveValue('Close, but check the verb tense.');

        await appPage.getByRole('button', { name: /collapse question 1/i }).click();
        await appPage.getByRole('button', { name: /expand question 1/i }).click();
        // A field with content stays open without being toggled.
        await expect(builder.questionCard(0).getByRole('textbox', { name: 'Feedback for this option' })).toHaveValue(
            'Close, but check the verb tense.'
        );
    });
});
