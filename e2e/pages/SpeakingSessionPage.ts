import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SpeakingSessionPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(rubricId: string, studentId: string): Promise<void> {
        await this.navigate(`/speaking/${rubricId}/${studentId}`);
    }

    async setDurationMinutes(minutes: number): Promise<void> {
        await this.page.locator('input[type="number"]').fill(String(minutes));
    }

    private timerCard() {
        return this.page.locator('[data-tour="sp-timer"]');
    }

    async startTimer(): Promise<void> {
        await this.timerCard().getByRole('button', { name: 'Start' }).click();
    }

    async stopTimer(): Promise<void> {
        // scoped to the timer card — "Stop" also appears on the unrelated
        // recording controls' "Stop recording" button elsewhere on the page
        await this.timerCard().getByRole('button', { name: 'Stop', exact: true }).click();
    }

    async addPronunciationMark(errorTypeLabel: string): Promise<void> {
        await this.page.getByRole('button', { name: errorTypeLabel }).click();
    }

    async recordAudio(): Promise<void> {
        await this.page.getByRole('button', { name: /record audio/i }).click();
    }

    async stopRecording(): Promise<void> {
        await this.page.getByRole('button', { name: /stop recording/i }).click();
    }

    recordingsList() {
        return this.page.locator('ul li');
    }

    async selectLevel(criterionIndex: number, levelLabel: string): Promise<void> {
        const criterionCard = this.page.locator('[data-tour="sp-scoring"] > div > div').nth(criterionIndex);
        await criterionCard.getByRole('button', { name: new RegExp(levelLabel) }).click();
    }

    async fillOverallComment(text: string): Promise<void> {
        await this.page.locator('textarea').fill(text);
    }

    async save(): Promise<void> {
        // Save Session button is duplicated in the topbar and at the page bottom.
        await this.page.getByRole('button', { name: /save session/i }).first().click();
    }

    async waitForSaved(): Promise<void> {
        await this.page.getByRole('button', { name: /session saved/i }).first().waitFor({ timeout: 5_000 });
    }

    gradeSummary() {
        return this.page.locator('.card').filter({ hasText: /grade/i }).last();
    }
}
