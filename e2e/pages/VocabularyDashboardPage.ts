import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class VocabularyDashboardPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/vocabulary');
    }

    async filterByClass(className: string): Promise<void> {
        await this.page.locator('#vocab-class-filter').selectOption({ label: className });
    }

    async setExportBand(band: 'all' | string): Promise<void> {
        await this.page.locator('#vocab-export-band').selectOption(band === 'all' ? { index: 0 } : { label: band });
    }

    async exportCsv() {
        const [download] = await Promise.all([
            this.page.waitForEvent('download'),
            this.page.getByRole('button', { name: /export vocabulary csv/i }).click(),
        ]);
        return download;
    }

    studentDrilldownRows() {
        return this.page.locator('table tbody tr');
    }
}
