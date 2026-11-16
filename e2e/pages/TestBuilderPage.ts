import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class TestBuilderPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async gotoNew(): Promise<void> {
        await this.navigate('/tests/new');
    }

    async gotoEdit(id: string): Promise<void> {
        await this.navigate(`/tests/${id}`);
    }

    async fillName(name: string): Promise<void> {
        const input = this.page.locator('#test-name');
        await input.clear();
        await input.fill(name);
    }

    async fillDescription(description: string): Promise<void> {
        const input = this.page.locator('#test-description');
        await input.clear();
        await input.fill(description);
    }

    /** The settings card is a tabbed drawer now: open the tab that holds the field first. */
    async openSettings(tab: 'basics' | 'delivery' | 'scoring' | 'placement' | 'print' = 'basics'): Promise<void> {
        await this.page.getByTestId(`settings-tile-${tab}`).click();
        await this.page.getByTestId('settings-drawer').waitFor({ state: 'visible' });
    }

    async closeSettings(): Promise<void> {
        await this.page.getByTestId('settings-done').click();
        await this.page.getByTestId('settings-drawer').waitFor({ state: 'detached' });
    }

    async setDuration(minutes: number): Promise<void> {
        await this.openSettings('delivery');
        const input = this.page.locator('#test-duration');
        await input.clear();
        await input.fill(String(minutes));
        await this.closeSettings();
    }

    async setRequireSEB(checked: boolean): Promise<void> {
        await this.openSettings('delivery');
        const checkbox = this.page.getByLabel(/require safe exam browser/i);
        if ((await checkbox.isChecked()) !== checked) {
            await checkbox.click();
        }
        await this.closeSettings();
    }

    /** Adding a question opens the type picker; pick the type the new question should have. */
    async addQuestion(type = 'multiple-choice'): Promise<void> {
        await this.page
            .getByRole('button', { name: /add question/i })
            .first()
            .click();
        await this.page.locator(`[data-question-type="${type}"]`).click();
    }

    questionCard(index: number): Locator {
        return this.page.locator('.card').filter({ hasText: `Question ${index + 1}` });
    }

    async setQuestionPrompt(index: number, prompt: string): Promise<void> {
        // Phase 23.2: the prompt field is a TipTap rich-text editor (EssayEditor for most types,
        // ClozeGapEditor for cloze/cloze-dropdown), not a plain textarea — no placeholder attribute
        // to target. `.fill()` works on contenteditable elements.
        const editor = this.questionCard(index).locator('.essay-editor-content, .cloze-gap-editor-content').first();
        await editor.fill(prompt);
    }

    async setQuestionType(index: number, type: 'multiple-choice' | 'short-answer' | 'open'): Promise<void> {
        // The type field opens the picker rather than a native <select>. Cards carry
        // data-question-type, so this doesn't depend on translated card labels.
        await this.questionCard(index)
            .getByLabel(/question type/i)
            .click();
        await this.page.getByRole('dialog').locator(`[data-question-type="${type}"]`).click();
    }

    async setQuestionPoints(index: number, points: number): Promise<void> {
        const input = this.questionCard(index).locator('input[type="number"]').first();
        await input.fill(String(points));
    }

    /** Fill the text of a multiple-choice option (0-based) for the given question. */
    async setOptionText(index: number, optionIndex: number, text: string): Promise<void> {
        const inputs = this.questionCard(index).getByPlaceholder(/option text/i);
        await inputs.nth(optionIndex).fill(text);
    }

    /** Mark the given option as the correct answer for a multiple-choice question. */
    async markOptionCorrect(index: number, optionIndex: number): Promise<void> {
        const buttons = this.questionCard(index).getByRole('button', { name: /mark as correct answer/i });
        await buttons.nth(optionIndex).click();
    }

    async setExpectedAnswer(index: number, answer: string): Promise<void> {
        const input = this.questionCard(index).getByPlaceholder(/model answer\(s\)? for auto-scoring/i);
        await input.fill(answer);
    }

    async save(): Promise<void> {
        await this.page.getByRole('button', { name: /^save$/i }).click();
    }

    async waitForSaved(): Promise<void> {
        await Promise.any([
            this.page.getByText(/test saved/i).waitFor({ timeout: 8_000 }),
            this.page.waitForURL(/\/#\/tests\/(?!new)[^/]*$/, { timeout: 8_000 }),
        ]);
    }

    getNameError(): Locator {
        return this.page.getByText(/test name is required/i);
    }
}
