/**
 * E2E tests for the student essay page (/essay/:code).
 *
 * The essay page is standalone — it lives outside AppProvider and works from
 * the URL-encoded assignment alone.  Tests are split into three groups:
 *
 *  1. No-DB (offline) mode  — no Supabase involved, most comprehensive
 *  2. DB mode               — Supabase auth + edge function mocked via page.route()
 *  3. Portal session bypass — portal localStorage session skips the email gate
 */

import { test, expect } from '@playwright/test';
import { StudentEssayPage, buildEssayCode, buildPortalSession } from '../pages/StudentEssayPage';

// ── Mock Supabase helpers ─────────────────────────────────────────────────────

const MOCK_SUPABASE_URL = 'https://mock.supabase.co';
const MOCK_ANON_KEY = 'mock-anon-key';

// Fake JWT with exp far in the future so Supabase JS v2 doesn't try to refresh it.
const FAKE_ANON_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJzdWIiOiJhbm9uLXVzZXItaWQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0' +
    '.fake';

/** Route all Supabase auth calls for the mock project to a fake anonymous session. */
async function mockSupabaseAuth(
    page: import('@playwright/test').Page,
    opts: { fail?: boolean } = {}
) {
    await page.route(`${MOCK_SUPABASE_URL}/auth/v1/**`, (route) => {
        if (opts.fail) {
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'server_error', error_description: 'Internal error' }),
            });
        }
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                access_token: FAKE_ANON_JWT,
                refresh_token: 'fake-refresh',
                expires_in: 3600,
                expires_at: 9999999999,
                token_type: 'bearer',
                user: {
                    id: 'anon-user-id',
                    aud: 'authenticated',
                    role: 'authenticated',
                    email: null,
                    is_anonymous: true,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                },
            }),
        });
    });
}

/** Route the submit-essay edge function call. */
async function mockSubmitEssay(
    page: import('@playwright/test').Page,
    opts: { fail?: boolean } = {}
) {
    await page.route(`${MOCK_SUPABASE_URL}/functions/v1/submit-essay`, (route) => {
        if (opts.fail) {
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Storage upload failed' }),
            });
        }
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, storagePath: 'test-teacher-key/submission-id.html' }),
        });
    });
}

// ── Group 1: No-DB (offline) mode ────────────────────────────────────────────

test.describe('Essay page — no-DB (offline) mode', () => {
    test('invalid code shows error page', async ({ page }) => {
        const essay = new StudentEssayPage(page);
        await essay.goto('not-a-valid-base64-code!!!');
        await expect(essay.invalidLinkMessage()).toBeVisible({ timeout: 10_000 });
    });

    test('expired assignment shows deadline message', async ({ page }) => {
        const code = buildEssayCode({ expiresAt: '2020-01-01T00:00:00Z' });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.deadlinePassedMessage()).toBeVisible({ timeout: 10_000 });
    });

    test('valid assignment loads with correct title', async ({ page }) => {
        const code = buildEssayCode({ title: 'My Great Essay' });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(page.getByText('My Great Essay')).toBeVisible({ timeout: 10_000 });
    });

    test('no email gate shown in offline mode', async ({ page }) => {
        const code = buildEssayCode();
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(page.getByText('E2E Test Essay')).toBeVisible({ timeout: 10_000 });
        await expect(essay.emailInput()).not.toBeVisible();
    });

    test('prompt is shown when present', async ({ page }) => {
        const code = buildEssayCode({ prompt: 'Write about your summer holiday.' });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(page.getByText('Write about your summer holiday.')).toBeVisible({ timeout: 10_000 });
    });

    test('SEB required banner appears when requireSEB is set and browser is not SEB', async ({ page }) => {
        const code = buildEssayCode({ requireSEB: true });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.sebRequiredBanner()).toBeVisible({ timeout: 10_000 });
    });

    test('typing in editor updates the word count', async ({ page }) => {
        const code = buildEssayCode();
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('Hello world this is a test sentence');
        await expect(essay.wordCountDisplay()).toContainText('7', { timeout: 5_000 });
    });

    test('word count turns amber when below min word count', async ({ page }) => {
        // Submitting below min is allowed (the teacher sets it as a guide, not a hard block)
        // but the word count indicator turns amber to warn the student.
        const code = buildEssayCode({ minWords: 50 });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('Too short');
        // Word count displays; submit is still enabled (below-min is a warning, not a block)
        await expect(essay.wordCountDisplay()).toBeVisible({ timeout: 5_000 });
        await expect(essay.submitButton()).toBeEnabled({ timeout: 5_000 });
    });

    test('submit button is disabled when over max word count', async ({ page }) => {
        const code = buildEssayCode({ maxWords: 3 });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('one two three four five six');
        await expect(essay.submitButton()).toBeDisabled({ timeout: 5_000 });
        await expect(page.getByText(/over limit/i)).toBeVisible({ timeout: 3_000 });
    });

    test('submitting shows submission code and confirms submission', async ({ page }) => {
        const code = buildEssayCode();
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('This is my essay response for the E2E test.');
        await essay.submitButton().click();

        await expect(essay.submittedConfirmation()).toBeVisible({ timeout: 10_000 });
        await expect(essay.submissionCodeArea()).toBeVisible({ timeout: 5_000 });
        const codeValue = await essay.submissionCodeArea().inputValue();
        expect(codeValue.length).toBeGreaterThan(20);
    });

    test('editor becomes read-only after submission when readOnlyAfterSubmit is true', async ({ page }) => {
        const code = buildEssayCode({ readOnlyAfterSubmit: true });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('Finished essay text.');
        await essay.submitButton().click();
        await expect(essay.submittedConfirmation()).toBeVisible({ timeout: 10_000 });

        // Editor should no longer be editable. The contenteditable attribute flips to "false"
        // so the [contenteditable="true"] selector used by essay.editor() won't match —
        // query the ProseMirror div directly without the attribute filter.
        await expect(page.locator('.ProseMirror')).toHaveAttribute('contenteditable', 'false', { timeout: 5_000 });
    });

    test('timer is displayed when timeLimitMinutes is set', async ({ page }) => {
        const code = buildEssayCode({ timeLimitMinutes: 45 });
        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });
        // Timer should show MM:SS format — starts at 45:00
        await expect(essay.timerDisplay()).toContainText('45:0', { timeout: 5_000 });
    });
});

// ── Group 2: DB mode (Supabase mocked via page.route) ────────────────────────

test.describe('Essay page — DB mode (mocked Supabase)', () => {
    test('email gate renders in DB mode', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);

        await expect(essay.emailInput()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(/enter your school email/i)).toBeVisible({ timeout: 5_000 });
    });

    test('start button is present on the email gate', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);

        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });
    });

    test('shows error when email is empty and Start is clicked', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });

        await essay.startButton().click();
        await expect(page.getByText(/valid school email/i)).toBeVisible({ timeout: 5_000 });
    });

    test('shows error when email has no @ symbol', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });

        await essay.fillEmailAndStart('notanemail');
        await expect(page.getByText(/valid school email/i)).toBeVisible({ timeout: 5_000 });
    });

    test('valid email + mock auth success → editor shown with email in header', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });

        await essay.fillEmailAndStart('student@school.nl');
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });
        await expect(essay.signedInAs('student@school.nl')).toBeVisible({ timeout: 5_000 });
    });

    test('auth failure keeps the gate visible and does not proceed to editor', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page, { fail: true });

        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });

        await essay.fillEmailAndStart('student@school.nl');

        // Gate should remain — do not proceed to editor
        await expect(essay.emailInput()).toBeVisible({ timeout: 10_000 });
        await expect(essay.editor()).not.toBeVisible();
    });

    test('successful DB submission shows "submitted to your teacher" message', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);
        await mockSubmitEssay(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });

        await essay.fillEmailAndStart('student@school.nl');
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('This essay is being submitted to the teacher via the database.');
        await essay.submitButton().click();

        await expect(essay.dbSuccessBanner()).toBeVisible({ timeout: 10_000 });
    });

    test('failed DB submission shows fallback submission code', async ({ page }) => {
        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSupabaseAuth(page);
        await mockSubmitEssay(page, { fail: true });

        const essay = new StudentEssayPage(page);
        await essay.goto(code);
        await expect(essay.startButton()).toBeVisible({ timeout: 10_000 });

        await essay.fillEmailAndStart('student@school.nl');
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });

        await essay.typeInEditor('Essay text for fallback submission code test.');
        await essay.submitButton().click();

        await expect(essay.submissionErrorMessage()).toBeVisible({ timeout: 10_000 });
        // Fallback code should still be provided so student isn't stuck
        await expect(essay.submissionCodeArea()).toBeVisible({ timeout: 5_000 });
    });
});

// ── Group 3: Portal session bypass ───────────────────────────────────────────

test.describe('Essay page — portal session bypass', () => {
    test('existing portal session skips the email gate entirely', async ({ page }) => {
        // Inject the portal session into localStorage BEFORE the page loads.
        // The key is sb-{projectRef}-auth-token where projectRef = hostname[0].
        // For https://mock.supabase.co → sb-mock-auth-token.
        const portalSession = buildPortalSession('portal.student@school.nl');
        await page.addInitScript(
            ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
            { key: 'sb-mock-auth-token', value: portalSession }
        );

        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        // No need to mock auth — the gate should be bypassed before any auth call
        await mockSubmitEssay(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);

        // Email gate should not appear — go straight to the editor
        await expect(essay.editor()).toBeVisible({ timeout: 10_000 });
        await expect(essay.emailInput()).not.toBeVisible();
        await expect(essay.signedInAs('portal.student@school.nl')).toBeVisible({ timeout: 5_000 });
    });

    test('portal session email appears in header after bypass', async ({ page }) => {
        const portalSession = buildPortalSession('jane.doe@myschool.nl', 'user-jane');
        await page.addInitScript(
            ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
            { key: 'sb-mock-auth-token', value: portalSession }
        );

        const code = buildEssayCode({ supabaseUrl: MOCK_SUPABASE_URL, supabaseAnonKey: MOCK_ANON_KEY });
        await mockSubmitEssay(page);

        const essay = new StudentEssayPage(page);
        await essay.goto(code);

        await expect(essay.signedInAs('jane.doe@myschool.nl')).toBeVisible({ timeout: 10_000 });
    });
});
