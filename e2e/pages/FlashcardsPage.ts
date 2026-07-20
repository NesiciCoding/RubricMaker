import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class FlashcardsPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/flashcards');
    }

    async clickNewDeck(): Promise<void> {
        await this.page.getByRole('button', { name: 'New deck' }).first().click();
    }

    deckCard(name: string): Locator {
        return this.page.locator('.card').filter({ hasText: name }).last();
    }

    async deleteDeck(name: string): Promise<void> {
        await this.deckCard(name).getByLabel('Delete deck').click();
    }

    async confirmDelete(): Promise<void> {
        await this.page
            .getByRole('dialog')
            .getByRole('button', { name: /^delete$/i })
            .click();
    }

    emptyState(): Locator {
        return this.page.locator('.empty-state');
    }
}
