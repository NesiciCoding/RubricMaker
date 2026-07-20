import type { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/** Student-facing flashcard review session (roadmap Phase 14.4, FSRS via ts-fsrs). */
export class StudentFlashcardStudyPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async goto(studentId: string, deckId: string): Promise<void> {
        await this.navigate(`/portal/${studentId}/flashcards/${deckId}`);
    }

    async reveal(): Promise<void> {
        await this.page.getByRole('button', { name: /show answer/i }).click();
    }

    async rate(rating: 'Again' | 'Hard' | 'Good' | 'Easy'): Promise<void> {
        await this.page.getByRole('button', { name: rating, exact: false }).click();
    }

    sessionDoneHeading(): Locator {
        return this.page.getByText('Session complete!');
    }

    myProgressPanel(): Locator {
        return this.page.getByText('My progress').locator('..');
    }
}
