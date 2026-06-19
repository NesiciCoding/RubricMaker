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
        return this.getLevelBtn(levelLabel, criterionIndex).evaluate((el) => el.classList.contains('selected'));
    }

    async fillCriterionComment(criterionIndex: number, text: string): Promise<void> {
        // TipTap renders as .ProseMirror contenteditable div — use click+type
        // instead of fill() to avoid continuous re-renders that make the save
        // button unstable.
        const editor = this.page.locator('.ProseMirror[contenteditable="true"]').nth(criterionIndex);
        await editor.click();
        await this.page.keyboard.type(text);
    }

    async save(): Promise<void> {
        await this.page.locator('.topbar button.btn-primary').click({ force: true });
    }

    async waitForSaved(): Promise<void> {
        await this.page.locator('.topbar button.btn-primary').filter({ hasText: /saved/i }).waitFor({ timeout: 5_000 });
    }

    getGradeSummary() {
        return this.page.locator('[role="status"][aria-label="Grade summary"]');
    }

    getGradeFooter() {
        return this.page.locator('.grade-footer');
    }

    getStepper() {
        return this.page.locator('.touch-stepper');
    }
}
