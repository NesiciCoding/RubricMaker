import { test as base, expect } from '@playwright/test';
import { buildSettings } from '../fixtures/data.factory';

const primary = '[data-testid="button-primary"]';
const skip = '[data-testid="button-skip"]';

const test = base.extend<{ freshProfile: void }>({
    freshProfile: [
        async ({ page }, use) => {
            await page.addInitScript(
                (s) => {
                    localStorage.setItem('rm_local_mode', 'true');
                    if (!localStorage.getItem('rm_settings')) localStorage.setItem('rm_settings', JSON.stringify(s));
                },
                buildSettings({ hasSeenTutorial: false })
            );
            await use();
        },
        { auto: true },
    ],
});

async function hasSeenTutorial(page: import('@playwright/test').Page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('rm_settings') ?? '{}').hasSeenTutorial);
}

async function openDrawerIfMobile(page: import('@playwright/test').Page, isMobile: boolean | undefined) {
    if (!isMobile) return;
    await page.locator('.topbar-menu-btn').click();
    await expect(page.locator('.sidebar')).toHaveClass(/mobile-open/);
}

test.describe('Guided tours', () => {
    test('first-run tour walks through and remembers completion', async ({ page, isMobile }) => {
        await page.goto('/#/');
        await page.waitForSelector('.main-area');
        const tooltip = page.locator('[data-testid="button-primary"]');
        await expect(tooltip).toBeVisible();

        for (let i = 0; i < 6; i++) {
            const label = (await tooltip.textContent()) ?? '';
            await tooltip.click();
            if (/last/i.test(label)) break;
            await page.waitForTimeout(isMobile ? 500 : 200);
        }

        await expect(page.locator(primary)).toHaveCount(0);
        await expect.poll(() => hasSeenTutorial(page)).toBe(true);
        if (isMobile) await expect(page.locator('.sidebar')).not.toHaveClass(/mobile-open/);
    });

    test('skipping the first-run tour also marks it as seen', async ({ page }) => {
        await page.goto('/#/');
        await page.waitForSelector(skip);
        await page.click(skip);
        await expect(page.locator(primary)).toHaveCount(0);
        await expect.poll(() => hasSeenTutorial(page)).toBe(true);
    });

    test('Help footer starts the tour for the current page', async ({ page, isMobile }) => {
        await page.goto('/#/');
        await page.waitForSelector(skip);
        await page.click(skip);
        await expect(page.locator(primary)).toHaveCount(0);

        await page.goto('/#/statistics');
        await page.waitForSelector('[data-tour="stats-controls"]');
        await openDrawerIfMobile(page, isMobile);
        await page.locator('.sidebar-footer button.nav-item').click();
        await expect(page.locator('.react-joyride__tooltip, [data-testid="floater"]').first()).toBeVisible();
        await expect(page.locator(primary)).toBeVisible();
    });

    test('pages without a tour do not offer the Help tour entry', async ({ page, isMobile }) => {
        await page.goto('/#/');
        await page.waitForSelector(skip);
        await page.click(skip);
        await page.goto('/#/settings');
        await page.waitForSelector('.main-area');
        await openDrawerIfMobile(page, isMobile);
        await expect(page.locator('.sidebar-footer button.nav-item')).toHaveCount(0);
    });
});
