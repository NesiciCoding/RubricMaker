import { test, expect } from '../fixtures/app.fixture';

const navItems = [
    { tour: '/', label: 'Dashboard', url: '/' },
    { tour: '/rubrics', label: 'Rubrics', url: '/rubrics' },
    { tour: '/students', label: 'Students', url: '/students' },
    { tour: '/export', label: 'Export', url: '/export' },
    { tour: '/statistics', label: 'Statistics', url: '/statistics' },
    { tour: '/comments', label: 'Comments', url: '/comments' },
    { tour: '/settings', label: 'Settings', url: '/settings' },
];

test.describe('Sidebar navigation', () => {
    test.beforeEach(async ({ appPage }) => {
        await appPage.goto('/#/');
    });

    for (const { tour, url } of navItems) {
        test(`[data-tour="${tour}"] navigates to ${url}`, async ({ appPage }) => {
            await appPage.click(`[data-tour="${tour}"]`);
            await expect(appPage).toHaveURL(new RegExp(url.replace('/', '\\/') + '($|\\?|#)'), {
                timeout: 10_000,
            });
            await expect(appPage.locator('.main-area')).toBeVisible();
        });
    }

    test('sidebar collapses and labels hide', async ({ appPage }) => {
        const collapseBtn = appPage.locator('.sidebar-collapse-btn');
        await collapseBtn.click();
        const nav = appPage.locator('[data-collapsed="true"]');
        await expect(nav).toBeVisible({ timeout: 3_000 });
    });

    test('sidebar expands after collapsing', async ({ appPage }) => {
        const collapseBtn = appPage.locator('.sidebar-collapse-btn');
        await collapseBtn.click();
        await appPage.locator('[data-collapsed="true"]').waitFor();
        await collapseBtn.click();
        await expect(appPage.locator('[data-collapsed="true"]')).not.toBeVisible({ timeout: 3_000 });
    });

    test('unknown route shows 404 page', async ({ appPage }) => {
        await appPage.goto('about:blank');
        await appPage.goto('/#/this-route-does-not-exist-xyz');
        await appPage.waitForSelector('.main-area', { timeout: 10_000 });
        await expect(appPage.getByText(/not found|404/i)).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('Mobile navigation', () => {
    test('mobile menu button is visible on small viewport', async ({ appPage }) => {
        await appPage.setViewportSize({ width: 390, height: 844 });
        await appPage.goto('/#/');
        const mobileMenuBtn = appPage.locator('button[aria-label*="menu" i], .mobile-menu-btn, button:has-text("Menu")');
        await expect(mobileMenuBtn.first()).toBeVisible({ timeout: 5_000 });
    });
});
