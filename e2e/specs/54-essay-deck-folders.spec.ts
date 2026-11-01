/**
 * Folders on the Essays and Flashcards lists.
 *
 * Both lists file into their own folder tree (`kind: 'essay'` / `kind: 'flashcard'`), and the
 * drop is decided by the pointer rather than the dragged card's centre — a card grabbed by its
 * corner handle can never get its centre over a compact folder tile.
 */
import { test, expect } from '../fixtures/app.fixture';
import { EssayListPage } from '../pages/EssayListPage';
import { FlashcardsPage } from '../pages/FlashcardsPage';
import type { EssayAssignment, FlashcardDeck } from '../../src/types';

const essayAssignments: EssayAssignment[] = ['File Me', 'Stay Loose'].map((title, index) => ({
    rubricId: 'rubric-x',
    studentId: `student-${index}`,
    teacherKey: `essay-${index}`,
    title,
    readOnlyAfterSubmit: false,
    createdAt: `2024-01-0${index + 1}T00:00:00.000Z`,
}));

const decks: FlashcardDeck[] = ['Filed Deck', 'Loose Deck'].map((name, index) => ({
    id: `deck-${index}`,
    name,
    cards: [{ id: `card-${index}`, term: 'term', definition: 'definition' }],
    createdAt: `2024-01-0${index + 1}T00:00:00.000Z`,
}));

test.describe('Folders on Essays and Flashcards', () => {
    test('dragging an essay card onto an essay folder files the whole group', async ({ appPage, seedStorage }) => {
        await seedStorage({
            rm_essay_assignments: essayAssignments,
            rm_folders: [{ id: 'essay-folder', name: 'Term 1', kind: 'essay', displayOrder: 0 }],
        });

        const page = new EssayListPage(appPage);
        await page.goto();
        await expect(await page.cardTitles()).toEqual(['File Me', 'Stay Loose']);

        const tile = appPage.locator('.card').filter({ hasText: 'Term 1' }).first();
        await expect(tile).toContainText('0 items');
        await page.dragReorder(page.dragHandle('File Me'), tile);

        await expect(tile).toContainText('1 item');
        const stored = await appPage.evaluate(
            () => JSON.parse(localStorage.getItem('rm_essay_assignments') ?? '[]') as EssayAssignment[]
        );
        expect(stored.filter((a) => a.teacherKey === 'essay-0').every((a) => a.folderId === 'essay-folder')).toBe(true);
        expect(stored.filter((a) => a.teacherKey === 'essay-1').every((a) => a.folderId === undefined)).toBe(true);

        // The folder tiles filter the list like they do on the Rubrics and Tests lists.
        await tile.click();
        await expect(await page.cardTitles()).toEqual(['File Me']);
    });

    test('dragging a flashcard deck onto a flashcard folder files it', async ({ appPage, seedStorage }) => {
        await seedStorage({
            rm_flashcard_decks: decks,
            rm_folders: [{ id: 'deck-folder', name: 'Term 2', kind: 'flashcard', displayOrder: 0 }],
        });

        const page = new FlashcardsPage(appPage);
        await page.goto();

        const tile = appPage.locator('.card').filter({ hasText: 'Term 2' }).first();
        await expect(tile).toContainText('0 items');
        await page.dragReorder(page.deckCard('Filed Deck').getByLabel(/drag to file/i), tile);

        await expect(tile).toContainText('1 item');
        const stored = await appPage.evaluate(
            () => JSON.parse(localStorage.getItem('rm_flashcard_decks') ?? '[]') as FlashcardDeck[]
        );
        expect(stored.find((d) => d.id === 'deck-0')?.folderId).toBe('deck-folder');
        expect(stored.find((d) => d.id === 'deck-1')?.folderId).toBeUndefined();
    });

    test('folder trees stay separate: a rubric folder never shows on the essay list', async ({
        appPage,
        seedStorage,
    }) => {
        await seedStorage({
            rm_essay_assignments: essayAssignments,
            rm_folders: [{ id: 'rubric-folder', name: 'Rubrics only', kind: 'rubric', displayOrder: 0 }],
        });

        const page = new EssayListPage(appPage);
        await page.goto();

        await expect(appPage.getByText('Rubrics only')).toHaveCount(0);
        await expect(await page.cardTitles()).toEqual(['File Me', 'Stay Loose']);
    });
});
