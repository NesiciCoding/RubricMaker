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
import { execFileSync } from 'node:child_process';

// ── Supabase local-dev defaults (produced by `supabase start`) ────────────────

export const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://localhost:54321';

export const SUPABASE_ANON_KEY =
    process.env.SUPABASE_TEST_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oHv2oGAXG7XLHCB0PkMGUjwkH0ZFJNF4';

export const SUPABASE_SERVICE_KEY =
    process.env.SUPABASE_TEST_SERVICE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0';

const APP_URL = 'http://localhost:5173';

/** Local Supabase Postgres connection (from `supabase start`'s default [db] port). */
const DB_URL = process.env.SUPABASE_TEST_DB_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

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

// Mirror DEFAULT_SETTINGS + DEFAULT_FORMAT from src/store/storage.ts and src/types/index.ts.
// A partial settings object (missing defaultFormat) crashes the rubric builder/list on hydration.
const FULL_TEST_SETTINGS = {
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
    // partial object. user_settings(user_id pk, settings jsonb).
    await fetch(`${SUPABASE_URL}/rest/v1/user_settings`, {
        method: 'POST',
        headers: restHeaders,
        body: JSON.stringify({ user_id: user.id, settings: FULL_TEST_SETTINGS }),
    });
    // Non-fatal if this fails; tests may see the tutorial but core behaviour still works

    return generateMagicLinkForExistingUser(email);
}

/** Look up the school_id assigned to a user's profile (set by createUserAndGetMagicLink). */
async function getSchoolIdForEmail(email: string): Promise<string | null> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=school_id`, {
        headers: adminHeaders,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { school_id: string | null }[];
    return rows[0]?.school_id ?? null;
}

/**
 * Create a second confirmed user who joins an EXISTING school (a colleague at
 * the same school, as opposed to `secondSupabasePage` which is the same user
 * on a second device). Used by department-sharing/co-grading tests that need
 * two distinct teacher accounts in the same school.
 */
async function createColleagueAndGetMagicLink(email: string, schoolId: string): Promise<string> {
    const restHeaders = { ...adminHeaders, Prefer: 'return=representation' };

    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!createRes.ok) {
        throw new Error(`Failed to create colleague user: ${createRes.status} ${await createRes.text()}`);
    }
    const user = (await createRes.json()) as { id: string };

    const [schoolMemberRes, profilePatchRes, userSettingsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/school_members`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify({ school_id: schoolId, profile_id: user.id }),
        }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
            method: 'PATCH',
            headers: restHeaders,
            body: JSON.stringify({ school_id: schoolId }),
        }),
        fetch(`${SUPABASE_URL}/rest/v1/user_settings`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify({ user_id: user.id, settings: FULL_TEST_SETTINGS }),
        }),
    ]);

    const failures = (
        [
            ['school_members', schoolMemberRes],
            ['profiles', profilePatchRes],
            ['user_settings', userSettingsRes],
        ] as const
    ).filter(([, res]) => !res.ok);

    if (failures.length > 0) {
        const details = await Promise.all(
            failures.map(async ([name, res]) => `${name}: ${res.status} ${await res.text()}`)
        );
        throw new Error(`Failed to initialize colleague user ${user.id} (${details.join('; ')})`);
    }

    return generateMagicLinkForExistingUser(email);
}

/**
 * Generate a fresh magic-link sign-in URL for an EXISTING user — does not
 * create a user. The admin `generate_link` API can be called repeatedly for
 * the same email, so this is safe to use for additional "devices" signing in
 * as the same account (see `secondSupabasePage`).
 */
async function generateMagicLinkForExistingUser(email: string): Promise<string> {
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

/**
 * Force a user's role to 'admin' for the Admin Dashboard e2e specs.
 *
 * `updateUserRole` (and any REST/PostgREST path) is rejected by the
 * `enforce_role_protection` trigger unless the CALLER is already an admin
 * (migration 007_roles_rls.sql) — the service-role key doesn't bypass this,
 * since the trigger checks `get_my_role()` against `auth.uid()`, not the
 * Postgres role. The only real admin is whichever profile was created first
 * in the whole local stack, which isn't reliably this test's user once other
 * specs have run against the same `db:start` instance. Connecting directly as
 * the Postgres superuser and disabling the trigger for one UPDATE is the only
 * deterministic way to promote an arbitrary test user.
 */
function promoteToAdmin(email: string): void {
    const sql = `
        ALTER TABLE public.profiles DISABLE TRIGGER enforce_role_protection;
        UPDATE public.profiles SET role = 'admin' WHERE email = '${email.replace(/'/g, "''")}';
        ALTER TABLE public.profiles ENABLE TRIGGER enforce_role_protection;
    `;
    execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
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
    /** Email of a second, distinct teacher account in the SAME school as `testUserEmail`. */
    colleagueEmail: string;
    /**
     * A page signed in as `colleagueEmail` — a real second teacher at the same
     * school as `supabasePage`'s user, for department-sharing/co-grading tests.
     */
    colleaguePage: Page;
    /** Page signed in as a test user forcibly promoted to the 'admin' role, for Admin Dashboard specs. */
    adminSupabasePage: Page;
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
        // Depends on `supabasePage` purely for ordering: it creates `testUserEmail`
        // in Supabase, which must happen before we can generate a second magic
        // link for that user.
        async ({ browser, testUserEmail, supabasePage }, use) => {
            void supabasePage;

            const context = await browser.newContext();
            try {
                const page = await context.newPage();
                const magicLink = await generateMagicLinkForExistingUser(testUserEmail);
                await signInViaMagicLink(page, magicLink);
                await use(page);
            } finally {
                await context.close();
            }
        },
        { scope: 'test' },
    ],

    colleagueEmail: [
        // Playwright requires the first param to be a (possibly empty) destructuring
        // pattern; it parses this statically to detect fixture dependencies, so it
        // cannot be renamed to a plain identifier.
        // eslint-disable-next-line no-empty-pattern
        async ({}, run) => {
            const email = makeTestEmail();
            await run(email);
        },
        { scope: 'test' },
    ],

    adminSupabasePage: [
        async ({ page, testUserEmail }, use) => {
            const magicLink = await createUserAndGetMagicLink(testUserEmail);
            promoteToAdmin(testUserEmail);
            await signInViaMagicLink(page, magicLink);

            await use(page);

            await deleteTestUser(testUserEmail);
        },
        { scope: 'test' },
    ],

    colleaguePage: [
        // Depends on `supabasePage` so testUserEmail's school already exists.
        async ({ browser, testUserEmail, colleagueEmail, supabasePage }, run) => {
            void supabasePage;

            const schoolId = await getSchoolIdForEmail(testUserEmail);
            if (!schoolId) {
                throw new Error(
                    `No school_id found for ${testUserEmail} — cannot create a colleague in the same school`
                );
            }

            const context = await browser.newContext();
            try {
                const page = await context.newPage();
                const magicLink = await createColleagueAndGetMagicLink(colleagueEmail, schoolId);
                await signInViaMagicLink(page, magicLink);
                await run(page);
            } finally {
                await context.close();
                await deleteTestUser(colleagueEmail);
            }
        },
        { scope: 'test' },
    ],
});

export { expect } from '@playwright/test';
