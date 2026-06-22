import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class ModerationQueuePage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/moderation');
    }

    async setThreshold(value: number): Promise<void> {
        await this.page.locator('input[type="number"]').fill(String(value));
    }

    disputeCard(studentName: string): Locator {
        return this.page.locator('.card').filter({ hasText: studentName });
    }

    async keepOriginal(studentName: string): Promise<void> {
        await this.disputeCard(studentName)
            .getByRole('button', { name: /keep original/i })
            .click();
    }

    async acceptSecondMarker(studentName: string): Promise<void> {
        await this.disputeCard(studentName)
            .getByRole('button', { name: /accept second marker/i })
            .click();
    }

    emptyState(): Locator {
        return this.page.getByText(/no disputed gradings/i);
    }
}
