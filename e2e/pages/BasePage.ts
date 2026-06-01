import type { Page } from '@playwright/test';

export class BasePage {
    constructor(protected page: Page) {}

    async navigate(path: string): Promise<void> {
        // Go via about:blank to guarantee a full page reload on the target URL.
        // Navigating between hash routes on the same origin is treated as a
        // fragment-change (no reload) — React keeps its stale state and ignores
        // any localStorage written by seedStorage since the last navigation.
        await this.page.goto('about:blank');
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
