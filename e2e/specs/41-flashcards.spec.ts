/**
 * Item 41 — Anki-like flashcard decks (roadmap Phase 14.4).
 *
 * The `/flashcards` and `/flashcards/:id` routes had zero e2e coverage before
 * this file — found while auditing routes for coverage gaps after closing
 * out items 36-40. Offline-capable (no Supabase needed). FSRS review
 * scheduling itself (ts-fsrs) is unit-tested separately in
 * flashcardScheduler.test.ts — this spec covers the deck CRUD/assignment
 * surface only, which had no coverage of any kind.
 */
import { test, expect } from '../fixtures/app.fixture';
import { buildClass, buildStudent } from '../fixtures/data.factory';
import { FlashcardsPage } from '../pages/FlashcardsPage';
import { FlashcardDeckPage } from '../pages/FlashcardDeckPage';
import type { FlashcardDeck } from '../../src/types';

test.describe('Flashcard decks', () => {
    test('shows an empty state with no decks', async ({ appPage }) => {
        const page = new FlashcardsPage(appPage);
        await page.goto();
        await expect(page.emptyState()).toBeVisible();
    });

    test('creating a deck navigates to its edit page, and cards persist after a reload', async ({ appPage }) => {
        const listPage = new FlashcardsPage(appPage);
        await listPage.goto();
        await listPage.clickNewDeck();

        await appPage.waitForURL(/#\/flashcards\/.+/);
        const deckPage = new FlashcardDeckPage(appPage);
        await deckPage.fillName('Unit 4 Vocabulary');
        await deckPage.addCard();
        await deckPage.fillCardFront(0, 'la maison');
        await deckPage.fillCardBack(0, 'the house');
        await deckPage.waitForAutosave();

        await appPage.reload();
        await appPage.waitForSelector('.main-area', { timeout: 15_000 });
        await expect(appPage.locator('#deck-name')).toHaveValue('Unit 4 Vocabulary');
        await expect(appPage.getByLabel('Front (word)').first()).toHaveValue('la maison');
        await expect(appPage.getByLabel('Back (translation)').first()).toHaveValue('the house');

        await listPage.goto();
        await expect(appPage.getByText('Unit 4 Vocabulary')).toBeVisible();
        await expect(appPage.getByText('1 cards')).toBeVisible();
    });

    test('assigning a deck to a class shows the assigned count on the deck list', async ({ appPage, seedStorage }) => {
        const cls = buildClass({ name: 'Class 4A' });
        const s1 = buildStudent(cls.id, { name: 'Ada' });
        const s2 = buildStudent(cls.id, { name: 'Beau' });
        const deck: FlashcardDeck = {
            id: 'deck-1',
            name: 'Ready to Assign',
            cards: [{ id: 'c1', front: 'chat', back: 'cat' }],
            createdAt: new Date().toISOString(),
        };
        await seedStorage({ rm_classes: [cls], rm_students: [s1, s2], rm_flashcard_decks: [deck] });

        const deckPage = new FlashcardDeckPage(appPage);
        await deckPage.goto(deck.id);
        await deckPage.selectAssignClass('Class 4A');
        await deckPage.assign();

        const listPage = new FlashcardsPage(appPage);
        await listPage.goto();
        await expect(listPage.deckCard('Ready to Assign').getByText('2 students')).toBeVisible({ timeout: 5_000 });
    });

    test('deleting a deck removes it after confirming', async ({ appPage, seedStorage }) => {
        const deck: FlashcardDeck = {
            id: 'deck-1',
            name: 'Delete this deck',
            cards: [],
            createdAt: new Date().toISOString(),
        };
        await seedStorage({ rm_flashcard_decks: [deck] });

        const page = new FlashcardsPage(appPage);
        await page.goto();
        await expect(appPage.getByText('Delete this deck')).toBeVisible();

        await page.deleteDeck('Delete this deck');
        await page.confirmDelete();

        await expect(appPage.getByText('Delete this deck')).not.toBeVisible({ timeout: 5_000 });
        await expect(page.emptyState()).toBeVisible();
    });
});
