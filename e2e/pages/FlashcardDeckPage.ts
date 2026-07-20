import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/** Deck edits autosave 700ms after the last change — see FlashcardDeckPage.tsx's AUTOSAVE_DELAY_MS. */
const AUTOSAVE_WAIT_MS = 1_000;

export class FlashcardDeckPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(deckId: string): Promise<void> {
        await this.navigate(`/flashcards/${deckId}`);
    }

    async fillName(name: string): Promise<void> {
        await this.page.locator('#deck-name').fill(name);
    }

    async addCard(): Promise<void> {
        await this.page.getByRole('button', { name: 'Add card' }).click();
    }

    async fillCardFront(index: number, text: string): Promise<void> {
        await this.page.getByLabel('Front (word)').nth(index).fill(text);
    }

    async fillCardBack(index: number, text: string): Promise<void> {
        await this.page.getByLabel('Back (translation)').nth(index).fill(text);
    }

    async removeCard(index: number): Promise<void> {
        await this.page.getByLabel('Remove card').nth(index).click();
    }

    async selectAssignClass(className: string): Promise<void> {
        // exact: true — a substring match would also hit the sidebar's "Active class" selector.
        await this.page.getByLabel('Class', { exact: true }).selectOption({ label: className });
    }

    async assign(): Promise<void> {
        await this.page.getByRole('button', { name: /assign to class/i }).click();
    }

    async waitForAutosave(): Promise<void> {
        await this.page.waitForTimeout(AUTOSAVE_WAIT_MS);
    }

    cardsHeading(): Locator {
        return this.page.getByText(/^Cards \(\d+\)$/);
    }

    // ── Practice (teacher preview) modal — reuses FlashcardStudySession, no persistence ──

    async openPractice(): Promise<void> {
        await this.page.getByRole('button', { name: 'Practice' }).click();
    }

    practiceModal(): Locator {
        return this.page.getByRole('dialog');
    }

    async revealCard(): Promise<void> {
        await this.practiceModal()
            .getByRole('button', { name: /show answer/i })
            .click();
    }

    async rateCard(rating: 'Again' | 'Hard' | 'Good' | 'Easy'): Promise<void> {
        await this.practiceModal().getByRole('button', { name: rating, exact: false }).click();
    }

    sessionDoneHeading(): Locator {
        return this.practiceModal().getByText('Session complete!');
    }
}
