/**
 * Card-list layout guard.
 *
 * Every list that lays its tiles out in a wrapping flex row has to keep two promises:
 * the row never pushes the page into horizontal scroll, and every tile in the row is the
 * same width. Both broke at once when a growing flex basis met a `.truncate` (nowrap)
 * description: the automatic min-width of a flex item is its min-content width, so one
 * long sentence stretched its card (observed: 1364px and 2006px tiles) and the last row's
 * cards grew wider than the full rows above them.
 *
 * The assertions below are deliberately structural — widths, edges, scroll — rather than
 * pinned to the current 400px basis, so a deliberate resize doesn't break the guard while
 * a regression like the one above does.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/app.fixture';
import { buildRubric } from '../fixtures/data.factory';
import type { EssayAssignment, FlashcardDeck, Test as RmTest } from '../../src/types';

/** Long enough that a nowrap sentence would dwarf any reasonable card. */
const LONG_DESCRIPTION =
    'Verplichte eisen: jouw presentatie is in het Engels gegeven, je hebt jouw tri-fold display op papier ' +
    'gemaakt, jouw presentatie is door jou gemaakt en de tekst ervoor is door jou geschreven en je hebt ' +
    'geen gebruik gemaakt van AI, dus laat staan dat een automatische vertaling het werk heeft gedaan.';

const LONG_TITLE = 'Essay 3 — a deliberately long assignment title that keeps going well past any sensible card width';

const LONG_DECK_NAME =
    'A deck name that is far longer than a card and should wrap inside it instead of resizing the card';

interface CardMetrics {
    widths: number[];
    overflow: { page: number; list: number; viewport: number };
    rightEdges: number[];
}

/**
 * Measures the tiles on the current page. Only cards that render a heading count: the folder
 * tiles on the Rubrics and Tests lists are also `.card` elements but are intentionally compact.
 */
async function measureCards(page: Page): Promise<CardMetrics> {
    // The store hydrates asynchronously, so the shell (and its loading status) is on screen
    // before the seeded cards are; wait for a titled card instead of the page container.
    await page.locator('.page-content .card h3').first().waitFor({ state: 'visible' });
    return page.evaluate(() => {
        const list = document.querySelector('.page-content');
        const cards = [...document.querySelectorAll('.page-content .card')].filter((card) => card.querySelector('h3'));
        const widths = cards.map((card) => Math.round(card.getBoundingClientRect().width));
        return {
            widths,
            rightEdges: cards.map((card) => Math.round(card.getBoundingClientRect().right)),
            overflow: {
                page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                list: list ? list.scrollWidth - list.clientWidth : 0,
                viewport: window.innerWidth,
            },
        };
    });
}

function expectTidyRow(metrics: CardMetrics, label: string) {
    expect(metrics.widths.length, `${label}: expected at least one card`).toBeGreaterThan(0);
    expect(metrics.overflow.page, `${label}: the page scrolls horizontally`).toBeLessThanOrEqual(1);
    expect(metrics.overflow.list, `${label}: the list scrolls horizontally`).toBeLessThanOrEqual(1);
    for (const right of metrics.rightEdges) {
        expect(right, `${label}: a card extends past the viewport`).toBeLessThanOrEqual(metrics.overflow.viewport + 1);
    }
    const narrowest = Math.min(...metrics.widths);
    const widest = Math.max(...metrics.widths);
    expect(widest - narrowest, `${label}: cards disagree on width (${metrics.widths.join(', ')})`).toBeLessThanOrEqual(
        1
    );
    // A card may not swallow the whole content area on a desktop viewport either.
    expect(widest, `${label}: cards grew past a sane tile width (${metrics.widths.join(', ')})`).toBeLessThanOrEqual(
        480
    );
}

test.describe('Card lists stay inside the page and keep their tile width', () => {
    test('rubric cards share one width despite a long description', async ({ appPage, seedStorage }) => {
        await seedStorage({
            rm_rubrics: [
                buildRubric({ id: 'layout-r1', name: 'Rubric A', description: LONG_DESCRIPTION }),
                buildRubric({ id: 'layout-r2', name: 'Rubric B', description: '' }),
                buildRubric({ id: 'layout-r3', name: 'Rubric C', description: LONG_DESCRIPTION }),
                buildRubric({ id: 'layout-r4', name: 'Rubric D', description: 'Short.' }),
                buildRubric({ id: 'layout-r5', name: 'Rubric E', description: '' }),
            ],
        });

        await appPage.goto('/#/rubrics');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');

        expectTidyRow(await measureCards(appPage), 'rubrics');
    });

    test('test cards share one width despite a long description', async ({ appPage, seedStorage }) => {
        const tests: RmTest[] = [
            {
                id: 'layout-t1',
                name: 'Test A',
                description: LONG_DESCRIPTION,
                questions: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-01T00:00:00.000Z',
            },
            {
                id: 'layout-t2',
                name: 'Test B',
                questions: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-02T00:00:00.000Z',
            },
            {
                id: 'layout-t3',
                name: 'Test C',
                description: 'Short.',
                questions: [],
                requireSEB: false,
                shuffleQuestions: false,
                createdAt: '2024-01-03T00:00:00.000Z',
            },
        ];
        await seedStorage({ rm_tests: tests });

        await appPage.goto('/#/tests');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');

        expectTidyRow(await measureCards(appPage), 'tests');
    });

    test('essay cards share one width despite a long title', async ({ appPage, seedStorage }) => {
        const essayAssignments: EssayAssignment[] = [
            ['layout-e1', LONG_TITLE],
            ['layout-e2', 'Short essay'],
            ['layout-e3', LONG_TITLE],
        ].flatMap(([teacherKey, title]) =>
            ['s1', 's2'].map((studentId) => ({
                rubricId: 'rubric-x',
                studentId: `${teacherKey}-${studentId}`,
                teacherKey,
                title,
                readOnlyAfterSubmit: false,
                createdAt: '2024-01-01T00:00:00.000Z',
            }))
        );
        await seedStorage({ rm_essay_assignments: essayAssignments });

        await appPage.goto('/#/essays');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');

        expectTidyRow(await measureCards(appPage), 'essays');
    });

    test('flashcard decks share one width despite a long name and description', async ({ appPage, seedStorage }) => {
        const decks: FlashcardDeck[] = [
            ['layout-d1', LONG_DECK_NAME, LONG_DESCRIPTION],
            ['layout-d2', 'Deck B', ''],
            ['layout-d3', 'Deck C', LONG_DESCRIPTION],
            ['layout-d4', 'Deck D', ''],
        ].map(([id, name, description]) => ({
            id,
            name,
            description,
            cards: [{ id: `${id}-card`, term: 'term', definition: 'definition' }],
            createdAt: '2024-01-01T00:00:00.000Z',
        }));
        await seedStorage({ rm_flashcard_decks: decks });

        await appPage.goto('/#/flashcards');
        await appPage.reload();
        await appPage.waitForSelector('.main-area');

        expectTidyRow(await measureCards(appPage), 'flashcards');
    });
});
