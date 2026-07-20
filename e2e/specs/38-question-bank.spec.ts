/**
 * Item 38 — Question Bank manager (roadmap Phase 24.1, extended with bulk
 * actions/import/pagination in a later unnumbered pass — see git log
 * "Question Bank: full content editor, advanced search/filter, bulk actions,
 * pagination").
 *
 * The `/question-bank` route had zero e2e coverage of any kind before this
 * file — found while auditing routes for coverage gaps after closing out
 * items 36/37. Offline-capable (no Supabase needed), like the rest of the
 * rubric/comment-bank CRUD specs.
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildQuestionBankItem } from '../fixtures/data.factory';
import { QuestionBankPage } from '../pages/QuestionBankPage';

test.describe('Question Bank', () => {
    test('shows an empty state with no items', async ({ appPage }) => {
        const page = new QuestionBankPage(appPage);
        await page.goto();
        await expect(page.emptyState()).toBeVisible();
    });

    test('search filters items by prompt text', async ({ appPage, seedStorage }) => {
        const capital = buildQuestionBankItem({
            question: {
                id: 'q1',
                prompt: 'What is the capital of France?',
                type: 'short-answer',
                points: 2,
                expectedAnswer: 'Paris',
            },
        });
        const math = buildQuestionBankItem({
            question: { id: 'q2', prompt: 'What is 7 times 8?', type: 'short-answer', points: 2, expectedAnswer: '56' },
        });
        await seedStorage({ rm_question_bank: [capital, math] });

        const page = new QuestionBankPage(appPage);
        await page.goto();
        await expect(appPage.getByText('What is the capital of France?')).toBeVisible();
        await expect(appPage.getByText('What is 7 times 8?')).toBeVisible();

        await page.search('capital');
        await expect(appPage.getByText('What is the capital of France?')).toBeVisible();
        await expect(appPage.getByText('What is 7 times 8?')).not.toBeVisible();
    });

    test('editing an item saves the new prompt', async ({ appPage, seedStorage }) => {
        const item = buildQuestionBankItem({
            question: { id: 'q1', prompt: 'Original prompt', type: 'short-answer', points: 1, expectedAnswer: 'x' },
        });
        await seedStorage({ rm_question_bank: [item] });

        const page = new QuestionBankPage(appPage);
        await page.goto();
        await page.editItem('Original prompt');

        const dialog = appPage.getByRole('dialog');
        await expect(dialog).toBeVisible();
        // Question prompts are a TipTap rich-text editor (see TestBuilderPage.setQuestionPrompt).
        const promptField = dialog.locator('.essay-editor-content').first();
        await promptField.fill('Edited prompt');
        await dialog.getByRole('button', { name: /^save$/i }).click();

        await expect(appPage.getByText('Edited prompt')).toBeVisible({ timeout: 5_000 });
        await expect(appPage.getByText('Original prompt')).not.toBeVisible();
    });

    test('deleting an item removes it after confirming', async ({ appPage, seedStorage }) => {
        const item = buildQuestionBankItem({
            question: { id: 'q1', prompt: 'Delete me please', type: 'short-answer', points: 1, expectedAnswer: 'x' },
        });
        await seedStorage({ rm_question_bank: [item] });

        const page = new QuestionBankPage(appPage);
        await page.goto();
        await expect(appPage.getByText('Delete me please')).toBeVisible();

        await page.deleteItem('Delete me please');
        await page.confirmDialogAccept();

        await expect(appPage.getByText('Delete me please')).not.toBeVisible({ timeout: 5_000 });
        await expect(page.emptyState()).toBeVisible();
    });

    test('bulk-selecting items and adding a tag applies it to all selected', async ({ appPage, seedStorage }) => {
        const a = buildQuestionBankItem({
            question: { id: 'q1', prompt: 'Bulk item A', type: 'short-answer', points: 1, expectedAnswer: 'x' },
        });
        const b = buildQuestionBankItem({
            question: { id: 'q2', prompt: 'Bulk item B', type: 'short-answer', points: 1, expectedAnswer: 'y' },
        });
        await seedStorage({ rm_question_bank: [a, b] });

        const page = new QuestionBankPage(appPage);
        await page.goto();

        await page.selectItem('Bulk item A');
        await page.selectItem('Bulk item B');
        await page.bulkAddTag('reviewed');

        await expect(page.itemCard('Bulk item A').getByText('reviewed')).toBeVisible({ timeout: 5_000 });
        await expect(page.itemCard('Bulk item B').getByText('reviewed')).toBeVisible();
    });
});
