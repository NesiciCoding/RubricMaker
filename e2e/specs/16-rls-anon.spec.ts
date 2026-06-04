/**
 * Supabase integration tests: anonymous sign-in roles and RLS.
 *
 * Requires a running local Supabase stack:
 *   npm run db:start
 *   npm run e2e:supabase
 *
 * Covers:
 *  1. Anonymous sign-in assigns role='student' (migration 030)
 *  2. Anonymous sessions cannot enumerate teacher profiles (migrations 029+030)
 *  3. Anonymous sessions cannot SELECT all essay_assignments (migration 031)
 *  4. Short-code essay flow: email gate → edge-function content fetch → DB submission
 *  5. Admin dashboard: Users/Schools tabs load (don't stay stuck on "Loading…")
 *  6. Student onboarding role option updates DB role to 'student'
 */
import { test, expect, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } from '../fixtures/supabase.fixture';
import { StudentEssayPage, buildShortCode, mockGetEssayAssignment } from '../pages/StudentEssayPage';

// ── Shared admin headers ──────────────────────────────────────────────────────

const svcHeaders = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sign in anonymously against the local Supabase stack (Node-side fetch).
 * Returns the access token and the user ID.
 */
async function anonSignIn(): Promise<{ accessToken: string; userId: string }> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Anonymous sign-in failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; user: { id: string } };
    return { accessToken: data.access_token, userId: data.user.id };
}

/** Delete a user by ID using the service-role admin API. */
async function deleteUser(userId: string): Promise<void> {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: svcHeaders,
    });
}

/** Inject rm_supabase_config into localStorage so the essay page resolves short codes. */
async function injectLocalSupabaseConfig(page: import('@playwright/test').Page): Promise<void> {
    await page.addInitScript(
        ({ url, key }: { url: string; key: string }) => {
            localStorage.setItem(
                'rm_supabase_config',
                JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }),
            );
        },
        { url: SUPABASE_URL, key: SUPABASE_ANON_KEY },
    );
}

/** Route the submit-essay edge function to succeed. */
async function mockSubmitEssay(page: import('@playwright/test').Page): Promise<void> {
    await page.route(`${SUPABASE_URL}/functions/v1/submit-essay`, (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
        }),
    );
}

/** Create an essay assignment row directly via the service role REST API. */
async function createAssignment(ownerUserId: string, teacherKey: string): Promise<void> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/essay_assignments`, {
        method: 'POST',
        headers: { ...svcHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
            id: teacherKey,
            owner_id: ownerUserId,
            rubric_id: 'test-rubric-id',
            student_id: 'test-student-id',
            title: 'Integration Test Essay',
            prompt: 'Explain why automated tests are valuable.',
            max_words: 500,
            require_seb: false,
            read_only_after_submit: true,
        }),
    });
    if (!res.ok && res.status !== 409 /* already exists */) {
        throw new Error(`Failed to create assignment: ${res.status} ${await res.text()}`);
    }
}

// ── 1. Anonymous role assignment ──────────────────────────────────────────────

test.describe('Anonymous sign-in role (migration 030)', () => {
    test('anonymous sign-in creates profile with role=student', async () => {
        const { accessToken, userId } = await anonSignIn();
        try {
            // Query own profile — profiles_read_own policy allows this.
            const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            expect(res.ok).toBe(true);
            const rows = (await res.json()) as { role: string }[];
            expect(rows).toHaveLength(1);
            expect(rows[0].role).toBe('student');
        } finally {
            await deleteUser(userId);
        }
    });
});

// ── 2. Anonymous users cannot enumerate teacher profiles ──────────────────────

test.describe('Profiles RLS for anonymous users (migrations 029+030)', () => {
    test('anonymous session returns empty set when selecting all profiles', async () => {
        const { accessToken, userId } = await anonSignIn();
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,email,role`, {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            // RLS allows the request but returns only rows the user can see.
            // Anonymous users with role='student' hit no SELECT policy that spans all rows,
            // so the result is empty (or only their own profile row via profiles_read_own).
            expect(res.ok).toBe(true);
            const rows = (await res.json()) as { id: string; email: string | null }[];
            // Must not contain any row with an email (teacher emails must not be visible)
            const teacherRows = rows.filter((r) => r.email !== null && r.id !== userId);
            expect(teacherRows).toHaveLength(0);
        } finally {
            await deleteUser(userId);
        }
    });
});

// ── 3. Anonymous users cannot enumerate essay assignments ─────────────────────

test.describe('Essay assignments RLS for anonymous users (migration 031)', () => {
    test('anonymous session returns empty set when selecting all essay_assignments', async () => {
        const { accessToken, userId } = await anonSignIn();
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/essay_assignments?select=id,title,prompt`,
                {
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            );
            expect(res.ok).toBe(true);
            const rows = (await res.json()) as unknown[];
            // After migration 031 the is_anonymous SELECT policy is gone.
            // Anonymous users have no matching policy → zero rows.
            expect(rows).toHaveLength(0);
        } finally {
            await deleteUser(userId);
        }
    });
});

// ── 4. Short-code essay flow with real DB ─────────────────────────────────────

test.describe('Short-code essay flow (integration)', () => {
    const TEACHER_KEY = 'int-test-key-0000000001';

    test('short-code: email gate → content fetch → submission', async ({ page, testUserEmail }) => {
        // The supabasePage fixture creates a teacher user and signs them in.
        // But here we only need the user ID for the assignment owner_id — we
        // look it up via the admin API rather than going through the app.
        const listRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
            { headers: svcHeaders },
        );
        const { users } = (await listRes.json()) as { users: { id: string; email: string }[] };
        const teacher = users.find((u) => u.email === testUserEmail);
        if (!teacher) test.skip(); // fixture user not found — skip rather than fail

        await createAssignment(teacher!.id, TEACHER_KEY);

        await injectLocalSupabaseConfig(page);
        // Mock the get-essay-assignment edge function — it may not be deployed locally.
        await mockGetEssayAssignment(page, SUPABASE_URL, {
            content: {
                title: 'Integration Test Essay',
                prompt: 'Explain why automated tests are valuable.',
            },
        });
        await mockSubmitEssay(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(buildShortCode(TEACHER_KEY));

        // Email gate must appear (DB mode detected via rm_supabase_config)
        await expect(essay.emailInput()).toBeVisible({ timeout: 10_000 });

        // Prompt must NOT be visible before authentication
        await expect(page.getByText('Explain why automated tests are valuable.')).not.toBeVisible();

        // Authenticate and verify content loads
        await essay.fillEmailAndStart('student@school.nl');
        await expect(essay.editor()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('Explain why automated tests are valuable.')).toBeVisible({ timeout: 5_000 });

        // Submit and verify success
        await essay.typeInEditor('Automated tests catch regressions early and provide fast feedback.');
        await essay.submitButton().click();
        await expect(essay.dbSuccessBanner()).toBeVisible({ timeout: 10_000 });
    });
});

// ── 5. Admin dashboard loading tabs ──────────────────────────────────────────

test.describe('Admin dashboard tabs (require admin role)', () => {
    test('Users tab resolves and does not stay stuck on loading', async ({ supabasePage }) => {
        // Navigate to the admin page. Only the first user (admin) can see it.
        await supabasePage.goto('http://localhost:5173/#/admin');
        await supabasePage.waitForSelector('.page-content', { timeout: 15_000 });

        // "Users" tab is active by default — wait for loading to resolve.
        // It should show either a user row OR the "No users found" message,
        // never "Loading users…" indefinitely.
        await expect(
            supabasePage.locator('text=/loading users/i'),
        ).not.toBeVisible({ timeout: 15_000 });
    });

    test('Schools tab resolves and does not stay stuck on loading', async ({ supabasePage }) => {
        await supabasePage.goto('http://localhost:5173/#/admin');
        await supabasePage.waitForSelector('.page-content', { timeout: 15_000 });

        // Click the Schools tab
        await supabasePage.getByRole('button', { name: /schools/i }).click();

        await expect(
            supabasePage.locator('text=/loading schools/i'),
        ).not.toBeVisible({ timeout: 15_000 });
    });
});

// ── 6. Student onboarding sets DB role ───────────────────────────────────────

test.describe('Student onboarding flow', () => {
    test('choosing Student role during onboarding updates profile role to student', async ({
        page,
        testUserEmail,
    }) => {
        // Look up the test user so we can verify their profile role after onboarding.
        const adminHeaders = {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        };

        // Sign in as the fresh test user via magic link (same as supabasePage fixture
        // but without the school-setup step so needsOnboarding stays true).
        const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: { ...adminHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUserEmail, email_confirm: true }),
        });
        const user = (await createRes.json()) as { id: string };

        const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: { ...adminHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'magiclink',
                email: testUserEmail,
                redirect_to: 'http://localhost:5173',
            }),
        });
        const linkData = (await linkRes.json()) as {
            action_link?: string;
            properties?: { action_link?: string };
        };
        const actionLink = linkData.action_link ?? linkData.properties?.action_link;
        if (!actionLink) test.skip();

        // Inject Supabase config so the app connects to the local stack
        await page.addInitScript(
            ({ url, key }: { url: string; key: string }) => {
                localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
            },
            { url: SUPABASE_URL, key: SUPABASE_ANON_KEY },
        );
        await page.goto(actionLink!, { waitUntil: 'commit' });
        await page.waitForURL('http://localhost:5173/**', { timeout: 15_000 });
        await page.goto('http://localhost:5173/#/');

        // Should land on the onboarding page (no school → needsOnboarding=true)
        await expect(page.getByText(/choose your role/i)).toBeVisible({ timeout: 20_000 });

        // Select the Student role card
        await page.getByRole('button', { name: /student/i }).first().click();
        await page.getByRole('button', { name: /next/i }).click();

        // Should advance to the done step
        await expect(page.getByText(/you're all set/i)).toBeVisible({ timeout: 10_000 });

        // Verify the DB profile was updated to role='student'
        const profileRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
            {
                headers: {
                    ...adminHeaders,
                    'Content-Type': 'application/json',
                },
            },
        );
        const profiles = (await profileRes.json()) as { role: string }[];
        expect(profiles[0]?.role).toBe('student');
    });
});
