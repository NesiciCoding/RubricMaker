import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class NewsFlashesPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/news-flashes');
    }

    // Two "New flash" buttons render when the list is empty (Topbar action + empty-state
    // CTA) — .first() always resolves to one of them, either is fine to click.
    async openCreate(): Promise<void> {
        await this.page.getByRole('button', { name: 'New flash' }).first().click();
    }

    modal(): Locator {
        return this.page.getByRole('dialog');
    }

    async fillTitle(title: string): Promise<void> {
        await this.modal().locator('#nf-title').fill(title);
    }

    async fillSummary(summary: string): Promise<void> {
        await this.modal().locator('#nf-summary').fill(summary);
    }

    async selectKind(kind: 'article' | 'book' | 'video'): Promise<void> {
        await this.modal().locator('#nf-kind').selectOption(kind);
    }

    async save(): Promise<void> {
        await this.modal()
            .getByRole('button', { name: /^save$/i })
            .click();
    }

    flashCard(title: string): Locator {
        return this.page.locator('.card').filter({ hasText: title }).last();
    }

    async editFlash(title: string): Promise<void> {
        await this.flashCard(title).getByLabel('Edit flash').click();
    }

    async deleteFlash(title: string): Promise<void> {
        await this.flashCard(title).getByLabel('Delete flash').click();
    }

    async confirmDelete(): Promise<void> {
        await this.page
            .getByRole('dialog')
            .getByRole('button', { name: /^delete$/i })
            .click();
    }

    async expandReadReceipts(title: string): Promise<void> {
        await this.flashCard(title).getByText(/read$/).click();
    }

    emptyState(): Locator {
        return this.page.locator('.empty-state');
    }
}
