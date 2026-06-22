import type { Page, Locator } from '@playwright/test';

export class BasePage {
    constructor(protected page: Page) {}

    /**
     * Drags `source` onto `target` using raw mouse events with intermediate
     * move steps — @hello-pangea/dnd (a fork of react-beautiful-dnd) listens
     * for native pointer events and ignores Playwright's single-step dragTo().
     */
    async dragReorder(source: Locator, target: Locator): Promise<void> {
        const sourceBox = await source.boundingBox();
        const targetBox = await target.boundingBox();
        if (!sourceBox || !targetBox) throw new Error('dragReorder: missing bounding box for source or target');

        await this.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await this.page.mouse.down();
        await this.page.waitForTimeout(200);
        await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
            steps: 20,
        });
        await this.page.waitForTimeout(200);
        await this.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2 + 2, {
            steps: 5,
        });
        await this.page.mouse.up();
        await this.page.waitForTimeout(200);
    }

    async navigate(path: string): Promise<void> {
        // Navigate to the target hash route, then force a hard reload.
        // Navigating between same-origin hash routes does NOT reload the page,
        // so React keeps its stale in-memory state and ignores anything written
        // to localStorage via seedStorage.evaluate(). reload() guarantees a
        // fresh React mount that reads the updated localStorage.
        await this.page.goto(`/#${path}`);
        await this.page.reload();
        await this.page.waitForSelector('.main-area', { timeout: 20_000 });
        // Wait for any in-flight network requests (e.g. Supabase hydration) to
        // finish before the test interacts with the page. In offline/local mode
        // this resolves immediately since there are no network requests.
        await this.page.waitForLoadState('networkidle', { timeout: 15_000 });
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
