import type { Page } from '@playwright/test';

export class BasePage {
    constructor(protected page: Page) {}

    async navigate(path: string): Promise<void> {
        await this.page.goto(`/#${path}`);
        await this.page.waitForSelector('.main-area', { timeout: 10_000 });
    }

    async waitForRoute(path: string): Promise<void> {
        await this.page.waitForURL(`**/#${path}`, { timeout: 10_000 });
    }

    async clickNavItem(tourPath: string): Promise<void> {
        await this.page.click(`[data-tour="${tourPath}"]`);
    }

    getToast() {
        return this.page.locator('[role="status"]:not([aria-label="Grade summary"])').first();
    }
}
