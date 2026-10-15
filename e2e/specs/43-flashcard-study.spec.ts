/**
 * Item 43 — Flashcard study session (FSRS spaced repetition, roadmap Phase
 * 14.4). `41-flashcards.spec.ts` covers deck CRUD/assignment; this file
 * covers the two places FlashcardStudySession actually gets exercised —
 * the teacher's ephemeral "Practice" preview and the real, persisted
 * student-portal review session — which had zero coverage of any kind.
 * Offline-capable (no Supabase needed).
 */
import { test, expect } from '../fixtures/app.fixture';
import { readLocalStorage } from '../fixtures/storage.helpers';
import { buildStudent } from '../fixtures/data.factory';
import { FlashcardDeckPage } from '../pages/FlashcardDeckPage';
import { StudentFlashcardStudyPage } from '../pages/StudentFlashcardStudyPage';
import type { FlashcardDeck, FlashcardReview } from '../../src/types';

test.describe('Flashcard study session', () => {
    test('teacher "Practice" preview lets you flip and rate a card without persisting review state', async ({
        appPage,
        seedStorage,
    }) => {
        const deck: FlashcardDeck = {
            id: 'deck-practice-1',
            name: 'Practice Deck',
            cards: [{ id: 'c1', front: 'le chat', back: 'the cat' }],
            createdAt: new Date().toISOString(),
        };
        await seedStorage({ rm_flashcard_decks: [deck] });

        const page = new FlashcardDeckPage(appPage);
        await page.goto(deck.id);

        // Card front/back live in <input value>s on the edit page (not plain text) — the
        // edit form itself is already covered by 41-flashcards.spec.ts.
        await page.openPractice();
        // 'le chat' also appears in the word-list sidebar; scope to the card face.
        await expect(page.practiceModal().getByTestId('study-card-front')).toHaveText('le chat');
        await page.revealCard();
        await expect(page.practiceModal().getByText('the cat')).toBeVisible();

        await page.rateCard('Good');
        // A first 'Good' is the 10-minute learning step, which sits inside the session's requeue
        // window — so the card comes back later in the session instead of ending it.
        await expect(page.practiceModal().getByText('1 done · 1 left')).toBeVisible();
        await page.revealCard();
        // The second 'Good' graduates the card out of its learning steps, draining the queue.
        await page.rateCard('Good');
        await expect(page.sessionDoneHeading()).toBeVisible({ timeout: 5_000 });

        // Practice explicitly does not save (see the "nothing is saved" hint in the modal).
        const reviews = await readLocalStorage<FlashcardReview[]>(appPage, 'rm_flashcard_reviews');
        expect(reviews ?? []).toHaveLength(0);
    });

    test('a student review session persists FSRS state across reload', async ({ appPage, seedStorage }) => {
        const student = buildStudent('class-1', { id: 'student-fc-1', name: 'Fiona Flashcard' });
        const deck: FlashcardDeck = {
            id: 'deck-portal-1',
            name: 'Portal Deck',
            cards: [{ id: 'c1', front: 'la maison', back: 'the house' }],
            createdAt: new Date().toISOString(),
        };
        await seedStorage({ rm_students: [student], rm_flashcard_decks: [deck] });

        const page = new StudentFlashcardStudyPage(appPage);
        await page.goto(student.id, deck.id);

        await expect(appPage.getByTestId('study-card-front')).toHaveText('la maison');
        await page.reveal();
        await expect(appPage.getByText('the house')).toBeVisible();
        await page.rate('Good');
        // Same 10-minute learning step as the practice preview: the card returns once more …
        await expect(appPage.getByText('1 done · 1 left')).toBeVisible();
        await page.reveal();
        await page.rate('Good');
        // … and the second 'Good' graduates it days out, so the session drains for real.
        await expect(page.sessionDoneHeading()).toBeVisible({ timeout: 5_000 });

        const reviews = await readLocalStorage<FlashcardReview[]>(appPage, 'rm_flashcard_reviews');
        const review = reviews?.find((r) => r.id === `${deck.id}:${student.id}`);
        expect(review).toBeTruthy();
        expect(review!.cardStates['c1']).toBeTruthy();

        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 15_000 });
        // The card graduated to its first review interval, so the session should now report
        // nothing due rather than showing the card again.
        await expect(appPage.getByText('Nothing to review right now')).toBeVisible({ timeout: 10_000 });
    });
});
