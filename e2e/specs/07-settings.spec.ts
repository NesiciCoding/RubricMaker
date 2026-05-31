import { test, expect } from '../fixtures/app.fixture';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('Settings persistence', () => {
    test('theme selection persists across page reload', async ({ appPage }) => {
        const settings = new SettingsPage(appPage);
        await settings.goto();

        await settings.selectTheme('dark');
        await appPage.reload();
        await appPage.locator('.main-area').waitFor();

        await settings.goto();
        expect(await settings.getThemeValue()).toBe('dark');
    });

    test('switching theme to light persists', async ({ appPage }) => {
        const settings = new SettingsPage(appPage);
        await settings.goto();

        await settings.selectTheme('dark');
        await appPage.reload();
        await settings.goto();

        await settings.selectTheme('light');
        await appPage.reload();
        await settings.goto();
        expect(await settings.getThemeValue()).toBe('light');
    });

    test('settings page loads without error', async ({ appPage }) => {
        const settings = new SettingsPage(appPage);
        await settings.goto();
        await expect(appPage.locator('#setting-theme')).toBeVisible();
    });
});
