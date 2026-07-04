import { describe, it, expect } from 'vitest';
import { rateCard, previewIntervals, buildStudyQueue, isMastered, NEW_CARDS_PER_SESSION } from './flashcardScheduler';
import type { FlashcardCard, FlashcardDeck, FlashcardReview } from '../types';

const NOW = new Date('2026-07-04T10:00:00Z');

function makeDeck(cardCount: number): FlashcardDeck {
    const cards: FlashcardCard[] = Array.from({ length: cardCount }, (_, i) => ({
        id: `c${i}`,
        front: `front${i}`,
        back: `back${i}`,
    }));
    return { id: 'deck1', name: 'Deck', cards, createdAt: NOW.toISOString() };
}

describe('rateCard', () => {
    it('creates state for a new card and schedules it in the future', () => {
        const state = rateCard(undefined, 3, NOW);
        expect(state.reps).toBe(1);
        expect(state.lapses).toBe(0);
        expect(new Date(state.due).getTime()).toBeGreaterThan(NOW.getTime());
        expect(state.last_review).toBe(NOW.toISOString());
    });

    it('serialized state round-trips through JSON and can be rated again', () => {
        const first = rateCard(undefined, 3, NOW);
        const revived = JSON.parse(JSON.stringify(first));
        const later = new Date(NOW.getTime() + 24 * 3600 * 1000);
        const second = rateCard(revived, 3, later);
        expect(second.reps).toBe(2);
        expect(new Date(second.due).getTime()).toBeGreaterThan(later.getTime());
    });

    it('Again schedules sooner than Easy', () => {
        const again = rateCard(undefined, 1, NOW);
        const easy = rateCard(undefined, 4, NOW);
        expect(new Date(again.due).getTime()).toBeLessThan(new Date(easy.due).getTime());
    });

    it('Again on a learned card increments lapses', () => {
        let state = rateCard(undefined, 4, NOW);
        const later = new Date(NOW.getTime() + 30 * 24 * 3600 * 1000);
        state = rateCard(state, 1, later);
        expect(state.lapses).toBe(1);
    });
});

describe('previewIntervals', () => {
    it('returns a compact label for each of the four ratings', () => {
        const labels = previewIntervals(undefined, NOW);
        for (const rating of [1, 2, 3, 4] as const) {
            expect(labels[rating]).toMatch(/^\d+(m|h|d|mo)$/);
        }
    });
});

describe('buildStudyQueue', () => {
    it('puts due cards first (oldest due first) and caps new cards', () => {
        const deck = makeDeck(NEW_CARDS_PER_SESSION + 5);
        const review: FlashcardReview = {
            id: 'deck1:s1',
            deckId: 'deck1',
            studentId: 's1',
            updatedAt: NOW.toISOString(),
            cardStates: {
                c0: { ...rateCard(undefined, 3, new Date('2026-06-01T10:00:00Z')) },
                c1: { ...rateCard(undefined, 3, new Date('2026-05-01T10:00:00Z')) },
                // c2 studied but due far in the future
                c2: { ...rateCard(undefined, 4, new Date('2026-07-03T10:00:00Z')), due: '2027-01-01T00:00:00Z' },
            },
        };
        const queue = buildStudyQueue(deck, review, NOW);
        expect(queue.due.map((c) => c.id)).toEqual(['c1', 'c0']);
        expect(queue.fresh).toHaveLength(NEW_CARDS_PER_SESSION);
        expect(queue.fresh.some((c) => ['c0', 'c1', 'c2'].includes(c.id))).toBe(false);
    });

    it('treats a missing review as all-new', () => {
        const deck = makeDeck(3);
        const queue = buildStudyQueue(deck, null, NOW);
        expect(queue.due).toHaveLength(0);
        expect(queue.fresh).toHaveLength(3);
    });
});

describe('isMastered', () => {
    it('requires review state and high stability', () => {
        const fresh = rateCard(undefined, 3, NOW);
        expect(isMastered(fresh)).toBe(false);
        expect(isMastered({ ...fresh, state: 2, stability: 30 })).toBe(true);
        expect(isMastered({ ...fresh, state: 2, stability: 5 })).toBe(false);
    });
});
