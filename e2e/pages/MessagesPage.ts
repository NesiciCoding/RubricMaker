import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class MessagesPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(): Promise<void> {
        await this.navigate('/messages');
    }

    threadCard(studentName: string): Locator {
        return this.page.locator('.card').filter({ hasText: studentName });
    }

    async openThread(studentName: string): Promise<void> {
        await this.threadCard(studentName).getByRole('button').first().click();
    }

    unreadDot(studentName: string): Locator {
        return this.threadCard(studentName).locator('span[style*="border-radius"]');
    }

    async reply(studentName: string, text: string): Promise<void> {
        const card = this.threadCard(studentName);
        await card.getByPlaceholder(/type a message/i).fill(text);
        await card.getByRole('button', { name: /send/i }).click();
    }

    async openNewThread(): Promise<void> {
        await this.page.getByRole('button', { name: /new message/i }).click();
    }

    async selectNewThreadStudent(studentName: string): Promise<void> {
        await this.page.locator('#new-thread-student').selectOption({ label: studentName });
    }

    async fillNewThreadBody(text: string): Promise<void> {
        await this.page.getByPlaceholder(/type a message/i).fill(text);
    }

    async sendNewThread(): Promise<void> {
        await this.page.getByRole('button', { name: /send/i }).click();
    }

    emptyState(): Locator {
        return this.page.locator('.empty-state');
    }
}
