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
 * Navigate to the magic link, wait for Supabase to redirect to the app with
 * auth tokens in the hash, then wait for the app to finish hydrating.
 *
 * The `rm_supabase_config` key is injected via addInitScript so the app
 * connects to the local Supabase stack on every navigation.
 */
async function signInViaMagicLink(page: Page, actionLink: string): Promise<void> {
    // Inject Supabase config before React mounts on any origin this page visits
    await page.addInitScript(
        ({ url, key }: { url: string; key: string }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
        },
        { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
    );

    // Navigate to the Supabase verify URL; it redirects to APP_URL#access_token=...
    await page.goto(actionLink, { waitUntil: 'commit' });
    // Wait for the redirect to land on the app
    await page.waitForURL(`${APP_URL}/**`, { timeout: 15_000 });
    // supabase-js detects the #access_token hash, establishes session,
    // fires onAuthChange → AppContext connects + hydrates → shows .main-area
    await page.waitForSelector('.main-area', { timeout: 30_000 });
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
});

export { expect } from '@playwright/test';
