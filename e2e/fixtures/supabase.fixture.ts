/**
 * Supabase-aware Playwright fixture.
 *
 * Provides `supabasePage` — a page that is signed in as a freshly-created test
 * user against a local Supabase stack.  The test user is deleted after the test.
 *
 * Sign-in uses email+password via the admin API so no inbucket/email flow is
 * needed — this keeps the tests reliable in CI where inbucket may not be
 * reachable via its HTTP API.
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

// Password used when creating test accounts via the admin API.
// Not sensitive — only valid against a throwaway local-dev stack.
const TEST_PASSWORD = 'RubricMaker-E2E-Pwd-9!Xk';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a unique test email for one test run. */
export function makeTestEmail(): string {
    return `rm-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

interface SupabaseSession {
    access_token: string;
    token_type: string;
    expires_in: number;
    expires_at: number;
    refresh_token: string;
    user: Record<string, unknown>;
}

/**
 * Create a test user with a known password via the service-role admin API,
 * then sign in to obtain a session object — no email flow required.
 */
async function createSessionForUser(email: string): Promise<SupabaseSession> {
    // Create the user (email_confirm: true skips the confirmation step)
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
    });
    if (!createRes.ok) {
        throw new Error(`Failed to create test user: ${createRes.status} ${await createRes.text()}`);
    }

    // Sign in with password to get a real session
    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });
    if (!signInRes.ok) {
        throw new Error(`Failed to sign in test user: ${signInRes.status} ${await signInRes.text()}`);
    }
    return signInRes.json() as Promise<SupabaseSession>;
}

/**
 * Inject the Supabase config and session into the page's localStorage before
 * React mounts.  The app will detect the existing session on startup and hydrate
 * from the DB without requiring any UI interaction.
 *
 * supabase-js v2 stores sessions at `sb-{hostname}-auth-token`.
 */
async function injectSession(page: Page, session: SupabaseSession): Promise<void> {
    await page.addInitScript(
        ({
            url,
            anonKey,
            storageKey,
            sessionJson,
        }: {
            url: string;
            anonKey: string;
            storageKey: string;
            sessionJson: string;
        }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey }));
            localStorage.setItem(storageKey, sessionJson);
        },
        {
            url: SUPABASE_URL,
            anonKey: SUPABASE_ANON_KEY,
            // supabase-js derives the key from the URL hostname
            storageKey: `sb-${new URL(SUPABASE_URL).hostname}-auth-token`,
            sessionJson: JSON.stringify(session),
        }
    );
}

/** Delete a test user by email using the service-role admin API. */
async function deleteTestUser(email: string): Promise<void> {
    try {
        const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
        });
        const { users } = (await listRes.json()) as { users: { id: string; email: string }[] };
        const user = users?.find((u) => u.email === email);
        if (!user) return;
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
            method: 'DELETE',
            headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
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
            const session = await createSessionForUser(testUserEmail);
            await injectSession(page, session);

            await page.goto('/#/');
            await page.waitForSelector('.main-area', { timeout: 20_000 });

            await use(page);

            await deleteTestUser(testUserEmail);
        },
        { scope: 'test' },
    ],
});

export { expect } from '@playwright/test';
