import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class RubricBuilderPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async gotoNew(): Promise<void> {
        await this.navigate('/rubrics/new');
    }

    async gotoEdit(id: string): Promise<void> {
        await this.navigate(`/rubrics/${id}`);
    }

    async fillName(name: string): Promise<void> {
        const input = this.page.getByPlaceholder('Rubric Name...');
        await input.clear();
        await input.fill(name);
    }

    async fillSubject(subject: string): Promise<void> {
        const input = this.page.getByPlaceholder('Subject / Grade...');
        await input.clear();
        await input.fill(subject);
    }

    async addFirstCriterion(): Promise<void> {
        // New rubrics always start with one criterion; only click if truly empty
        const btn = this.page.getByRole('button', { name: /add first criterion/i });
        if (await btn.isVisible()) await btn.click();
    }

    async addCriterionRow(): Promise<void> {
        await this.page.getByRole('button', { name: /add row/i }).click();
    }

    async fillCriterionTitle(index: number, title: string): Promise<void> {
        const inputs = this.page.getByPlaceholder('Criterion Name');
        await inputs.nth(index).clear();
        await inputs.nth(index).fill(title);
    }

    async save(): Promise<void> {
        await this.page.getByRole('button').filter({ hasText: /^save$/i }).click();
    }

    async waitForSaved(): Promise<void> {
        await this.page.getByRole('button').filter({ hasText: /saved!/i }).waitFor({ timeout: 5_000 });
    }

    async openVersionHistory(): Promise<void> {
        await this.page.locator('button.btn-ghost.btn-sm').filter({ hasText: /history/i }).click();
    }

    async saveVersion(label?: string): Promise<void> {
        if (label) {
            await this.page.getByPlaceholder(/label.*optional/i).fill(label);
        }
        await this.page.getByRole('button', { name: /save snapshot/i }).click();
    }

    async restoreVersion(index: number): Promise<void> {
        this.page.once('dialog', (dialog) => dialog.accept());
        const restoreButtons = this.page.getByRole('button', { name: /restore/i });
        await restoreButtons.nth(index).click();
    }

    getNameError() {
        return this.page.locator('#name-error');
    }
}
