/**
 * Supabase-aware Playwright fixture.
 *
 * Provides `supabasePage` — a page that is signed in as a freshly-created test
 * user against a local Supabase stack.  The test user is deleted after the test.
 *
 * Sign-in uses the admin `generate_link` API to obtain a magic link URL
 * without sending any email.  Playwright navigates to that URL; Supabase
 * verifies the token and redirects to the app with auth tokens in the hash,
 * which supabase-js detects natively.  No inbucket or session injection needed.
 *
 * Prerequisites: `npm run db:start` (local Supabase stack must be running).
 *
 * Override any default URL/key via environment variables:
 *   SUPABASE_TEST_URL          (default: http://localhost:54321)
 *   SUPABASE_TEST_ANON_KEY     (default: local-dev anon key)
 *   SUPABASE_TEST_SERVICE_KEY  (default: local-dev service role key)
 */
import { test as base, type Page } from '@playwright/test';

// ── Supabase local-dev defaults (produced by `supabase start`) ────────────────

export const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://localhost:54321';

export const SUPABASE_ANON_KEY =
    process.env.SUPABASE_TEST_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oHv2oGAXG7XLHCB0PkMGUjwkH0ZFJNF4';

export const SUPABASE_SERVICE_KEY =
    process.env.SUPABASE_TEST_SERVICE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0';

const APP_URL = 'http://localhost:5173';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a unique test email for one test run. */
export function makeTestEmail(): string {
    return `rm-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

const adminHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

/**
 * Create a confirmed test user, set up a school so the app skips the
 * onboarding flow, and return the Supabase magic-link URL using the admin
 * generate_link API — no email or inbucket required.
 *
 * Without a school, hydrate() sets needsOnboarding:true and the app renders
 * the onboarding page (no .main-area), causing fixture timeouts.
 */
async function createUserAndGetMagicLink(email: string): Promise<string> {
    const restHeaders = {
        ...adminHeaders,
        Prefer: 'return=representation',
    };

    // Create confirmed user
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!createRes.ok) {
        throw new Error(`Failed to create test user: ${createRes.status} ${await createRes.text()}`);
    }
    const user = (await createRes.json()) as { id: string };

    // Create a school so needsOnboarding is false after hydration.
    // Schema: schools(id, name, created_by, retention_years)
    //         school_members(id, school_id, profile_id)  — no role column
    //         profiles.school_id — only field checked for needsOnboarding
    const schoolRes = await fetch(`${SUPABASE_URL}/rest/v1/schools`, {
        method: 'POST',
        headers: restHeaders,
        body: JSON.stringify({ name: 'E2E Test School', retention_years: 3, created_by: user.id }),
    });
    if (schoolRes.ok) {
        const schools = (await schoolRes.json()) as { id: string }[];
        const schoolId = schools[0]?.id;
        if (schoolId) {
            await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/school_members`, {
                    method: 'POST',
                    headers: restHeaders,
                    body: JSON.stringify({ school_id: schoolId, profile_id: user.id }),
                }),
                // Only set school_id — do not update role to avoid the
                // protect_role_changes trigger which rejects non-admin callers
                fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
                    method: 'PATCH',
                    headers: restHeaders,
                    body: JSON.stringify({ school_id: schoolId }),
                }),
            ]);
        }
    }
    // Non-fatal: if school setup fails the test may see the onboarding page

    // Seed complete user settings so hydration doesn't overwrite state with a
    // partial object (missing defaultFormat / language / theme crashes the
    // rubric builder). user_settings(user_id pk, settings jsonb).
    // Mirror DEFAULT_SETTINGS + DEFAULT_FORMAT from src/store/storage.ts and
    // src/types/index.ts, plus hasSeenTutorial:true to suppress the tutorial.
    await fetch(`${SUPABASE_URL}/rest/v1/user_settings`, {
        method: 'POST',
        headers: restHeaders,
        body: JSON.stringify({
            user_id: user.id,
            settings: {
                defaultGradeScaleId: 'letter-10',
                theme: 'dark',
                language: 'en',
                accentColor: '#3b82f6',
                hasSeenTutorial: true,
                defaultFormat: {
                    criterionColWidth: 200,
                    levelColWidth: 160,
                    fontSize: 14,
                    headerColor: '#1e3a5f',
                    headerTextColor: '#ffffff',
                    accentColor: '#3b82f6',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    showWeights: true,
                    showPoints: true,
                    showCalculatedGrade: true,
                    levelOrder: 'best-first',
                    headerTextAlign: 'center',
                    showBorders: true,
                    rowStriping: false,
                    orientation: 'portrait',
                },
            },
        }),
    });
    // Non-fatal if this fails; tests may see the tutorial but core behaviour still works

    // Generate magic link directly — Supabase returns the verify URL without sending email
    const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
            type: 'magiclink',
            email,
            redirect_to: APP_URL,
        }),
    });
    if (!linkRes.ok) {
        throw new Error(`Failed to generate magic link: ${linkRes.status} ${await linkRes.text()}`);
    }
    const linkData = (await linkRes.json()) as {
        action_link?: string;
        properties?: { action_link?: string };
    };
    const actionLink = linkData.action_link ?? linkData.properties?.action_link;
    if (!actionLink) {
        throw new Error(`No action_link in generate_link response: ${JSON.stringify(linkData)}`);
    }
    return actionLink;
}

/**
 * Navigate to the magic link, wait for Supabase to redirect to the app and
 * store the session in localStorage, then navigate to `/#/` explicitly.
 *
 * Without the explicit second navigation the redirect URL may land on a
 * student-portal path (when the hash is interpreted as a route) rather than
 * the teacher app, causing .main-area to never appear.
 *
 * The `rm_supabase_config` key is injected via addInitScript so the app
 * connects to the local Supabase stack on every navigation.
 */
async function signInViaMagicLink(page: Page, actionLink: string): Promise<void> {
    // Inject Supabase config before React mounts on any origin this page visits.
    // Also mark migration as done so the "Upload local data?" modal never appears:
    // the magic-link redirect briefly loads the app which hydrates Supabase data
    // to localStorage; on the subsequent page.goto(APP_URL/#/) that data triggers
    // the migration prompt and blocks all form interaction.
    await page.addInitScript(
        ({ url, key }: { url: string; key: string }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
            localStorage.setItem('rm_migration_done', 'true');
        },
        { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
    );

    // Navigate to the Supabase verify URL; it redirects to APP_URL with auth tokens
    await page.goto(actionLink, { waitUntil: 'commit' });
    await page.waitForURL(`${APP_URL}/**`, { timeout: 15_000 });

    // Wait for supabase-js to process the auth tokens and persist the session
    // (works regardless of whether the flow is implicit or PKCE code-exchange)
    await page.waitForFunction(
        () => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
        { timeout: 10_000, polling: 250 }
    );

    // Navigate explicitly to the teacher app root so we are never stuck on a
    // student-portal or other route that the auth hash may have landed on
    await page.goto(`${APP_URL}/#/`);
    // addInitScript runs again here, re-injecting rm_supabase_config for this origin

    await page.waitForSelector('.main-area', { timeout: 30_000 });
    // Wait for Supabase hydration (configure → hydrate → SET_ALL → setLandingState('hide'))
    // to fully settle before handing off.  .main-area appears as soon as landingState
    // becomes 'hide', which happens right after hydrate() resolves — but any parallel
    // network requests (e.g. profile fetch, school fetch) may still be in-flight.
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
}

/** Delete a test user by email using the service-role admin API. */
async function deleteTestUser(email: string): Promise<void> {
    try {
        const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
            headers: adminHeaders,
        });
        const { users } = (await listRes.json()) as { users: { id: string; email: string }[] };
        const user = users?.find((u) => u.email === email);
        if (!user) return;
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
            method: 'DELETE',
            headers: adminHeaders,
        });
    } catch {
        // non-fatal: stale test users are harmless in a local stack
    }
}

// ── Fixture types ─────────────────────────────────────────────────────────────

export type SupabaseFixtures = {
    /** Page that is signed in as a fresh test user with Supabase configured. */
    supabasePage: Page;
    /** Email of the active test user (for direct DB queries in tests). */
    testUserEmail: string;
    /**
     * A second page, in its own browser context, signed in as the SAME test
     * user as `supabasePage`. Represents a second device/browser for the same
     * account: independent localStorage/session, shared Supabase account.
     *
     * Obtained via a second admin `generate_link` magic-link sign-in for
     * `testUserEmail` — the admin API can mint a fresh magic link for an
     * existing user repeatedly, so no second user is created.
     */
    secondSupabasePage: Page;
};

// ── Fixture implementation ────────────────────────────────────────────────────

export const test = base.extend<SupabaseFixtures>({
    testUserEmail: [
        async ({}, use) => {
            const email = makeTestEmail();
            await use(email);
        },
        { scope: 'test' },
    ],

    supabasePage: [
        async ({ page, testUserEmail }, use) => {
            const magicLink = await createUserAndGetMagicLink(testUserEmail);
            await signInViaMagicLink(page, magicLink);

            await use(page);

            await deleteTestUser(testUserEmail);
        },
        { scope: 'test' },
    ],

    secondSupabasePage: [
        async ({ browser, testUserEmail }, use) => {
            const context = await browser.newContext();
            const page = await context.newPage();

            const magicLink = await createUserAndGetMagicLink(testUserEmail);
            await signInViaMagicLink(page, magicLink);

            await use(page);

            await context.close();
        },
        { scope: 'test' },
    ],
});

export { expect } from '@playwright/test';
