import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class PeerReviewViewPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(rubricId: string, studentId: string, reviewerId?: string): Promise<void> {
        const suffix = reviewerId ? `?reviewerId=${reviewerId}` : '';
        await this.navigate(`/rubrics/${rubricId}/peer-review/${studentId}${suffix}`);
    }

    async selectLevel(criterionIndex: number, levelLabel: string): Promise<void> {
        await this.page
            .locator('.card.selectable')
            .filter({ hasText: levelLabel })
            .nth(criterionIndex)
            .click();
    }

    async fillCriterionComment(criterionIndex: number, text: string): Promise<void> {
        const editor = this.page.locator('.ProseMirror[contenteditable="true"]').nth(criterionIndex);
        await editor.click();
        await this.page.keyboard.type(text);
    }

    async save(): Promise<void> {
        await this.page.locator('.topbar button.btn-primary, .topbar button.btn-success').first().click();
    }

    async waitForSaved(): Promise<void> {
        await this.page.locator('.topbar button.btn-success').waitFor({ timeout: 5_000 });
    }

    roundButton(round: number) {
        return this.page.getByRole('button', { name: new RegExp(`round ${round}\\b`, 'i') });
    }

    async selectRound(round: number): Promise<void> {
        await this.roundButton(round).click();
    }

    async addRound(): Promise<void> {
        await this.page.getByRole('button', { name: /add round/i }).click();
    }

    async goToAnalytics(): Promise<void> {
        await this.page.getByRole('button', { name: /view analytics/i }).click();
    }
}
