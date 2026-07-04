import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SelfAssessmentPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(rubricId: string, studentId: string): Promise<void> {
        await this.navigate(`/rubrics/${rubricId}/self-assess/${studentId}`);
    }

    // TODO: fill in once specs are written — one confidence button per descriptor,
    // levels are "Not yet" / "Sometimes" / "Usually" / "Confident" in order.
    async setConfidence(descriptorIndex: number, levelLabel: string): Promise<void> {
        const card = this.page.locator('.card').nth(descriptorIndex + 2); // +2 skips header + intro cards
        await card.getByRole('button', { name: levelLabel }).click();
    }

    async fillReflection(text: string): Promise<void> {
        await this.page.locator('textarea').fill(text);
    }

    async save(): Promise<void> {
        await this.page.locator('.topbar button.btn-primary').click();
    }

    async waitForSaved(): Promise<void> {
        await this.page.locator('.topbar button').filter({ hasText: /saved/i }).waitFor({ timeout: 5_000 });
    }

    ratedCount() {
        return this.page.locator('.page-content .card').first().locator('text=/\\d+\\/\\d+/');
    }
}
