import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the standalone student essay page (/essay/:code).
 *
 * This page lives outside AppProvider — it does not need rm_local_mode or
 * any app state. The URL carries the entire assignment configuration as a
 * base64-encoded JSON blob.
 */
export class StudentEssayPage {
    constructor(private page: Page) {}

    // ── Navigation ────────────────────────────────────────────────────────────

    async goto(code: string): Promise<void> {
        await this.page.goto(`/#/essay/${code}`);
        // Do NOT reload — this page is standalone (no AppProvider) and a reload
        // would re-trigger the Supabase session check we may have mocked.
    }

    // ── Email gate (DB mode only) ─────────────────────────────────────────────

    /** The email input on the gate screen */
    emailInput(): Locator {
        return this.page.getByPlaceholder('student@school.nl');
    }

    /** The "Start essay" button on the gate screen */
    startButton(): Locator {
        return this.page.getByRole('button', { name: /start essay/i });
    }

    async fillEmailAndStart(email: string): Promise<void> {
        await this.emailInput().fill(email);
        await this.startButton().click();
    }

    // ── Essay editor ──────────────────────────────────────────────────────────

    /** ProseMirror contenteditable div — the actual writing area */
    editor(): Locator {
        return this.page.locator('.ProseMirror[contenteditable="true"]');
    }

    async typeInEditor(text: string): Promise<void> {
        await this.editor().click();
        await this.page.keyboard.type(text);
    }

    /** The word count display in the header */
    wordCountDisplay(): Locator {
        return this.page.locator('text=/\\d+ words/');
    }

    /** The submit button — label changes to "Too many words" when over the word limit */
    submitButton(): Locator {
        return this.page.getByRole('button', { name: /submit essay|too many words/i });
    }

    // ── Post-submission ───────────────────────────────────────────────────────

    /** The submission code textarea shown after a successful submit */
    submissionCodeArea(): Locator {
        return this.page.locator('textarea[readonly]');
    }

    /** Copy button next to the submission code */
    copyButton(): Locator {
        return this.page.getByRole('button', { name: /copy/i });
    }

    /** "Submitted to your teacher" success banner (DB mode) */
    dbSuccessBanner(): Locator {
        return this.page.getByText(/submitted to your teacher/i);
    }

    /** Green "Essay submitted!" confirmation area */
    submittedConfirmation(): Locator {
        return this.page.locator('text=/essay submitted/i');
    }

    // ── Header info ───────────────────────────────────────────────────────────

    signedInAs(email: string): Locator {
        return this.page.locator(`text=Signed in as ${email}`);
    }

    timerDisplay(): Locator {
        return this.page.locator('[style*="tabular-nums"]');
    }

    // ── Error / edge-case states ──────────────────────────────────────────────

    /** "Invalid or expired link" error page */
    invalidLinkMessage(): Locator {
        return this.page.getByText(/invalid or expired link/i);
    }

    /** "Assignment deadline has passed" message */
    deadlinePassedMessage(): Locator {
        return this.page.getByText(/deadline has passed/i);
    }

    /** SEB required banner (shown when requireSEB=true and not in SEB) */
    sebRequiredBanner(): Locator {
        return this.page.getByText(/must be opened in safe exam browser/i);
    }

    /** Inline submission error (DB mode failure with fallback code) */
    submissionErrorMessage(): Locator {
        return this.page.getByText(/submission failed/i);
    }
}

// ── URL builder ───────────────────────────────────────────────────────────────

export interface TestEssayAssignment {
    rubricId?: string;
    studentId?: string;
    teacherKey?: string;
    title?: string;
    prompt?: string;
    minWords?: number;
    maxWords?: number;
    timeLimitMinutes?: number;
    requireSEB?: boolean;
    readOnlyAfterSubmit?: boolean;
    createdAt?: string;
    expiresAt?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
}

export function buildEssayCode(overrides: TestEssayAssignment = {}): string {
    const assignment = {
        rubricId: 'test-rubric-id',
        studentId: 'test-student-id',
        teacherKey: 'test-teacher-key',
        title: 'E2E Test Essay',
        readOnlyAfterSubmit: true,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
    return btoa(encodeURIComponent(JSON.stringify(assignment)));
}

// ── Submission-code builder ──────────────────────────────────────────────────

/** Mirrors src/utils/urlSafeBase64.ts#encodeUrlSafeBase64 for use in Node-side test setup. */
function encodeUrlSafeBase64(input: string): string {
    const base64 = btoa(encodeURIComponent(input));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface TestEssaySubmission {
    id?: string;
    assignmentRubricId?: string;
    assignmentStudentId?: string;
    teacherKey?: string;
    contentHtml?: string;
    wordCount?: number;
    submittedAt?: string;
    wordLimitStatus?: 'ok' | 'under' | 'over';
}

/**
 * Builds a submission code as produced by src/utils/essaySubmissionCode.ts#encodeEssaySubmission —
 * the "Paste code" tab of the Import Essay modal decodes this back into an EssaySubmission.
 */
export function buildEssaySubmissionCode(overrides: TestEssaySubmission = {}): string {
    const submission = {
        id: 'test-submission-id',
        assignmentRubricId: 'test-rubric-id',
        assignmentStudentId: 'test-student-id',
        teacherKey: 'test-teacher-key',
        contentHtml: '<p>This is the student\'s handed-in essay.</p>',
        wordCount: 6,
        submittedAt: new Date().toISOString(),
        ...overrides,
    };
    return encodeUrlSafeBase64(JSON.stringify(submission));
}

// ── Short-code builder ────────────────────────────────────────────────────────

/**
 * Return a bare teacherKey (short-code format).
 * The page detects this as a short code and reads Supabase credentials from
 * the rm_supabase_config localStorage entry or VITE_SUPABASE_* env vars.
 */
export function buildShortCode(teacherKey = 'e2etestkey0123456789A'): string {
    return teacherKey;
}

// ── Edge-function mock ────────────────────────────────────────────────────────

export interface MockAssignmentContent {
    rubricId?: string;
    studentId?: string;
    title?: string;
    prompt?: string | null;
    minWords?: number | null;
    maxWords?: number | null;
    timeLimitMinutes?: number | null;
    requireSEB?: boolean;
    expiresAt?: string | null;
    readOnlyAfterSubmit?: boolean;
}

/** Route the get-essay-assignment edge function call to a fake response. */
export async function mockGetEssayAssignment(
    page: Page,
    supabaseUrl: string,
    opts: { fail?: boolean; content?: MockAssignmentContent } = {}
): Promise<void> {
    await page.route(`${supabaseUrl}/functions/v1/get-essay-assignment`, (route) => {
        if (opts.fail) {
            return route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Assignment not found' }),
            });
        }
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                rubricId: opts.content?.rubricId ?? 'test-rubric-id',
                studentId: opts.content?.studentId ?? 'test-student-id',
                title: opts.content?.title ?? 'E2E Short Code Essay',
                prompt: opts.content?.prompt ?? 'Write about the importance of automated testing.',
                minWords: opts.content?.minWords ?? null,
                maxWords: opts.content?.maxWords ?? null,
                timeLimitMinutes: opts.content?.timeLimitMinutes ?? null,
                requireSEB: opts.content?.requireSEB ?? false,
                expiresAt: opts.content?.expiresAt ?? null,
                readOnlyAfterSubmit: opts.content?.readOnlyAfterSubmit ?? true,
            }),
        });
    });
}

// ── Portal session builder ────────────────────────────────────────────────────

export function buildPortalSession(email: string, userId = 'portal-user-id') {
    const fakeJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
        '.eyJzdWIiOiJwb3J0YWwtdXNlci1pZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ' +
        '.fake-signature';
    return {
        access_token: fakeJwt,
        refresh_token: 'fake-refresh-token',
        expires_in: 3600,
        expires_at: 9999999999,
        token_type: 'bearer',
        user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email,
            is_anonymous: false,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
        },
    };
}
