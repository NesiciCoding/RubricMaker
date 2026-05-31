import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/');
    }

    async gotoNewRubric(): Promise<void> {
        await this.page.click('a[href*="/rubrics/new"], button:has-text("New Rubric")');
        await this.waitForRoute('/rubrics/new');
    }

    getSidebar() {
        return this.page.locator('nav, aside').first();
    }
}
