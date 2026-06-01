import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildSettings } from './data.factory';

export type AppFixtures = {
    appPage: Page;
    seedStorage: (data: Record<string, unknown>) => Promise<void>;
};

export const test = base.extend<AppFixtures>({
    appPage: async ({ page }, use) => {
        const settings = buildSettings();
        // Register init script so local mode + settings survive every navigation/reload
        await page.addInitScript((s) => {
            localStorage.setItem('rm_local_mode', 'true');
            // Only seed settings if not already present, so persistence tests survive reload
            if (!localStorage.getItem('rm_settings')) {
                localStorage.setItem('rm_settings', JSON.stringify(s));
            }
        }, settings);
        // Navigate once so the page has a DOM context — required for seedStorage.evaluate()
        await page.goto('/#/');
        await page.waitForSelector('.main-area', { timeout: 15_000 });
        await use(page);
    },

    seedStorage: async ({ appPage }, use) => {
        // Depend on appPage so appPage's initial navigation has already run (avoids
        // SecurityError on about:blank). Use addInitScript so the seed data is written
        // BEFORE React's loadStore() runs — evaluate() writes after mount and React never
        // re-reads localStorage, so the seeded data would be invisible to the app.
        const seed = async (data: Record<string, unknown>) => {
            await appPage.addInitScript((d) => {
                Object.entries(d as Record<string, unknown>).forEach(([k, v]) => {
                    localStorage.setItem(k, JSON.stringify(v));
                });
            }, data);
        };
        await use(seed);
    },
});

export { expect } from '@playwright/test';
