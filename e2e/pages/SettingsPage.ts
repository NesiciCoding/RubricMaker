import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SettingsPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/settings');
    }

    async selectTheme(value: 'light' | 'dark'): Promise<void> {
        await this.page.locator('#setting-theme').selectOption(value);
    }

    async getThemeValue(): Promise<string> {
        return this.page.locator('#setting-theme').inputValue();
    }

    getHtmlThemeClass(): Promise<string | null> {
        return this.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    }
}
