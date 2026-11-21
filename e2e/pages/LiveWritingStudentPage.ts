import { expect, type Page } from '@playwright/test';
import { APP_ORIGIN } from '../appUrl';

const EDITOR = '.essay-editor-content, .ProseMirror';

/** The public student screen at `/join` and `/join/:code` (#1158). */
export class LiveWritingStudentPage {
    constructor(readonly page: Page) {}

    async openJoin(): Promise<void> {
        await this.page.goto(`${APP_ORIGIN}/#/join`);
        await expect(this.page.locator('#live-join-code')).toBeVisible({ timeout: 15_000 });
    }

    async submitCode(code: string): Promise<void> {
        await this.page.locator('#live-join-code').fill(code);
        await this.page.getByRole('button', { name: 'Find my name' }).click();
    }

    async pickName(name: string): Promise<void> {
        await expect(this.page.getByText('Who are you?')).toBeVisible({ timeout: 15_000 });
        await this.page.getByRole('button', { name }).click();
    }

    async expectWaiting(): Promise<void> {
        await expect(this.page.getByText('Wait for your teacher to start the round.')).toBeVisible({
            timeout: 15_000,
        });
    }

    async write(text: string): Promise<void> {
        const editor = this.page.locator(EDITOR).first();
        await editor.click();
        await editor.pressSequentially(text, { delay: 5 });
    }

    async expectEditorText(text: string): Promise<void> {
        await expect(this.page.locator(EDITOR).first()).toContainText(text, { timeout: 15_000 });
    }

    async handIn(): Promise<void> {
        await this.page.getByRole('button', { name: 'Hand in early' }).first().click();
        await expect(this.page.getByText('Your text is in')).toBeVisible({ timeout: 15_000 });
    }

    /** Picks the first of the three self-check faces and submits. */
    async selfCheck(note: string): Promise<void> {
        const group = this.page.getByRole('group', { name: 'How do you feel about your text?' });
        await expect(group).toBeVisible({ timeout: 15_000 });
        await group.getByRole('button').first().click();
        await this.page.locator('#live-selfcheck-note').fill(note);
        await this.page.getByRole('button', { name: 'Continue' }).click();
        await expect(this.page.getByText(note)).toBeVisible({ timeout: 15_000 });
    }

    async vote(): Promise<void> {
        const choose = this.page.getByRole('button', { name: 'Choose this text' }).first();
        await expect(choose).toBeVisible({ timeout: 25_000 });
        await choose.click();
        await expect(this.page.getByText('Vote recorded')).toBeVisible({ timeout: 15_000 });
    }

    async expectClosed(): Promise<void> {
        await expect(this.page.getByText('This session has ended')).toBeVisible({ timeout: 20_000 });
    }

    async expectError(message: string): Promise<void> {
        await expect(this.page.getByRole('alert')).toContainText(message);
    }
}
