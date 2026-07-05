import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class StudentLearningPathPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(studentId: string): Promise<void> {
        await this.navigate(`/students/${studentId}/learning-path`);
    }

    async goToCefrOverview(): Promise<void> {
        await this.page.getByRole('button', { name: /cefr/i }).click();
    }

    async goToVocabulary(): Promise<void> {
        await this.page.getByRole('button', { name: /vocabulary/i }).click();
    }

    async openRubric(rubricName: string): Promise<void> {
        await this.page.getByRole('button', { name: rubricName }).click();
    }
}
