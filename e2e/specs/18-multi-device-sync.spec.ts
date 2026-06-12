/**
 * Item 18 — Multi-device sync (Phase 2.1 of the roadmap).
 *
 * Builds on item 14 (Supabase sync) and item 17 (offline queue + LWW
 * reconnect-hydration merge). Uses two independent, signed-in browser
 * contexts for the SAME user (`supabasePage` + `secondSupabasePage` from
 * e2e/fixtures/supabase.fixture.ts) to verify:
 *
 *  1. Basic propagation: device A creates/edits a rubric and syncs; device B
 *     reloads (re-hydrates from Supabase) and sees the change.
 *  2. Simultaneous edits (race / LWW): both devices start from the same
 *     rubric. Device A edits and saves first, device B edits a different
 *     field and saves second (later `updatedAt`). After both reconnect and
 *     sync, the record with the LATER `updatedAt` wins in full — per
 *     mergeStoreData/mergeCollection in src/utils/syncMerge.ts, LWW is
 *     record-level, not field-level, so device B's edit (including its
 *     value for the field A changed) is what survives everywhere.
 *  3. Network-partition resilience: device A goes offline and edits a
 *     rubric (queued in rm_pending_sync); device B, still online, edits a
 *     *different* record and syncs normally. Device A reconnects, its
 *     queued edit flushes, and both devices converge on the same DB state.
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import type { Page } from '@playwright/test';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';
import { readLocalStorage } from '../fixtures/storage.helpers';
import type { PendingWrite } from '../../src/store/storage';

// ── Navigation helpers (same pattern as 14/17) ────────────────────────────────

/** Navigate to the new-rubric form without a page reload. */
async function gotoNewRubric(page: Page): Promise<void> {
    await page.evaluate(() => {
        window.location.hash = '/rubrics/new';
    });
    await page.waitForSelector('input[placeholder="Rubric Name..."]', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

/** Navigate to an existing rubric's edit page without a page reload. */
async function gotoEditRubric(page: Page, id: string): Promise<void> {
    await page.evaluate((rubricId) => {
        window.location.hash = `/rubrics/${rubricId}`;
    }, id);
    await page.waitForSelector('input[placeholder="Rubric Name..."]', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

/** Navigate to the rubric list without a page reload. */
async function gotoRubricList(page: Page): Promise<void> {
    await page.evaluate(() => {
        window.location.hash = '/rubrics';
    });
    await page.waitForSelector('.main-area', { timeout: 15_000 });
}

async function saveAndSync(page: Page, builder: RubricBuilderPage): Promise<void> {
    const nameInput = page.getByPlaceholder('Rubric Name...');
    const nameValue = await nameInput.inputValue();
    expect(
        nameValue.trim(),
        `Name input empty before save — URL: ${page.url()}, ` +
            `body classes: ${await page.evaluate(() => document.body.className)}`
    ).not.toBe('');

    await builder.save();
    await builder.waitForSaved();
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

// ── DB helpers (same pattern as 14/17) ────────────────────────────────────────

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

async function fetchRubricsFromDb(
    userEmail: string
): Promise<{ id: string; data: { name: string; subject?: string; description?: string; updatedAt?: string } }[]> {
    const userId = await resolveUserId(userEmail);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rubrics?select=id,data&owner_id=eq.${userId}`, {
        headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
    if (!res.ok) throw new Error(`Failed to fetch rubrics: ${res.status} ${await res.text()}`);
    return (await res.json()) as {
        id: string;
        data: { name: string; subject?: string; description?: string; updatedAt?: string };
    }[];
}

// ── Pending-queue helper (same pattern as 17) ─────────────────────────────────

async function getPendingQueue(page: Page): Promise<PendingWrite[]> {
    return (await readLocalStorage<PendingWrite[]>(page, 'rm_pending_sync')) ?? [];
}

/** Reload a page and wait for it to be ready (Supabase session is preserved per-context). */
async function reloadAndSettle(page: Page): Promise<void> {
    await page.reload();
    await page.waitForSelector('.main-area', { timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Multi-device propagation', () => {
    test('device A creates a rubric, device B reloads and sees it', async ({
        supabasePage: pageA,
        secondSupabasePage: pageB,
        testUserEmail,
    }) => {
        const builderA = new RubricBuilderPage(pageA);

        await gotoNewRubric(pageA);
        await builderA.fillName('Propagated Rubric');
        await builderA.fillSubject('English');
        await builderA.addFirstCriterion();
        await builderA.fillCriterionTitle(0, 'Accuracy');
        await saveAndSync(pageA, builderA);

        const rubricId = await pageA.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricId).toBeTruthy();

        const dbRubrics = await fetchRubricsFromDb(testUserEmail);
        expect(dbRubrics.some((r) => r.data.name === 'Propagated Rubric')).toBe(true);

        // Device B reconnects (reload re-hydrates from Supabase) and sees A's rubric.
        await reloadAndSettle(pageB);
        await gotoRubricList(pageB);
        await expect(pageB.getByText('Propagated Rubric')).toBeVisible({ timeout: 10_000 });
    });

    test('device A edits an existing rubric, device B reloads and sees the edit', async ({
        supabasePage: pageA,
        secondSupabasePage: pageB,
        testUserEmail,
    }) => {
        const builderA = new RubricBuilderPage(pageA);

        // Create on A and let B pick it up first.
        await gotoNewRubric(pageA);
        await builderA.fillName('Edit Propagation Rubric');
        await builderA.fillSubject('English');
        await builderA.addFirstCriterion();
        await builderA.fillCriterionTitle(0, 'Accuracy');
        await saveAndSync(pageA, builderA);

        const rubricId = await pageA.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricId).toBeTruthy();

        await reloadAndSettle(pageB);
        await gotoRubricList(pageB);
        await expect(pageB.getByText('Edit Propagation Rubric')).toBeVisible({ timeout: 10_000 });

        // Device A renames the rubric.
        await gotoEditRubric(pageA, rubricId!);
        await builderA.fillName('Renamed By Device A');
        await saveAndSync(pageA, builderA);

        const dbRubrics = await fetchRubricsFromDb(testUserEmail);
        const dbRubric = dbRubrics.find((r) => r.id === rubricId);
        expect(dbRubric?.data.name).toBe('Renamed By Device A');

        // Device B reconnects and sees the rename.
        await reloadAndSettle(pageB);
        await gotoRubricList(pageB);
        await expect(pageB.getByText('Renamed By Device A')).toBeVisible({ timeout: 10_000 });
        await expect(pageB.getByText('Edit Propagation Rubric')).not.toBeVisible();
    });
});

test.describe('Simultaneous edits (race / LWW)', () => {
    test('the device that saves last wins the whole record on reconnect', async ({
        supabasePage: pageA,
        secondSupabasePage: pageB,
        testUserEmail,
    }) => {
        const builderA = new RubricBuilderPage(pageA);
        const builderB = new RubricBuilderPage(pageB);

        // ── Create the rubric on A and let it sync ───────────────────────────
        await gotoNewRubric(pageA);
        await builderA.fillName('Shared Rubric');
        await builderA.fillSubject('English');
        await builderA.addFirstCriterion();
        await builderA.fillCriterionTitle(0, 'Accuracy');
        await saveAndSync(pageA, builderA);

        const rubricId = await pageA.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricId).toBeTruthy();

        // ── B loads the same rubric (so both devices have the same base state) ──
        await reloadAndSettle(pageB);
        await gotoEditRubric(pageB, rubricId!);
        await expect(pageB.getByPlaceholder('Rubric Name...')).toHaveValue('Shared Rubric', { timeout: 10_000 });

        // ── B goes offline before editing, so its edit can't sync yet ──────────
        await pageB.context().setOffline(true);

        // ── A edits the subject field and saves (earlier updatedAt) ────────────
        await gotoEditRubric(pageA, rubricId!);
        await builderA.fillSubject('Mathematics');
        await saveAndSync(pageA, builderA);

        const dbAfterA = await fetchRubricsFromDb(testUserEmail);
        const dbRubricAfterA = dbAfterA.find((r) => r.id === rubricId);
        expect(dbRubricAfterA?.data.subject).toBe('Mathematics');

        // ── B edits the name field and saves (queued — offline) ─────────────────
        await builderB.fillName('Renamed By Device B');
        await builderB.save();
        await builderB.waitForSaved();

        await expect.poll(async () => (await getPendingQueue(pageB)).length, { timeout: 10_000 }).toBeGreaterThan(0);
        const queueB = await getPendingQueue(pageB);
        expect(queueB.some((op) => op.entity === 'rubric')).toBe(true);

        // ── B reconnects: its later-updatedAt edit flushes and wins the record ──
        await pageB.context().setOffline(false);

        await expect
            .poll(async () => (await getPendingQueue(pageB)).length, { timeout: 20_000, intervals: [500] })
            .toBe(0);
        await pageB.waitForLoadState('networkidle', { timeout: 15_000 });

        // The whole record reflects B's later save: B's name change is present,
        // AND B's payload (built from B's pre-edit state, which already had
        // subject "Mathematics" from A's earlier save) carries A's subject too —
        // record-level LWW means B's full record (name + subject) wins.
        const dbAfterB = await fetchRubricsFromDb(testUserEmail);
        const dbRubricAfterB = dbAfterB.find((r) => r.id === rubricId);
        expect(dbRubricAfterB?.data.name).toBe('Renamed By Device B');
        expect(dbRubricAfterB?.data.subject).toBe('Mathematics');

        // ── A reconnects/reloads and converges on B's version (later updatedAt) ──
        await reloadAndSettle(pageA);
        await gotoEditRubric(pageA, rubricId!);
        await expect(pageA.getByPlaceholder('Rubric Name...')).toHaveValue('Renamed By Device B', {
            timeout: 10_000,
        });
        await expect(pageA.getByPlaceholder('Subject / Grade...')).toHaveValue('Mathematics', { timeout: 10_000 });

        const localRubricsA = await readLocalStorage<{ id: string; name: string; subject?: string }[]>(
            pageA,
            'rm_rubrics'
        );
        const localRubricA = localRubricsA?.find((r) => r.id === rubricId);
        expect(localRubricA?.name).toBe('Renamed By Device B');
        expect(localRubricA?.subject).toBe('Mathematics');
    });
});

test.describe('Network-partition resilience', () => {
    test('an offline edit on device A flushes after reconnect without disturbing a concurrent online edit on device B', async ({
        supabasePage: pageA,
        secondSupabasePage: pageB,
        testUserEmail,
    }) => {
        const builderA = new RubricBuilderPage(pageA);
        const builderB = new RubricBuilderPage(pageB);

        // ── Seed two independent rubrics, one per device ────────────────────────
        await gotoNewRubric(pageA);
        await builderA.fillName('Device A Rubric');
        await builderA.fillSubject('English');
        await builderA.addFirstCriterion();
        await builderA.fillCriterionTitle(0, 'Accuracy');
        await saveAndSync(pageA, builderA);
        const rubricIdA = await pageA.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricIdA).toBeTruthy();

        await gotoNewRubric(pageB);
        await builderB.fillName('Device B Rubric');
        await builderB.fillSubject('History');
        await builderB.addFirstCriterion();
        await builderB.fillCriterionTitle(0, 'Argumentation');
        await saveAndSync(pageB, builderB);
        const rubricIdB = await pageB.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricIdB).toBeTruthy();

        // ── Device A goes offline and edits its rubric ──────────────────────────
        await pageA.context().setOffline(true);

        await gotoEditRubric(pageA, rubricIdA!);
        await builderA.fillName('Device A Rubric (offline edit)');
        await builderA.save();
        await builderA.waitForSaved();

        await expect.poll(async () => (await getPendingQueue(pageA)).length, { timeout: 10_000 }).toBeGreaterThan(0);
        const queueWhileOffline = await getPendingQueue(pageA);
        expect(queueWhileOffline.some((op) => op.entity === 'rubric')).toBe(true);

        // ── Device B, still online, edits its own (different) rubric normally ───
        await gotoEditRubric(pageB, rubricIdB!);
        await builderB.fillName('Device B Rubric (online edit)');
        await saveAndSync(pageB, builderB);

        const dbAfterBEdit = await fetchRubricsFromDb(testUserEmail);
        expect(dbAfterBEdit.find((r) => r.id === rubricIdB)?.data.name).toBe('Device B Rubric (online edit)');
        // A's offline edit must not have reached the DB yet.
        expect(dbAfterBEdit.find((r) => r.id === rubricIdA)?.data.name).toBe('Device A Rubric');

        // ── Device A reconnects: its queued edit flushes ────────────────────────
        await pageA.context().setOffline(false);

        await expect
            .poll(async () => (await getPendingQueue(pageA)).length, { timeout: 20_000, intervals: [500] })
            .toBe(0);
        await pageA.waitForLoadState('networkidle', { timeout: 15_000 });

        // ── Both edits are now present in the DB ────────────────────────────────
        const dbFinal = await fetchRubricsFromDb(testUserEmail);
        expect(dbFinal.find((r) => r.id === rubricIdA)?.data.name).toBe('Device A Rubric (offline edit)');
        expect(dbFinal.find((r) => r.id === rubricIdB)?.data.name).toBe('Device B Rubric (online edit)');

        // ── Device B reloads and converges on A's flushed edit too ──────────────
        await reloadAndSettle(pageB);
        await gotoRubricList(pageB);
        await expect(pageB.getByText('Device A Rubric (offline edit)')).toBeVisible({ timeout: 10_000 });
        await expect(pageB.getByText('Device B Rubric (online edit)')).toBeVisible({ timeout: 10_000 });

        // ── Sync-state consistency: no pending writes remain on either device ───
        expect(await getPendingQueue(pageA)).toHaveLength(0);
        expect(await getPendingQueue(pageB)).toHaveLength(0);
    });
});
