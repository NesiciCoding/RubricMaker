import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class RubricListPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/rubrics');
    }

    async gotoCreate(): Promise<void> {
        await this.page.click('button:has-text("New Rubric"), a:has-text("New Rubric")');
        await this.waitForRoute('/rubrics/new');
    }

    async searchFor(term: string): Promise<void> {
        const input = this.page.getByPlaceholder(/search rubrics/i);
        await input.fill(term);
    }

    getRubricCard(name: string) {
        return this.page
            .locator('.rubric-card, [data-rubric-id], .card')
            .filter({ has: this.page.getByText(name, { exact: true }) })
            .first();
    }

    async clickEditRubric(name: string): Promise<void> {
        const card = this.getRubricCard(name);
        await card.getByRole('button', { name: /edit/i }).click();
    }

    async clickDeleteRubric(name: string): Promise<void> {
        const card = this.getRubricCard(name);
        await card.getByRole('button', { name: /delete/i }).click();
    }

    async confirmDelete(): Promise<void> {
        const dialog = this.page.getByRole('dialog');
        await dialog.getByRole('button', { name: /delete/i }).click();
    }

    async cancelDelete(): Promise<void> {
        const dialog = this.page.getByRole('dialog');
        await dialog.getByRole('button', { name: /cancel/i }).click();
    }

    getRubricNames() {
        return this.page.locator('.rubric-card h3, .rubric-name, [data-rubric-name]').allTextContents();
    }

    isRubricVisible(name: string) {
        return this.page.getByText(name, { exact: true }).isVisible();
    }
}
