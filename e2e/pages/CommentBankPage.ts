import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class CommentBankPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/comments');
    }

    async fillSnippetText(text: string): Promise<void> {
        await this.page.getByRole('button', { name: /^new$/i }).click();
        await this.page.getByPlaceholder('Write your comment here...').fill(text);
    }

    async addSnippet(): Promise<void> {
        await this.page.getByRole('button', { name: /^save$/i }).click();
    }

    async searchSnippets(term: string): Promise<void> {
        await this.page.getByPlaceholder('Search comments...').fill(term);
    }

    getSnippetItems() {
        return this.page.locator('.card');
    }

    async deleteSnippet(index: number): Promise<void> {
        const deleteButtons = this.page.getByRole('button', { name: /delete/i });
        await deleteButtons.nth(index).click();
    }

    isSnippetVisible(text: string) {
        return this.page.getByText(text, { exact: true }).isVisible();
    }
}
