/**
 * Supabase integration tests — item 14 of the roadmap.
 *
 * These tests require a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 *
 * They are intentionally excluded from the standard offline e2e suite so
 * the default `npm run e2e` run stays fast and dependency-free.
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import type { Page } from '@playwright/test';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';
import { RubricListPage } from '../pages/RubricListPage';

// ── Save helpers ──────────────────────────────────────────────────────────────

/**
 * Save a rubric and wait for the Supabase push to settle.
 *
 * `builder.waitForSaved()` confirms the local save (via "Saved" button text or
 * URL navigation away from /new).  `waitForLoadState('networkidle')` then waits
 * for the async Supabase push to complete so subsequent DB queries find the row.
 */
async function saveAndSync(page: Page, builder: RubricBuilderPage): Promise<void> {
    // Pre-save diagnostic: if name is empty handleSave() returns early and
    // the URL never changes, producing a cryptic AggregateError.  Assert
    // explicitly so CI produces a useful failure message instead.
    const nameInput = page.getByPlaceholder('Rubric Name...');
    const nameValue = await nameInput.inputValue();
    expect(
        nameValue.trim(),
        `Name input empty before save — URL: ${page.url()}, ` +
            `body classes: ${await page.evaluate(() => document.body.className)}`,
    ).not.toBe('');

    await builder.save();
    await builder.waitForSaved();
    // Wait for the async Supabase push (fire-and-forget from the reducer) to
    // complete so that subsequent DB queries via the admin API find the row.
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

// ── Navigation helpers ────────────────────────────────────────────────────────

/**
 * Navigate to the new-rubric form without a page reload.
 *
 * BasePage.navigate() performs a hard reload which re-initialises the
 * Supabase auth flow and triggers a SET_ALL dispatch mid-interaction,
 * wiping the partially-filled form.  In Supabase tests the app is already
 * connected; a simple hash navigation keeps the session alive.
 */
async function gotoNewRubric(page: Page): Promise<void> {
    // Use direct hash assignment rather than page.goto() so we guarantee a
    // same-document navigation with zero Playwright navigation overhead.
    // This keeps the Supabase session intact and avoids any potential reload.
    await page.evaluate(() => {
        window.location.hash = '/rubrics/new';
    });
    await page.waitForSelector('input[placeholder="Rubric Name..."]', { timeout: 15_000 });
    // Settle any residual in-flight Supabase requests before filling the form.
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

/** Navigate to the rubric list without a page reload. */
async function gotoRubricList(page: Page): Promise<void> {
    await page.evaluate(() => {
        window.location.hash = '/rubrics';
    });
    await page.waitForSelector('.main-area', { timeout: 15_000 });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function resolveUserId(userEmail: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    if (!res.ok) throw new Error(`Failed to list users: ${res.status} ${await res.text()}`);
    const { users } = (await res.json()) as { users: { id: string; email: string }[] };
    const user = users?.find((u) => u.email === userEmail);
    if (!user) throw new Error(`Test user ${userEmail} not found in Supabase`);
    return user.id;
}

async function fetchRubricsFromDb(userEmail: string): Promise<{ id: string; data: { name: string } }[]> {
    const userId = await resolveUserId(userEmail);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rubrics?select=id,data&owner_id=eq.${userId}`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    if (!res.ok) throw new Error(`Failed to fetch rubrics: ${res.status} ${await res.text()}`);
    return (await res.json()) as { id: string; data: { name: string } }[];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Supabase sign-in', () => {
    test('magic-link flow lands in the app with Supabase connected', async ({ supabasePage }) => {
        await expect(supabasePage.locator('.main-area')).toBeVisible();

        const config = await supabasePage.evaluate(() => localStorage.getItem('rm_supabase_config'));
        expect(config).not.toBeNull();
        expect(JSON.parse(config!)).toMatchObject({ supabaseUrl: expect.any(String) });
    });
});

test.describe('Cloud persistence (Supabase-first hydration)', () => {
    test('rubric created online survives localStorage entity removal', async ({ supabasePage, testUserEmail }) => {
        const builder = new RubricBuilderPage(supabasePage);

        // Create a rubric via in-session navigation (no reload = no hydration race)
        await gotoNewRubric(supabasePage);
        await builder.fillName('Cloud-Persisted Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Accuracy');
        await saveAndSync(supabasePage, builder);

        // Verify it exists in the Supabase DB
        const dbRubrics = await fetchRubricsFromDb(testUserEmail);
        expect(dbRubrics.some((r) => r.data.name === 'Cloud-Persisted Rubric')).toBe(true);

        // Simulate localStorage rubric data loss (switching devices / cache cleared)
        await supabasePage.evaluate(() => localStorage.removeItem('rm_rubrics'));

        // Reload — the app should re-hydrate rubrics from Supabase
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });
        await supabasePage.waitForLoadState('networkidle', { timeout: 15_000 });

        await gotoRubricList(supabasePage);
        await expect(supabasePage.getByText('Cloud-Persisted Rubric')).toBeVisible({
            timeout: 10_000,
        });
    });

    test('rubric deleted on device is absent after re-hydration', async ({ supabasePage, testUserEmail }) => {
        const builder = new RubricBuilderPage(supabasePage);
        const list = new RubricListPage(supabasePage);

        // Create two rubrics via in-session navigation
        await gotoNewRubric(supabasePage);
        await builder.fillName('Keep This One');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Clarity');
        await saveAndSync(supabasePage, builder);

        await gotoNewRubric(supabasePage);
        await builder.fillName('Delete This One');
        await builder.fillSubject('Dutch');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Fluency');
        await saveAndSync(supabasePage, builder);

        // Delete the second rubric via the list page
        await gotoRubricList(supabasePage);
        await list.clickDeleteRubric('Delete This One');
        await expect(supabasePage.getByRole('dialog')).toBeVisible();
        await list.confirmDelete();
        await expect(supabasePage.getByText('Delete This One')).not.toBeVisible({
            timeout: 5_000,
        });

        // Verify the DB reflects the deletion
        const dbRubrics = await fetchRubricsFromDb(testUserEmail);
        expect(dbRubrics.some((r) => r.data.name === 'Delete This One')).toBe(false);
        expect(dbRubrics.some((r) => r.data.name === 'Keep This One')).toBe(true);
    });
});

test.describe('Offline write queue and reconnect flush', () => {
    test('writes made while offline are queued and flushed on reconnect', async ({ supabasePage, testUserEmail }) => {
        const builder = new RubricBuilderPage(supabasePage);

        // Create a rubric while online (in-session navigation)
        await gotoNewRubric(supabasePage);
        await builder.fillName('Online Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Content');
        await saveAndSync(supabasePage, builder);

        // Simulate Supabase writes being unreachable via route interception.
        //
        // Why not setOffline()?  In CI (Chrome), setOffline(true) blocks ALL
        // connections including loopback.  This causes supabase-js's background
        // auth token refresh to fail → after retries it fires SIGNED_OUT →
        // adapter.userId becomes null → isConnected() returns false → pushOne()
        // hits the early-return guard and never queues anything.
        //
        // Route interception aborts only Supabase REST write requests.  Auth
        // requests (/auth/v1/**) and read requests (GET) continue normally, so
        // the session stays alive and isConnected() remains true.
        const supabaseWritePattern = `${SUPABASE_URL}/rest/v1/**`;
        await supabasePage.context().route(supabaseWritePattern, async (route) => {
            const method = route.request().method();
            if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
                await route.abort('failed');
            } else {
                await route.continue();
            }
        });

        // Create a rubric while Supabase writes are blocked — saves locally, push queued
        await gotoNewRubric(supabasePage);
        await builder.fillName('Offline Rubric');
        await builder.fillSubject('Dutch');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Vocabulary');
        await builder.save();
        await builder.waitForSaved();
        // The delta-sync useEffect calls pushOne() fire-and-forget.  The aborted
        // POST throws inside postgrest-js (non-retryable method) → caught in
        // pushOne → addToPendingQueue.  Poll until the item appears.
        await supabasePage.waitForFunction(
            () => {
                const raw = localStorage.getItem('rm_pending_sync');
                const q: unknown[] = raw ? JSON.parse(raw) : [];
                return q.length > 0;
            },
            { timeout: 8_000, polling: 200 }
        );

        // Pending queue must have items
        const pendingQueue = await supabasePage.evaluate(() => {
            const raw = localStorage.getItem('rm_pending_sync');
            return raw ? JSON.parse(raw) : [];
        });
        expect(pendingQueue.length).toBeGreaterThan(0);

        // Restore connectivity: remove route interception so retries can reach
        // Supabase, then dispatch window.online to trigger flushPendingQueue().
        await supabasePage.context().unroute(supabaseWritePattern);
        await supabasePage.evaluate(() => window.dispatchEvent(new Event('online')));

        // Wait for queue to flush
        await supabasePage.waitForFunction(
            () => {
                const raw = localStorage.getItem('rm_pending_sync');
                const q: unknown[] = raw ? JSON.parse(raw) : [];
                return q.length === 0;
            },
            { timeout: 10_000, polling: 500 }
        );

        // Verify offline rubric reached Supabase
        const dbAfterReconnect = await fetchRubricsFromDb(testUserEmail);
        expect(dbAfterReconnect.some((r) => r.data.name === 'Offline Rubric')).toBe(true);
    });

    test('pending queue is empty while online', async ({ supabasePage }) => {
        const builder = new RubricBuilderPage(supabasePage);

        await gotoNewRubric(supabasePage);
        await builder.fillName('Sync Check Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Grammar');
        await saveAndSync(supabasePage, builder);

        // Allow async Supabase push to complete
        await supabasePage.waitForTimeout(2_000);

        const pendingQueue = await supabasePage.evaluate(() => {
            const raw = localStorage.getItem('rm_pending_sync');
            return raw ? JSON.parse(raw) : [];
        });
        expect(pendingQueue).toHaveLength(0);
    });
});
