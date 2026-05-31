import type { Page } from '@playwright/test';

/** Seeds arbitrary rm_* keys into localStorage before the page loads. */
export async function seedLocalStorage(page: Page, data: Record<string, unknown>): Promise<void> {
    await page.addInitScript((d) => {
        Object.entries(d).forEach(([key, value]) => {
            localStorage.setItem(key, JSON.stringify(value));
        });
    }, data as Record<string, unknown>);
}

/** Reads a localStorage key after the page has loaded. */
export async function readLocalStorage<T>(page: Page, key: string): Promise<T | null> {
    return page.evaluate((k) => {
        const raw = localStorage.getItem(k);
        return raw ? (JSON.parse(raw) as T) : null;
    }, key);
}
