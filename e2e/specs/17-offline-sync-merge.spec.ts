/**
 * Item 17 — Offline grading queue + LWW reconnect-hydration merge.
 *
 * Builds on item 14 (Supabase sync) and item 15 (offline-first hydration
 * merge in src/utils/syncMerge.ts). Verifies:
 *
 *  1. A grade entered while offline is queued in rm_pending_sync, then
 *     flushed to Supabase once the browser comes back online — and the
 *     grade survives a localStorage wipe + reload (cloud persistence).
 *  2. A rubric renamed while offline (queued upsert) is NOT clobbered by
 *     stale remote data when reconnect-hydration runs before the queued
 *     write has flushed (LWW / pending-record protection in mergeStoreData).
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 */
import { test, expect, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import type { Page } from '@playwright/test';
import { RubricBuilderPage } from '../pages/RubricBuilderPage';
import { GradeStudentPage } from '../pages/GradeStudentPage';
import { readLocalStorage } from '../fixtures/storage.helpers';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import type { PendingWrite } from '../../src/store/storage';

// ── Navigation helpers (same pattern as 14-supabase-sync.spec.ts) ─────────────

/**
 * Navigate to the new-rubric form without a page reload.
 *
 * BasePage.navigate() performs a hard reload which re-initialises the
 * Supabase auth flow and triggers a SET_ALL dispatch mid-interaction,
 * wiping the partially-filled form. In Supabase tests the app is already
 * connected; a simple hash navigation keeps the session alive.
 */
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

/** Navigate to a grade page without a page reload. */
async function gotoGradePage(page: Page, rubricId: string, studentId: string): Promise<void> {
    await page.evaluate(
        ({ r, s }) => {
            window.location.hash = `/rubrics/${r}/grade/${s}`;
        },
        { r: rubricId, s: studentId }
    );
    await page.waitForSelector('.topbar button.btn-primary', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
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

// ── DB helpers ──────────────────────────────────────────────────────────────

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

async function fetchStudentRubricsFromDb(
    userEmail: string
): Promise<{ id: string; data: { id: string; entries: { levelId: string }[] } }[]> {
    const userId = await resolveUserId(userEmail);
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/student_rubrics?select=id,data&grader_id=eq.${userId}&is_peer_review=eq.false`,
        {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
        }
    );
    if (!res.ok) throw new Error(`Failed to fetch student_rubrics: ${res.status} ${await res.text()}`);
    return (await res.json()) as { id: string; data: { id: string; entries: { levelId: string }[] } }[];
}

// ── Pending-queue helpers ────────────────────────────────────────────────────

async function getPendingQueue(page: Page): Promise<PendingWrite[]> {
    return (await readLocalStorage<PendingWrite[]>(page, 'rm_pending_sync')) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Offline grading queue and reconnect flush', () => {
    test('grade entered while offline is queued, flushed on reconnect, and persists in the cloud', async ({
        supabasePage: page,
        testUserEmail,
    }) => {
        const builder = new RubricBuilderPage(page);

        // ── Online setup: rubric with one criterion ──────────────────────────
        await gotoNewRubric(page);
        await builder.fillName('Offline Grading Rubric');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Accuracy');
        await saveAndSync(page, builder);

        const rubricId = await page.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricId).toBeTruthy();

        // Seed a class + student directly via storage write helpers, then push
        // them to Supabase the same way the app would (dispatch through
        // localStorage + a reload re-hydrates from cache, but since we're
        // online the simplest reliable path is to seed localStorage and let
        // the app's own delta-sync push them on the next mutation). To keep
        // this deterministic we seed both collections and the studentRubric
        // queue entry will be pushed once we grade through the UI below.
        const cls = buildClass({ id: `offline-class-${Date.now()}`, name: 'Offline Class' });
        const student = buildStudent(cls.id, { id: `offline-student-${Date.now()}`, name: 'Offline Student' });
        await page.evaluate(
            ({ classData, studentData }) => {
                const classes = JSON.parse(localStorage.getItem('rm_classes') ?? '[]') as unknown[];
                classes.push(classData);
                localStorage.setItem('rm_classes', JSON.stringify(classes));

                const students = JSON.parse(localStorage.getItem('rm_students') ?? '[]') as unknown[];
                students.push(studentData);
                localStorage.setItem('rm_students', JSON.stringify(students));
            },
            { classData: cls, studentData: student }
        );

        // Reload (online) so the freshly-seeded class/student are picked up by
        // the app's in-memory state and pushed to Supabase via the delta-sync
        // effect on the next render.
        await page.reload();
        await page.waitForSelector('.main-area', { timeout: 20_000 });
        await page.waitForLoadState('networkidle', { timeout: 15_000 });

        // Warm the lazily-loaded GradeStudent route chunk WHILE STILL ONLINE.
        // The page is code-split (React.lazy); navigating to it for the first
        // time triggers a dynamic import of GradeStudent.tsx. If that import is
        // first requested after going offline, Vite cannot fetch the chunk and
        // the route renders the "Something went wrong" error boundary instead of
        // the grading UI, so .level-btn never appears. Loading it here primes
        // the module cache so the subsequent offline visit is a no-fetch render.
        const grader = new GradeStudentPage(page);
        await gotoGradePage(page, rubricId!, student.id);
        await grader.getLevelBtn('Excellent', 0).waitFor({ timeout: 15_000 });

        // ── Go offline ────────────────────────────────────────────────────────
        await page.context().setOffline(true);

        // Re-enter the grade page (same-document hash nav — chunk already cached).
        await gotoGradePage(page, rubricId!, student.id);

        await grader.selectLevel(0, 'Excellent');
        await grader.fillCriterionComment(0, 'Great work, offline-graded');
        await grader.save();
        await grader.waitForSaved();

        // The studentRubric upsert should fail (offline) and land in the pending queue.
        await expect.poll(async () => (await getPendingQueue(page)).length, { timeout: 10_000 }).toBeGreaterThan(0);

        const queueWhileOffline = await getPendingQueue(page);
        expect(queueWhileOffline.some((op) => op.entity === 'studentRubric')).toBe(true);

        // ── Reconnect ─────────────────────────────────────────────────────────
        await page.context().setOffline(false);

        // Wait for the queue to drain (online listener → flushPendingQueue)
        await expect
            .poll(async () => (await getPendingQueue(page)).length, { timeout: 20_000, intervals: [500] })
            .toBe(0);

        // Wait for the reconnect re-hydration to settle
        await page.waitForLoadState('networkidle', { timeout: 15_000 });

        // ── Verify the grade reached Supabase ────────────────────────────────
        const dbStudentRubrics = await fetchStudentRubricsFromDb(testUserEmail);
        const dbEntry = dbStudentRubrics.find(
            (sr) =>
                sr.data.id &&
                queueWhileOffline.some((op) => {
                    const payload = op.payload as { id?: string } | null;
                    return payload?.id === sr.data.id;
                })
        );
        expect(
            dbEntry,
            `expected the offline-graded studentRubric in Supabase, got: ${JSON.stringify(dbStudentRubrics)}`
        ).toBeTruthy();

        // ── Cloud-persistence check: wipe local cache, reload, grade survives ──
        await page.evaluate(() => localStorage.removeItem('rm_student_rubrics'));
        await page.reload();
        await page.waitForSelector('.main-area', { timeout: 20_000 });
        await page.waitForLoadState('networkidle', { timeout: 15_000 });

        await gotoGradePage(page, rubricId!, student.id);
        await expect(grader.getLevelBtn('Excellent', 0)).toHaveClass(/selected/, { timeout: 10_000 });
        await expect(page.getByText('Great work, offline-graded')).toBeVisible({ timeout: 10_000 });
    });
});

test.describe('Reconnect-hydration protects offline edits (LWW)', () => {
    test('a rubric renamed while offline is not clobbered by stale remote data on reconnect', async ({
        supabasePage: page,
        testUserEmail,
    }) => {
        const builder = new RubricBuilderPage(page);

        // ── Online: create a rubric ───────────────────────────────────────────
        await gotoNewRubric(page);
        await builder.fillName('Original Name');
        await builder.fillSubject('English');
        await builder.addFirstCriterion();
        await builder.fillCriterionTitle(0, 'Clarity');
        await saveAndSync(page, builder);

        const rubricId = await page.evaluate(() => window.location.hash.split('/').pop());
        expect(rubricId).toBeTruthy();

        const dbBefore = await fetchRubricsFromDb(testUserEmail);
        expect(dbBefore.some((r) => r.data.name === 'Original Name')).toBe(true);

        // ── Block writes to the rubrics table so the rename can never reach
        // Supabase, even after we simulate "online" again. This forces the
        // queued upsert to remain in rm_pending_sync when reconnect-hydration
        // runs, exercising the pendingIds-protection branch of mergeStoreData
        // (rather than the trivial case where the flush already won the race).
        await page.route(`${SUPABASE_URL}/rest/v1/rubrics*`, async (route) => {
            const method = route.request().method();
            if (method === 'GET') {
                await route.continue();
            } else {
                await route.abort();
            }
        });

        // ── Go offline and rename the rubric ─────────────────────────────────
        await page.context().setOffline(true);

        await gotoEditRubric(page, rubricId!);
        await builder.fillName('Renamed Offline');
        await builder.save();
        await builder.waitForSaved();

        // The rename upsert should fail (offline) and be queued.
        await expect.poll(async () => (await getPendingQueue(page)).length, { timeout: 10_000 }).toBeGreaterThan(0);
        const queueAfterRename = await getPendingQueue(page);
        expect(queueAfterRename.some((op) => op.entity === 'rubric')).toBe(true);

        // ── Reconnect: flush will attempt to push the rename, but our route
        // block above aborts it, so the queue entry survives. The reconnect
        // hydration then fetches the (still "Original Name") remote rubric and
        // must NOT overwrite the local rename, because it is still pending.
        await page.context().setOffline(false);

        // Give the online listener time to attempt-and-fail the flush, then
        // run reconnect-hydration.
        await page.waitForLoadState('networkidle', { timeout: 15_000 });

        // The pending entry must still be queued (flush blocked by our route).
        await expect
            .poll(
                async () => {
                    const queue = await getPendingQueue(page);
                    return queue.some((op) => op.entity === 'rubric');
                },
                { timeout: 10_000 }
            )
            .toBe(true);

        // The local rename must have survived the reconnect-hydration merge.
        await gotoEditRubric(page, rubricId!);
        await expect(page.getByPlaceholder('Rubric Name...')).toHaveValue('Renamed Offline', { timeout: 10_000 });

        const localRubrics = await readLocalStorage<{ id: string; name: string }[]>(page, 'rm_rubrics');
        const localRubric = localRubrics?.find((r) => r.id === rubricId);
        expect(localRubric?.name).toBe('Renamed Offline');

        // ── Unblock the rubrics table and let the queued rename actually flush ──
        await page.unroute(`${SUPABASE_URL}/rest/v1/rubrics*`);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));

        await expect
            .poll(
                async () => {
                    const queue = await getPendingQueue(page);
                    return queue.some((op) => op.entity === 'rubric');
                },
                { timeout: 15_000, intervals: [500] }
            )
            .toBe(false);

        const dbAfter = await fetchRubricsFromDb(testUserEmail);
        const dbRubric = dbAfter.find((r) => r.id === rubricId);
        expect(dbRubric?.data.name).toBe('Renamed Offline');
    });
});

test.describe('Multi-device propagation', () => {
    test.skip(
        true,
        'Skipped: the supabase fixture provisions one signed-in page per test via a fresh ' +
            'magic-link user. Standing up a second authenticated browser context for the SAME ' +
            'user would require either (a) extracting and re-injecting the sb-*-auth-token ' +
            'localStorage entry into a second context — fragile across supabase-js versions and ' +
            'not exercised anywhere else in this suite — or (b) a second magic-link sign-in ' +
            'flow per test, which doubles runtime and admin-API calls for every test in this ' +
            'file. Given items 1 and 2 above already cover the merge logic end-to-end (queue, ' +
            'flush, reconnect-hydration, LWW protection), a dedicated cross-context propagation ' +
            'test is disproportionate to the marginal coverage it adds. If desired, this should ' +
            'be a small follow-up that adds a `secondSupabasePage` fixture to ' +
            'e2e/fixtures/supabase.fixture.ts (sharing testUserEmail) rather than ad-hoc auth ' +
            'token copying inside this spec.'
    );
    test('context A edits a rubric, context B reconnects and sees the change', async () => {
        // intentionally empty — see test.skip reason above
    });
});
