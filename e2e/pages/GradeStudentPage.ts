import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class GradeStudentPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(rubricId: string, studentId: string): Promise<void> {
        await this.navigate(`/rubrics/${rubricId}/grade/${studentId}`);
    }

    async selectLevel(criterionIndex: number, levelLabel: string): Promise<void> {
        const levelBtns = this.page.locator('.level-btn').filter({ hasText: levelLabel });
        await levelBtns.nth(criterionIndex).click();
    }

    getLevelBtn(levelLabel: string, criterionIndex = 0) {
        return this.page.locator('.level-btn').filter({ hasText: levelLabel }).nth(criterionIndex);
    }

    isLevelSelected(levelLabel: string, criterionIndex = 0) {
        return this.getLevelBtn(levelLabel, criterionIndex).evaluate((el) =>
            el.classList.contains('selected')
        );
    }

    async fillCriterionComment(criterionIndex: number, text: string): Promise<void> {
        const textareas = this.page.getByPlaceholder('Add a comment…');
        await textareas.nth(criterionIndex).fill(text);
    }

    async save(): Promise<void> {
        await this.page.getByRole('button').filter({ hasText: /^save$/i }).click();
    }

    async waitForSaved(): Promise<void> {
        await this.page.getByRole('button').filter({ hasText: /saved!/i }).waitFor({ timeout: 5_000 });
    }

    getGradeSummary() {
        return this.page.locator('[role="status"][aria-label="Grade summary"]');
    }
}
