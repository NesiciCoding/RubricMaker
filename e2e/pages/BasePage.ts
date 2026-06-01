import type { Page } from '@playwright/test';

export class BasePage {
    constructor(protected page: Page) {}

    async navigate(path: string): Promise<void> {
        // Navigate to the target hash route, then force a hard reload.
        // Navigating between same-origin hash routes does NOT reload the page,
        // so React keeps its stale in-memory state and ignores anything written
        // to localStorage via seedStorage.evaluate(). reload() guarantees a
        // fresh React mount that reads the updated localStorage.
        await this.page.goto(`/#${path}`);
        await this.page.reload();
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
