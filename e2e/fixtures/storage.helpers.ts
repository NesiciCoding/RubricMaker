import type { Page } from '@playwright/test';

export async function seedLocalStorage(page: Page, data: Record<string, unknown>): Promise<void> {
    await page.addInitScript((d) => {
        Object.entries(d).forEach(([key, value]) => {
            localStorage.setItem(key, JSON.stringify(value));
        });
    }, data as Record<string, unknown>);
}

export async function readLocalStorage<T>(page: Page, key: string): Promise<T | null> {
    return page.evaluate((k) => {
        const raw = localStorage.getItem(k);
        return raw ? (JSON.parse(raw) as T) : null;
    }, key);
}
