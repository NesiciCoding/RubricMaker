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
        await this.page.getByRole('button', { name: new RegExp(`open ${studentName}'s cefr detail`, 'i') }).click();
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
