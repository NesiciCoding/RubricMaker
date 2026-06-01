import type { Page, Download } from '@playwright/test';
import { BasePage } from './BasePage';

export class ExportPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/export');
    }

    async selectRubric(rubricName: string): Promise<void> {
        const select = this.page.locator('select').first();
        await select.selectOption({ label: rubricName });
    }

    async selectRubricById(rubricId: string): Promise<void> {
        const select = this.page.locator('select').first();
        await select.selectOption({ value: rubricId });
    }

    async toggleStudent(studentName: string): Promise<void> {
        const row = this.page.getByRole('row', { name: new RegExp(`\\b${studentName}\\b`) });
        await row.getByRole('checkbox').first().click();
    }

    async selectAllStudents(): Promise<void> {
        await this.page.getByRole('button', { name: /select all/i }).click();
    }

    async exportPdf(): Promise<Download> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: /print.*pdf/i }).click(),
        ]);
        return download;
    }

    async exportDocx(): Promise<Download> {
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: /export word/i }).click(),
        ]);
        return download;
    }
}
