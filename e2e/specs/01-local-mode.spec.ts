import { test, expect } from '../fixtures/app.fixture';

test.describe('Local mode entry', () => {
    test('dashboard loads when rm_local_mode is pre-set', async ({ appPage }) => {
        await appPage.goto('/');
        await expect(appPage.locator('.main-area')).toBeVisible();
        await expect(appPage.getByText('Continue without account')).not.toBeVisible();
    });

    test('landing page shows when rm_local_mode is absent', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Continue without account')).toBeVisible({ timeout: 10_000 });
    });

    test('clicking Continue without account enters local mode', async ({ page }) => {
        await page.goto('/');
        await page.getByText('Continue without account').click();
        await expect(page.locator('.main-area')).toBeVisible({ timeout: 10_000 });
        const localMode = await page.evaluate(() => localStorage.getItem('rm_local_mode'));
        expect(localMode).toBe('true');
    });

    test('deep-link to /rubrics loads in local mode', async ({ appPage }) => {
        await appPage.goto('/rubrics');
        await expect(appPage.locator('.main-area')).toBeVisible();
        await expect(appPage).toHaveURL(/\/rubrics/);
    });

    test('sidebar navigation is visible after local mode entry', async ({ appPage }) => {
        await appPage.goto('/');
        // The two-tier nav only shows the active domain's sub-items — at `/` that's
        // Overview (Dashboard), with the Assessments rail icon as the entry point to Rubrics.
        await expect(appPage.locator('[data-tour="/"]')).toBeVisible();
        await expect(appPage.locator('[data-tour="rail:assessments"]')).toBeVisible();
    });
});
