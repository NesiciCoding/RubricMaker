import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class StudentCefrOverviewPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(studentId: string): Promise<void> {
        await this.navigate(`/students/${studentId}/cefr-overview`);
    }

    async copyShareLink(): Promise<void> {
        // Two identical share buttons exist (header + bottom action row) — use the first.
        await this.page.getByRole('button', { name: /copy overview link/i }).first().click();
    }

    async goToLearningPath(): Promise<void> {
        await this.page.getByRole('button', { name: /learning path/i }).click();
    }

    async goToVocabulary(): Promise<void> {
        await this.page.getByRole('button', { name: /vocabulary/i }).click();
    }

    canDoGrid() {
        return this.page.locator('.card').filter({ hasText: /can-do/i });
    }
}
