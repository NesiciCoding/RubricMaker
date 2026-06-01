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
        await page.addInitScript((s) => {
            localStorage.setItem('rm_local_mode', 'true');
            // Only seed settings if not already present, so persistence tests survive reload
            if (!localStorage.getItem('rm_settings')) {
                localStorage.setItem('rm_settings', JSON.stringify(s));
            }
        }, settings);
        await use(page);
    },

    seedStorage: async ({ page }, use) => {
        const seed = async (data: Record<string, unknown>) => {
            await page.addInitScript((d) => {
                Object.entries(d).forEach(([k, v]) => {
                    localStorage.setItem(k, JSON.stringify(v));
                });
            }, data);
        };
        await use(seed);
    },
});

export { expect } from '@playwright/test';
