/**
 * Item 15 — Supabase-first offline startup behaviour.
 *
 * These tests verify the two new code paths introduced in Item 15:
 *  1. navigator.onLine false at startup → skip hydration, load from localStorage cache
 *  2. Hydration timeout (8 s) → fall through to localStorage cache with error toast
 *
 * Both require a running local Supabase stack and a signed-in session.
 * Run with: npm run db:start && npm run e2e:supabase
 */
import { test, expect, SUPABASE_URL } from '../fixtures/supabase.fixture';
import { buildRubric } from '../fixtures/data.factory';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Push a rubric into the page's localStorage without replacing existing entries. */
async function addRubricToCache(page: import('@playwright/test').Page, rubric: ReturnType<typeof buildRubric>) {
    await page.evaluate((r) => {
        const stored = JSON.parse(localStorage.getItem('rm_rubrics') ?? '[]') as unknown[];
        stored.push(r);
        localStorage.setItem('rm_rubrics', JSON.stringify(stored));
    }, rubric);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('startup — offline with Supabase configured', () => {
    test('skips hydration and loads from cache when navigator.onLine is false', async ({ supabasePage: page }) => {
        // supabasePage fixture already signed in — session is in localStorage.
        // Add an extra rubric to the local cache so we have something distinct to assert.
        const offlineRubric = buildRubric({ id: 'offline-cache-rubric', name: 'Offline Cache Rubric' });
        await addRubricToCache(page, offlineRubric);

        // Override navigator.onLine for the upcoming reload.
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
        });

        // Abort Supabase REST (data) calls to ensure we never attempt hydration.
        // Auth calls are intentionally left open so initAuth() can detect the session.
        await page.route('**/rest/v1/**', (route) => route.abort());
        await page.route('**/storage/v1/**', (route) => route.abort());

        const t0 = Date.now();
        await page.reload();
        await page.waitForSelector('.main-area', { timeout: 12_000 });
        const elapsed = Date.now() - t0;

        // Should open well under the 8 s hydration timeout (no network wait at all).
        expect(elapsed, 'app should open from cache without waiting for hydration timeout').toBeLessThan(6_000);

        // The cached rubric must be visible in the rubric list.
        await page.evaluate(() => { window.location.hash = '/rubrics'; });
        await expect(page.getByText('Offline Cache Rubric')).toBeVisible({ timeout: 5_000 });

        // Offline cache toast must be shown.
        await expect(page.getByText("You're offline")).toBeVisible({ timeout: 5_000 });
    });
});

test.describe('startup — Supabase hydration timeout', () => {
    test('falls through to localStorage cache after 8 s hydration timeout', async ({ supabasePage: page }) => {
        // supabasePage fixture already signed in.
        const timeoutRubric = buildRubric({ id: 'timeout-cache-rubric', name: 'Timeout Cache Rubric' });
        await addRubricToCache(page, timeoutRubric);

        // Delay all Supabase REST calls by 10 s — longer than our 8 s hydration timeout.
        // Route handlers run in Node, so the browser waits until the delay resolves.
        await page.route(`${SUPABASE_URL}/rest/v1/**`, async (route) => {
            await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
            await route.abort();
        });

        const t0 = Date.now();
        await page.reload();
        await page.waitForSelector('.main-area', { timeout: 15_000 });
        const elapsed = Date.now() - t0;

        // Should open after the 8 s timeout but well before the 10 s request delay.
        expect(elapsed, 'app should open after hydration timeout (~8 s)').toBeGreaterThan(7_000);
        expect(elapsed, 'app should not wait for the full 10 s request delay').toBeLessThan(12_000);

        // Cached rubric must be visible (app fell through to localStorage).
        await page.evaluate(() => { window.location.hash = '/rubrics'; });
        await expect(page.getByText('Timeout Cache Rubric')).toBeVisible({ timeout: 5_000 });

        // Warning toast for failed load must appear.
        await expect(page.getByText('Could not load your cloud data')).toBeVisible({ timeout: 5_000 });
    });
});

test.describe('startup — online with Supabase configured (regression)', () => {
    test('loads from Supabase when online, no offline toast', async ({ supabasePage: page }) => {
        // A clean reload with network available — verifies the happy path still works.
        await page.reload();
        await page.waitForSelector('.main-area', { timeout: 15_000 });

        // The offline toast must NOT appear in the normal online flow.
        await expect(page.getByText("You're offline")).not.toBeVisible();
    });
});
