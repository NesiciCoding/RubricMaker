import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class QuestionBankPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/question-bank');
    }

    async search(text: string): Promise<void> {
        await this.page.getByPlaceholder('Search questions...').fill(text);
    }

    // QuestionBankPage.tsx wraps the whole manager in its own outer `.card`, so a plain
    // `.card` filter matches that wrapper (which contains every item's text) in addition
    // to the specific item's own `.card` — `.last()` picks the innermost, actual item card.
    itemCard(promptText: string): Locator {
        return this.page.locator('.card').filter({ hasText: promptText }).last();
    }

    async deleteItem(promptText: string): Promise<void> {
        await this.itemCard(promptText).getByRole('button', { name: 'Delete' }).click();
    }

    async confirmDialogAccept(): Promise<void> {
        await this.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    }

    async editItem(promptText: string): Promise<void> {
        await this.itemCard(promptText).getByRole('button', { name: 'Edit' }).click();
    }

    async selectItem(promptText: string): Promise<void> {
        await this.itemCard(promptText).getByLabel('Select this item').check();
    }

    bulkBar(): Locator {
        // Buttons/inputs follow the "N selected" label in the same flex container, so
        // it's never the end of the element's text — no `$` anchor.
        return this.page
            .locator('.card')
            .filter({ hasText: /\d+ selected/ })
            .last();
    }

    async bulkAddTag(tag: string): Promise<void> {
        await this.bulkBar().getByPlaceholder('Tag').fill(tag);
        await this.bulkBar().getByRole('button', { name: 'Add tag' }).click();
    }

    async bulkDelete(): Promise<void> {
        await this.bulkBar().getByRole('button', { name: 'Delete' }).click();
    }

    emptyState(): Locator {
        return this.page.getByText(/no questions saved yet/i);
    }
}
