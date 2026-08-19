import type { Page } from '@playwright/test';

/**
 * Page object for the essay builder (/#/essays/new) — the teacher-side of
 * EssayBuilderPage.tsx.
 *
 * Prefer role/placeholder-based locators over order-dependent CSS selectors:
 * the title field has no id, so it is addressed by its placeholder (which is
 * the `essays.title_label` text); the remaining fields expose stable ids.
 */
export class EssayBuilderPage {
    constructor(private page: Page) {}

    async gotoNew(): Promise<void> {
        await this.page.goto('/#/essays/new');
        await this.page.reload();
        await this.page.waitForSelector('.main-area', { timeout: 20_000 });
    }

    titleInput() {
        // The title field has no id/htmlFor; its placeholder is the
        // `essays.title_label` text ("Title"), which is unique on this page.
        return this.page.getByPlaceholder('Title');
    }

    promptBody() {
        return this.page.locator('#eb-prompt-body');
    }

    minWords() {
        return this.page.locator('#eb-min-words');
    }

    maxWords() {
        return this.page.locator('#eb-max-words');
    }

    timeLimit() {
        return this.page.locator('#eb-time-limit');
    }

    rubricSelect() {
        return this.page.getByRole('combobox', { name: 'Rubric' });
    }

    /** Fill the title, prompt, word limits, and time limit. */
    async fillBasics(
        title: string,
        options: { prompt: string; minWords: string; maxWords: string; timeLimit: string }
    ): Promise<void> {
        await this.titleInput().fill(title);
        await this.promptBody().fill(options.prompt);
        await this.minWords().fill(options.minWords);
        await this.maxWords().fill(options.maxWords);
        await this.timeLimit().fill(options.timeLimit);
    }

    async selectRubric(rubricName: string): Promise<void> {
        await this.rubricSelect().selectOption(rubricName);
    }

    /** Open the assignment dialog and pick the target class. */
    async assignToClass(className: string): Promise<void> {
        await this.page.getByRole('button', { name: /assign to students/i }).click();
        await this.page.getByRole('button', { name: className }).click();
    }
}
