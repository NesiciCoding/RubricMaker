import { expect, type Page } from '@playwright/test';
import { APP_ORIGIN } from '../appUrl';
import { dismissTour } from '../fixtures/liveWritingBackend';

/** Big-screen projector at `/live/:sessionId/project` (#1159). */
export class LiveWritingProjectorPage {
    constructor(readonly page: Page) {}

    async open(sessionId: string): Promise<void> {
        await this.page.goto(`${APP_ORIGIN}/#/live/${sessionId}/project`);
        await this.waitReady();
    }

    /** The console opens the projector in a new tab, so the caller may already have navigated it. */
    async waitReady(): Promise<void> {
        await dismissTour(this.page);
        await expect(this.page.getByText('Live writing · projector')).toBeVisible({ timeout: 20_000 });
        await expect(this.page.getByText('Join code').first()).toBeVisible({ timeout: 15_000 });
    }

    async startWriting(): Promise<void> {
        await this.page.getByRole('button', { name: 'Start writing round' }).click();
        await expect(this.page.getByRole('button', { name: 'End writing' })).toBeVisible({ timeout: 15_000 });
    }

    async endWriting(): Promise<void> {
        await this.page.getByRole('button', { name: 'End writing' }).click();
        await expect(this.page.getByText('Writing is finished. The class is moving on to voting.')).toBeVisible({
            timeout: 15_000,
        });
    }

    async endSession(): Promise<void> {
        await this.page.getByRole('button', { name: 'End session' }).first().click();
        await expect(this.page.getByText('This session is closed.')).toBeVisible({ timeout: 15_000 });
    }

    async expectJoined(name: string): Promise<void> {
        await expect(this.page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 });
    }
}
