import { test, expect } from '../fixtures/app.fixture';
import { CommentBankPage } from '../pages/CommentBankPage';

test.describe('Comment bank', () => {
    test('add a snippet and it appears in the list', async ({ appPage }) => {
        const page = new CommentBankPage(appPage);
        await page.goto();

        await page.fillSnippetText('Great effort on vocabulary use!');
        await page.addSnippet();

        await expect(appPage.getByText('Great effort on vocabulary use!')).toBeVisible({ timeout: 5_000 });
    });

    test('search filters snippets', async ({ appPage, seedStorage }) => {
        await seedStorage({
            rm_comment_snippets: [
                { id: 'cs-1', text: 'Excellent grammar work', tag: 'positive' },
                { id: 'cs-2', text: 'Needs more vocabulary practice', tag: 'improvement' },
            ],
        });

        const page = new CommentBankPage(appPage);
        await page.goto();

        await page.searchSnippets('grammar');
        await expect(appPage.getByText('Excellent grammar work')).toBeVisible();
        await expect(appPage.getByText('Needs more vocabulary practice')).not.toBeVisible();
    });

    test('comment bank page loads without error', async ({ appPage }) => {
        const page = new CommentBankPage(appPage);
        await page.goto();
        await expect(appPage.locator('.main-area')).toBeVisible();
    });
});
