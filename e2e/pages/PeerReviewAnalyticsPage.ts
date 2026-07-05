import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class PeerReviewAnalyticsPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(rubricId: string): Promise<void> {
        await this.navigate(`/peer-analytics/${rubricId}`);
    }

    async selectRound(round: number | 'all'): Promise<void> {
        const label = round === 'all' ? /all rounds/i : new RegExp(`round ${round}\\b`, 'i');
        await this.page.getByRole('button', { name: label }).click();
    }

    reviewerRows() {
        return this.page.locator('.data-table tbody tr');
    }

    emptyState() {
        return this.page.getByText(/no peer reviews have been submitted/i);
    }

    heatmap() {
        return this.page.locator('.card').filter({ hasText: /feedback heatmap/i });
    }

    trendChart() {
        return this.page.locator('.recharts-responsive-container');
    }
}
