/**
 * Supabase-aware Playwright fixture.
 *
 * Provides `supabasePage` — a page that is signed in as a freshly-created test
 * user against a local Supabase stack.  The test user is deleted after the test.
 *
 * Prerequisites: `npm run db:start` (local Supabase stack must be running).
 *
 * Override any default URL/key via environment variables:
 *   SUPABASE_TEST_URL            (default: http://localhost:54321)
 *   SUPABASE_TEST_ANON_KEY       (default: local-dev anon key)
 *   SUPABASE_TEST_SERVICE_KEY    (default: local-dev service role key)
 *   SUPABASE_TEST_INBUCKET_URL   (default: http://localhost:54324)
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

const INBUCKET_URL = process.env.SUPABASE_TEST_INBUCKET_URL ?? 'http://localhost:54324';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a unique test email for one test run. */
export function makeTestEmail(): string {
    return `rm-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/**
 * Request an OTP magic link, fetch it from inbucket, then navigate to it.
 * After the redirect the app lands on /#/ with an active Supabase session.
 */
async function signInViaMagicLink(page: Page, email: string): Promise<void> {
    // Request OTP (creates the user on first use with enable_confirmations=false)
    const otpRes = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, create_user: true }),
    });
    if (!otpRes.ok) {
        throw new Error(`OTP request failed ${otpRes.status}: ${await otpRes.text()}`);
    }

    // Give inbucket a moment to receive the email
    await page.waitForTimeout(1_000);

    // Fetch the email from inbucket
    const mailbox = email.split('@')[0];
    let messages: { id: string }[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);
        if (res.ok) {
            messages = (await res.json()) as { id: string }[];
            if (messages.length > 0) break;
        }
        await page.waitForTimeout(500);
    }
    if (messages.length === 0) {
        throw new Error(`No email received for ${email} in inbucket at ${INBUCKET_URL}`);
    }

    const msg = (await fetch(`${INBUCKET_URL}/api/v1/message/${messages[0].id}`).then((r) =>
        r.json()
    )) as { body: { text: string } };

    // Extract the magic link (verify URL) from the email body
    const match = msg.body.text.match(/http:\/\/[^\s\n"<>]+\/auth\/v1\/verify[^\s\n"<>]+/);
    if (!match) throw new Error('Magic link not found in email body');
    const magicLink = match[0].trim();

    // Navigate to the magic link; Supabase verifies the token and redirects to the app
    // with access_token + refresh_token in the URL hash, which supabase-js picks up.
    await page.goto(magicLink);
    await page.waitForURL(/\/#/, { timeout: 15_000 });
    await page.waitForSelector('.main-area', { timeout: 20_000 });
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
            // Inject Supabase config before React mounts so the app can
            // pick it up on startup (addInitScript runs before every navigation).
            await page.addInitScript(
                ({ url, key }: { url: string; key: string }) => {
                    localStorage.setItem(
                        'rm_supabase_config',
                        JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })
                    );
                },
                { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
            );

            await signInViaMagicLink(page, testUserEmail);

            await use(page);

            await deleteTestUser(testUserEmail);
        },
        { scope: 'test' },
    ],
});

export { expect } from '@playwright/test';
