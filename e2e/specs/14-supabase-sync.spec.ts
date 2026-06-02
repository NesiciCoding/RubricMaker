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
import { RubricBuilderPage } from '../pages/RubricBuilderPage';
import { RubricListPage } from '../pages/RubricListPage';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch all rubrics for the test user directly from the DB via service role. */
async function fetchRubricsFromDb(): Promise<{ id: string; data: { name: string } }[]> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rubrics?select=id,data`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    return res.ok ? (res.json() as Promise<{ id: string; data: { name: string } }[]>) : [];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Supabase sign-in', () => {
    test('magic-link flow lands in the app with Supabase connected', async ({ supabasePage }) => {
        // The supabasePage fixture already completed the sign-in flow.
        // Verify the app is running and Supabase status is not offline.
        await expect(supabasePage.locator('.main-area')).toBeVisible();

        // The sync status indicator should show idle/connected, not "offline".
        // We confirm by checking that the Supabase config is in localStorage.
        const config = await supabasePage.evaluate(() =>
            localStorage.getItem('rm_supabase_config')
        );
        expect(config).not.toBeNull();
        expect(JSON.parse(config!)).toMatchObject({ supabaseUrl: expect.any(String) });
    });
});

test.describe('Cloud persistence (Supabase-first hydration)', () => {
    test('rubric created online survives localStorage entity removal', async ({ supabasePage }) => {
        const builder = new RubricBuilderPage(supabasePage);
        const list = new RubricListPage(supabasePage);

        // Create a rubric while connected
        await builder.gotoNew();
        await builder.fillName('Cloud-Persisted Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Accuracy');
        await builder.save();
        await builder.waitForSaved();

        // Verify it exists in the Supabase DB
        let dbRubrics = await fetchRubricsFromDb();
        expect(dbRubrics.some((r) => r.data.name === 'Cloud-Persisted Rubric')).toBe(true);

        // Simulate what happens when localStorage rubric data is lost
        // (e.g. switching devices, cache cleared): remove only the rubric key.
        await supabasePage.evaluate(() => localStorage.removeItem('rm_rubrics'));

        // Reload — the app should re-hydrate rubrics from Supabase
        await supabasePage.reload();
        await supabasePage.waitForSelector('.main-area', { timeout: 20_000 });

        await list.goto();
        await expect(supabasePage.getByText('Cloud-Persisted Rubric')).toBeVisible({ timeout: 10_000 });
    });

    test('rubric deleted on device is absent after re-hydration', async ({ supabasePage }) => {
        const builder = new RubricBuilderPage(supabasePage);
        const list = new RubricListPage(supabasePage);

        // Create two rubrics
        await builder.gotoNew();
        await builder.fillName('Keep This One');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Clarity');
        await builder.save();
        await builder.waitForSaved();

        await builder.gotoNew();
        await builder.fillName('Delete This One');
        await builder.fillSubject('Dutch');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Fluency');
        await builder.save();
        await builder.waitForSaved();

        // Delete the second rubric via the app
        await list.goto();
        await list.clickDeleteRubric('Delete This One');
        await expect(supabasePage.getByRole('dialog')).toBeVisible();
        await list.confirmDelete();
        await expect(supabasePage.getByText('Delete This One')).not.toBeVisible({ timeout: 5_000 });

        // Verify the DB reflects the deletion
        const dbRubrics = await fetchRubricsFromDb();
        expect(dbRubrics.some((r) => r.data.name === 'Delete This One')).toBe(false);
        expect(dbRubrics.some((r) => r.data.name === 'Keep This One')).toBe(true);
    });
});

test.describe('Offline write queue and reconnect flush', () => {
    test('writes made while offline are queued and flushed on reconnect', async ({
        supabasePage,
    }) => {
        const builder = new RubricBuilderPage(supabasePage);

        // Create a rubric while online to confirm baseline sync works
        await builder.gotoNew();
        await builder.fillName('Online Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Content');
        await builder.save();
        await builder.waitForSaved();

        // Go offline
        await supabasePage.context().setOffline(true);

        // Create a rubric while offline — should succeed locally, queue for Supabase
        await builder.gotoNew();
        await builder.fillName('Offline Rubric');
        await builder.fillSubject('Dutch');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Vocabulary');
        await builder.save();
        await builder.waitForSaved();

        // Confirm the pending queue has items
        const pendingQueue = await supabasePage.evaluate(() => {
            const raw = localStorage.getItem('rm_pending_sync');
            return raw ? JSON.parse(raw) : [];
        });
        expect(pendingQueue.length).toBeGreaterThan(0);

        // Confirm the offline rubric is NOT yet in Supabase (network is blocked)
        const dbBeforeReconnect = await fetchRubricsFromDb().catch(() => [] as never[]);
        expect(dbBeforeReconnect.some((r: { data: { name: string } }) => r.data.name === 'Offline Rubric')).toBe(false);

        // Reconnect
        await supabasePage.context().setOffline(false);

        // Wait for the pending queue to be flushed
        await supabasePage.waitForFunction(
            () => {
                const raw = localStorage.getItem('rm_pending_sync');
                const q: unknown[] = raw ? JSON.parse(raw) : [];
                return q.length === 0;
            },
            { timeout: 10_000, polling: 500 }
        );

        // Verify the offline rubric is now in Supabase
        const dbAfterReconnect = await fetchRubricsFromDb();
        expect(dbAfterReconnect.some((r) => r.data.name === 'Offline Rubric')).toBe(true);
    });

    test('pending queue is empty while online', async ({ supabasePage }) => {
        const builder = new RubricBuilderPage(supabasePage);

        await builder.gotoNew();
        await builder.fillName('Sync Check Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Grammar');
        await builder.save();
        await builder.waitForSaved();

        // Allow async sync to complete
        await supabasePage.waitForTimeout(2_000);

        const pendingQueue = await supabasePage.evaluate(() => {
            const raw = localStorage.getItem('rm_pending_sync');
            return raw ? JSON.parse(raw) : [];
        });
        // When online and pushOne succeeds, nothing should remain in the queue
        expect(pendingQueue).toHaveLength(0);
    });
});
