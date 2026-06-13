import type { Page, Locator } from '@playwright/test';

/**
 * Page object for the standalone student test page (/test/:code).
 *
 * Mirrors StudentEssayPage.ts — this page lives outside AppProvider and works
 * from the URL-encoded assignment alone, with no rm_local_mode requirement.
 */
export class StudentTestPage {
    constructor(private page: Page) {}

    // ── Navigation ────────────────────────────────────────────────────────────

    async goto(code: string): Promise<void> {
        await this.page.goto(`/#/test/${code}`);
        // Standalone page — do NOT reload, mirroring StudentEssayPage.
    }

    // ── Header / progress ────────────────────────────────────────────────────

    testTitle(name: string): Locator {
        return this.page.getByRole('heading', { name });
    }

    progressIndicator(): Locator {
        return this.page.locator('text=/\\d+ \\/ \\d+ answered/');
    }

    timerDisplay(): Locator {
        return this.page.locator('[style*="tabular-nums"]');
    }

    // ── Question interaction ─────────────────────────────────────────────────

    questionPrompt(): Locator {
        return this.page.locator('p').filter({ hasText: /.+/ }).first();
    }

    async selectMultipleChoiceOption(optionText: string): Promise<void> {
        await this.page.getByRole('radio', { name: optionText }).check();
    }

    async fillShortAnswer(text: string): Promise<void> {
        await this.page.getByPlaceholder(/type your answer/i).fill(text);
    }

    async fillOpenAnswer(text: string): Promise<void> {
        await this.page.getByPlaceholder(/write your answer here/i).fill(text);
    }

    async clickNext(): Promise<void> {
        await this.page.getByRole('button', { name: /^next$/i }).click();
    }

    async clickPrevious(): Promise<void> {
        await this.page.getByRole('button', { name: /^previous$/i }).click();
    }

    // ── Submission ────────────────────────────────────────────────────────────

    submitButton(): Locator {
        return this.page.getByRole('button', { name: /submit test/i });
    }

    async submit(): Promise<void> {
        await this.submitButton().click();
    }

    /** Green "Test submitted!" confirmation area (offline mode). */
    submittedConfirmation(): Locator {
        return this.page.getByText(/test submitted/i);
    }

    /** The submission code textarea shown after a successful offline submit. */
    submissionCodeArea(): Locator {
        return this.page.locator('textarea[readonly]');
    }

    async getSubmissionCode(): Promise<string> {
        return this.submissionCodeArea().inputValue();
    }

    // ── Banners / guards ──────────────────────────────────────────────────────

    invalidLinkMessage(): Locator {
        return this.page.getByText(/invalid or expired link/i);
    }

    sebRequiredBanner(): Locator {
        return this.page.getByText(/must be opened in safe exam browser/i);
    }

    draftRestoredBanner(): Locator {
        return this.page.getByText(/your answers were restored/i);
    }

    liveDisclosureBanner(): Locator {
        return this.page.getByText(/your teacher can see your work live/i);
    }

    // ── Telemetry helpers ─────────────────────────────────────────────────────

    /**
     * Simulate the student switching away from the tab.
     *
     * useLiveSessionTelemetry listens for `document.visibilitychange` (when
     * document.visibilityState === 'hidden') and `window.blur`. A plain
     * `window.dispatchEvent(new Event('blur'))` triggers the blur listener
     * without needing to override the read-only visibilityState property.
     */
    async triggerTabSwitch(): Promise<void> {
        await this.page.evaluate(() => {
            window.dispatchEvent(new Event('blur'));
        });
    }
}
