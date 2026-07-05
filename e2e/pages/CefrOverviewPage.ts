import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class CefrOverviewPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/cefr-overview');
    }

    async filterByClass(className: string): Promise<void> {
        await this.page.getByLabel('Class Filter').selectOption({ label: className });
    }

    async openStudentDetail(studentName: string): Promise<void> {
        // Plain string name matching is substring + case-insensitive by default —
        // avoids building a RegExp from a seeded student name that could contain
        // regex metacharacters.
        await this.page.getByRole('button', { name: `open ${studentName}'s cefr detail` }).click();
    }

    heatmap() {
        return this.page.locator('.card[data-tour="cefr-heatmap"]');
    }

    async switchToStudentView(): Promise<void> {
        await this.page.getByRole('button', { name: /student/i }).click();
    }

    async selectStudent(studentName: string): Promise<void> {
        await this.page.getByLabel('Student').selectOption({ label: studentName });
    }
}
