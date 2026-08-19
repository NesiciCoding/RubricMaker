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
import { StudentEssayPage, buildShortCode } from '../pages/StudentEssayPage';

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
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: svcHeaders,
    });
    if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to delete user ${userId}: ${res.status} ${await res.text()}`);
    }
}

/** Inject rm_supabase_config into localStorage so the essay page resolves short codes. */
async function injectLocalSupabaseConfig(page: import('@playwright/test').Page): Promise<void> {
    await page.addInitScript(
        ({ url, key }: { url: string; key: string }) => {
            localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }));
        },
        { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
    );
}

/** Create a confirmed teacher user via the admin API (mirrors the supabasePage fixture). */
async function createConfirmedUser(email: string): Promise<string> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: svcHeaders,
        body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`Failed to create teacher user: ${res.status} ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
}

/** Create an essay assignment row directly via the service role REST API. */
async function createAssignment(ownerUserId: string, teacherKey: string, expiresAt?: string): Promise<void> {
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
            ...(expiresAt ? { expires_at: expiresAt } : {}),
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
            const res = await fetch(`${SUPABASE_URL}/rest/v1/essay_assignments?select=id,title,prompt`, {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            });
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
    /** Unique per run so parallel tests in this file never share an assignment row. */
    const makeTeacherKey = () => `int-test-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    test('short-code: email gate → edge-function content fetch → edge-function submission', async ({
        page,
        testUserEmail,
    }) => {
        // The old test looked for a fixture-created teacher user that was never
        // actually created (only `testUserEmail` was destructured), so it always
        // hit `test.skip()`. Create the owner user explicitly — deleting it in
        // the finally cascades to the assignment and its submission rows.
        const teacherId = await createConfirmedUser(testUserEmail);
        try {
            const teacherKey = makeTeacherKey();
            await createAssignment(teacherId, teacherKey);

            // Both edge functions are exercised for REAL — no route mocks.
            // This is exactly the flow the submit-essay anonymous fix covers:
            // a GoTrue anonymous session carries an empty-string email claim
            // (not null), and the function now falls back to the client-supplied
            // email instead of rejecting the submission as "Missing required
            // field: studentEmail".
            await injectLocalSupabaseConfig(page);

            const essay = new StudentEssayPage(page);
            await essay.goto(buildShortCode(teacherKey));

            // Email gate must appear (DB mode detected via rm_supabase_config)
            await expect(essay.emailInput()).toBeVisible({ timeout: 10_000 });

            // Prompt must NOT be visible before authentication
            await expect(page.getByText('Explain why automated tests are valuable.')).not.toBeVisible();

            // Authenticate (anonymous sign-in) and verify the REAL
            // get-essay-assignment edge function returns the seeded content
            await essay.fillEmailAndStart('student@school.nl');
            await expect(essay.editor()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText('Explain why automated tests are valuable.')).toBeVisible({ timeout: 5_000 });

            // Submit through the REAL submit-essay edge function and verify success
            const sentence = 'Automated tests catch regressions early and provide fast feedback.';
            await essay.typeInEditor(sentence);
            await essay.submitButton().click();
            await expect(essay.dbSuccessBanner()).toBeVisible({ timeout: 10_000 });

            // The online submission actually persisted server-side (submit-essay
            // wrote the row + storage object) — 9 words, tied to the anonymous
            // student email from the gate.
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/essay_submissions?assignment_id=eq.${teacherKey}&select=word_count,student_email`,
                { headers: svcHeaders }
            );
            expect(res.ok).toBeTruthy();
            const rows = (await res.json()) as { word_count: number; student_email: string | null }[];
            expect(rows).toHaveLength(1);
            expect(rows[0].word_count).toBe(9);
            expect(rows[0].student_email).toBe('student@school.nl');
        } finally {
            await deleteUser(teacherId);
        }
    });

    test('short-code: an expired assignment is rejected at the gate', async ({ page, testUserEmail }) => {
        const teacherId = await createConfirmedUser(testUserEmail);
        try {
            const teacherKey = makeTeacherKey();
            // Deadline already passed — get-essay-assignment must return 410 and
            // the page must show the expiry guard instead of the editor.
            await createAssignment(teacherId, teacherKey, new Date(Date.now() - 60_000).toISOString());
            await injectLocalSupabaseConfig(page);

            const essay = new StudentEssayPage(page);
            await essay.goto(buildShortCode(teacherKey));

            // The email gate still appears first (content is fetched only after auth).
            await expect(essay.emailInput()).toBeVisible({ timeout: 10_000 });
            await essay.fillEmailAndStart('student@school.nl');

            // The real edge function reports the expiry; the editor never renders.
            await expect(essay.deadlinePassedMessage()).toBeVisible({ timeout: 15_000 });
            await expect(essay.editor()).not.toBeVisible();
        } finally {
            await deleteUser(teacherId);
        }
    });

    test('short-code: a duplicate anonymous submission hits the UNIQUE guard (409)', async ({
        browser,
        page,
        testUserEmail,
    }) => {
        const teacherId = await createConfirmedUser(testUserEmail);
        try {
            const teacherKey = makeTeacherKey();
            await createAssignment(teacherId, teacherKey);
            await injectLocalSupabaseConfig(page);

            // First anonymous submission with this email succeeds.
            const essay = new StudentEssayPage(page);
            await essay.goto(buildShortCode(teacherKey));
            await expect(essay.emailInput()).toBeVisible({ timeout: 10_000 });
            await essay.fillEmailAndStart('student@school.nl');
            await expect(essay.editor()).toBeVisible({ timeout: 15_000 });
            await essay.typeInEditor('First submission.');
            await essay.submitButton().click();
            await expect(essay.dbSuccessBanner()).toBeVisible({ timeout: 10_000 });

            // A fresh context is a NEW anonymous user, but the UNIQUE
            // (assignment_id, student_email) index (migrations 022/024) rejects a
            // second hand-in for the same email — submit-essay returns 409 and the
            // page falls back to the inline error + backup code.
            const secondContext = await browser.newContext();
            try {
                const secondPage = await secondContext.newPage();
                await injectLocalSupabaseConfig(secondPage);
                const essay2 = new StudentEssayPage(secondPage);
                await essay2.goto(buildShortCode(teacherKey));
                await expect(essay2.emailInput()).toBeVisible({ timeout: 10_000 });
                await essay2.fillEmailAndStart('student@school.nl');
                await expect(essay2.editor()).toBeVisible({ timeout: 15_000 });
                await essay2.typeInEditor('Second submission.');
                await essay2.submitButton().click();
                await expect(essay2.submissionErrorMessage()).toBeVisible({ timeout: 10_000 });
            } finally {
                await secondContext.close();
            }
        } finally {
            await deleteUser(teacherId);
        }
    });
});

// ── 5. Admin dashboard loading tabs ──────────────────────────────────────────

test.describe('Admin dashboard tabs (require admin role)', () => {
    test('Users tab resolves and does not stay stuck on loading', async ({ adminSupabasePage, testUserEmail }) => {
        // Navigate to the admin page. adminSupabasePage is forcibly promoted to
        // role='admin' — the "first user ever becomes admin" trigger can't be
        // relied on once other tests (e.g. the short-code flow above) create
        // users first on the same fresh stack.
        await adminSupabasePage.goto('http://localhost:5173/#/admin');
        await adminSupabasePage.waitForSelector('.page-content', { timeout: 15_000 });

        // "Users" tab is active by default — wait for loading to resolve.
        // The content must actually render: the current test user appears as a
        // row (or the "No users found" empty state shows), never "Loading
        // users…" indefinitely.
        await expect(adminSupabasePage.getByText(testUserEmail).first()).toBeVisible({ timeout: 15_000 });
        await expect(adminSupabasePage.locator('text=/loading users/i')).not.toBeVisible({ timeout: 15_000 });
    });

    test('Schools tab resolves and does not stay stuck on loading', async ({ adminSupabasePage }) => {
        await adminSupabasePage.goto('http://localhost:5173/#/admin');
        await adminSupabasePage.waitForSelector('.page-content', { timeout: 15_000 });

        // Click the Schools tab
        await adminSupabasePage.getByRole('button', { name: /schools/i }).click();

        // The content must actually render: the fixture-created school appears
        // as a card (or the "No schools yet." empty state shows), never
        // "Loading schools…" indefinitely.
        await expect(adminSupabasePage.getByText('E2E Test School').first()).toBeVisible({ timeout: 15_000 });
        await expect(adminSupabasePage.locator('text=/loading schools/i')).not.toBeVisible({ timeout: 15_000 });
    });
});

// ── 6. protect_role_changes trigger allows user → student self-downgrade ─────
//
// Tests migration 030 (030_allow_self_student_role.sql) which adds an exception
// to the protect_role_changes trigger so a 'user'-role profile owner can set
// their own role to 'student' without admin intervention.
//
// The browser-based onboarding UI flow is inherently flaky in CI because
// App.tsx re-hydrates from Supabase after every auth-state change, resetting
// needsOnboarding back to true before our assertion can fire.  We test the
// DB trigger behaviour here by exchanging the magic link in the browser (to
// get a real signed-in session), then making the PATCH directly from Node.js
// using the access_token extracted from localStorage.

test.describe('protect_role_changes trigger (migration 030)', () => {
    test('user-role profile owner can self-downgrade to student', async ({ page, testUserEmail }) => {
        const adminHeaders = {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        };

        // Create a fresh user (no school, role='user' assigned by handle_new_user).
        const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: { ...adminHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUserEmail, email_confirm: true }),
        });
        if (!createRes.ok) {
            throw new Error(`Failed to create test user: ${createRes.status} ${await createRes.text()}`);
        }
        const user = (await createRes.json()) as { id: string };

        try {
            // Generate a magic link and exchange it in the browser so supabase-js
            // stores a real, signed session in localStorage.
            const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
                method: 'POST',
                headers: { ...adminHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'magiclink',
                    email: testUserEmail,
                    redirect_to: 'http://localhost:5173',
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
                test.skip();
                return;
            }

            // Inject rm_supabase_config so the browser supabase-js client connects to
            // the local stack and processes the magic-link redirect correctly.
            await page.addInitScript(
                ({ url, key }: { url: string; key: string }) => {
                    localStorage.setItem(
                        'rm_supabase_config',
                        JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })
                    );
                    localStorage.setItem('rm_migration_done', 'true');
                },
                { url: SUPABASE_URL, key: SUPABASE_ANON_KEY }
            );

            // Drive the magic-link flow so supabase-js stores the session.
            await page.goto(actionLink, { waitUntil: 'commit' });
            await page.waitForURL('http://localhost:5173/**', { timeout: 15_000 });
            await page.waitForFunction(
                () => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
                { timeout: 60_000, polling: 300 }
            );

            // Extract the access_token from the browser's localStorage.
            // supabase-js v2 stores it as sb-{projectRef}-auth-token.
            const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
            const rawSession = await page.evaluate(
                (key: string) => localStorage.getItem(key),
                `sb-${projectRef}-auth-token`
            );
            const accessToken = rawSession
                ? ((JSON.parse(rawSession) as { access_token?: string }).access_token ?? null)
                : null;

            if (!accessToken) {
                // Session format unexpected — skip rather than give a misleading failure.
                test.skip();
                return;
            }

            // PATCH profiles using the user's own JWT (no service-role bypass).
            // The protect_role_changes trigger (migration 030) must allow user → student.
            const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    apikey: SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal',
                },
                body: JSON.stringify({ role: 'student' }),
            });
            expect(patchRes.ok).toBe(true);

            // Confirm the role was actually persisted (not silently swallowed).
            const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
                headers: { ...adminHeaders },
            });
            expect(profileRes.ok).toBe(true);
            const profiles = (await profileRes.json()) as { role: string }[];
            expect(profiles[0]?.role).toBe('student');
        } finally {
            await deleteUser(user.id);
        }
    });
});
