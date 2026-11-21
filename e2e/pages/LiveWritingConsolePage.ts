import { expect, type Page } from '@playwright/test';
import { APP_ORIGIN } from '../appUrl';
import { dismissTour } from '../fixtures/liveWritingBackend';

/** Teacher console at `/live` and `/live/:sessionId` (#1159). */
export class LiveWritingConsolePage {
    constructor(readonly page: Page) {}

    async openNew(): Promise<void> {
        await this.page.goto(`${APP_ORIGIN}/#/live/new`);
        await dismissTour(this.page);
        await expect(this.page.locator('#live-title')).toBeVisible({ timeout: 15_000 });
    }

    async fillDraft(input: { title: string; prompt: string; className?: string }): Promise<void> {
        await this.page.locator('#live-title').fill(input.title);
        await this.page.locator('#live-prompt').fill(input.prompt);
        await this.page.locator('#live-class').selectOption({ label: input.className ?? 'Class 4A' });
    }

    /** Saves the draft and lands on the session's own console URL. */
    async saveDraft(): Promise<void> {
        await this.page.getByRole('button', { name: 'Save draft' }).click();
        await this.page.waitForURL(/#\/live\/[^/]+$/, { timeout: 20_000 });
    }

    async openLobby(): Promise<void> {
        await this.page.getByRole('button', { name: 'Open lobby' }).click();
        await expect(this.page.getByText('Lobby is open — students can join')).toBeVisible({ timeout: 15_000 });
    }

    async expectJoinCode(code: string): Promise<void> {
        await expect(this.page.getByText(`Join code`).first()).toBeVisible({ timeout: 15_000 });
        await expect(this.page.getByText(code, { exact: true })).toBeVisible({ timeout: 15_000 });
    }

    async expectParticipant(name: string): Promise<void> {
        await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 });
    }
}
