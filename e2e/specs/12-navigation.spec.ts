import { test, expect } from '../fixtures/app.fixture';

// Two-tier nav: each sub-item only renders once its domain's rail icon is active.
// `rail` is omitted for items in the Overview domain, which is active by default at `/`.
const navItems = [
    { tour: '/', label: 'Dashboard', url: '/', rail: null },
    { tour: '/rubrics', label: 'Rubrics', url: '/rubrics', rail: 'rail:assessments' },
    { tour: '/students', label: 'Students', url: '/students', rail: 'rail:students' },
    { tour: '/export', label: 'Export', url: '/export', rail: 'rail:insights' },
    { tour: '/statistics', label: 'Statistics', url: '/statistics', rail: 'rail:insights' },
    { tour: '/comments', label: 'Comments', url: '/comments', rail: 'rail:library' },
    { tour: '/settings', label: 'Settings', url: '/settings', rail: null }, // footer link, not domain-gated
];

test.describe('Sidebar navigation', () => {
    test.beforeEach(async ({ appPage }) => {
        await appPage.goto('/#/');
    });

    for (const { tour, url, rail } of navItems) {
        test(`[data-tour="${tour}"] navigates to ${url}`, async ({ appPage, isMobile }) => {
            if (isMobile) {
                // Sidebar is an off-canvas drawer on mobile — open it via the hamburger first.
                await appPage.locator('.topbar-menu-btn').click();
                await expect(appPage.locator('.sidebar')).toHaveClass(/mobile-open/);
            }
            if (rail) {
                await appPage.click(`[data-tour="${rail}"]`);
                if (isMobile) {
                    // Switching domains navigates, which auto-closes the mobile drawer — reopen
                    // it before clicking the now-revealed sub-item.
                    await appPage.locator('.topbar-menu-btn').click();
                    await expect(appPage.locator('.sidebar')).toHaveClass(/mobile-open/);
                }
            }
            await appPage.click(`[data-tour="${tour}"]`);
            await expect(appPage).toHaveURL(new RegExp(url.replace('/', '\\/') + '($|\\?|#)'), {
                timeout: 10_000,
            });
            await expect(appPage.locator('.main-area')).toBeVisible();
        });
    }

    test('rail highlights the active domain when switching sections', async ({ appPage, isMobile }) => {
        if (isMobile) {
            await appPage.locator('.topbar-menu-btn').click();
            await expect(appPage.locator('.sidebar')).toHaveClass(/mobile-open/);
        }
        await appPage.click('[data-tour="rail:students"]');
        await expect(appPage.locator('[data-tour="rail:students"]')).toHaveClass(/active/);
        await expect(appPage.locator('[data-tour="/students"]')).toBeVisible();
    });

    test('unknown route shows 404 page', async ({ appPage }) => {
        await appPage.goto('/#/this-route-does-not-exist-xyz');
        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 10_000 });
        await expect(appPage.getByRole('heading', { name: /404/i })).toBeVisible({ timeout: 10_000 });
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
