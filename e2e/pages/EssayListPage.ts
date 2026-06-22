import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class EssayListPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/essays');
    }

    essayCard(title: string): Locator {
        return this.page.locator('.card').filter({ has: this.page.getByRole('heading', { name: title }) });
    }

    cardTitles() {
        return this.page.locator('.card h3').allTextContents();
    }

    dragHandle(title: string): Locator {
        return this.essayCard(title).getByLabel(/drag to reorder/i);
    }
}
