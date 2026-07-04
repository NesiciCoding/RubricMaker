import { describe, it, expect } from 'vitest';
import { computeDeckInsights } from './flashcardInsights';
import { rateCard } from './flashcardScheduler';
import type { FlashcardDeck, FlashcardReview } from '../types';

const NOW = new Date('2026-07-04T10:00:00Z');

const deck: FlashcardDeck = {
    id: 'd1',
    name: 'Deck',
    createdAt: NOW.toISOString(),
    cards: [
        { id: 'new1', front: 'a', back: 'b' },
        { id: 'learning1', front: 'c', back: 'd' },
        { id: 'mastered1', front: 'e', back: 'f' },
        { id: 'struggling1', front: 'g', back: 'h' },
    ],
};

function review(): FlashcardReview {
    const learning = rateCard(undefined, 3, new Date('2026-07-04T09:00:00Z'));
    const mastered = { ...rateCard(undefined, 4, new Date('2026-06-01T10:00:00Z')), state: 2, stability: 40 };
    let struggling = rateCard(undefined, 3, new Date('2026-06-01T10:00:00Z'));
    struggling = rateCard(struggling, 1, new Date('2026-06-10T10:00:00Z'));
    struggling = rateCard(struggling, 1, new Date('2026-06-20T10:00:00Z'));
    return {
        id: 'd1:s1',
        deckId: 'd1',
        studentId: 's1',
        updatedAt: NOW.toISOString(),
        cardStates: { learning1: learning, mastered1: mastered, struggling1: struggling },
    };
}

describe('computeDeckInsights', () => {
    it('counts stages and finds the last study date', () => {
        const insights = computeDeckInsights(deck, review(), NOW);
        expect(insights.totalCards).toBe(4);
        expect(insights.newCount).toBe(1);
        expect(insights.masteredCount).toBe(1);
        expect(insights.learningCount + insights.reviewCount).toBe(2);
        expect(insights.lastStudied).toBe('2026-07-04T09:00:00.000Z');
    });

    it('ranks lapsed cards as focus words', () => {
        const insights = computeDeckInsights(deck, review(), NOW);
        expect(insights.focusCards.map((c) => c.id)).toContain('struggling1');
        expect(insights.focusCards.map((c) => c.id)).not.toContain('new1');
    });

    it('handles a missing review row', () => {
        const insights = computeDeckInsights(deck, null, NOW);
        expect(insights.newCount).toBe(4);
        expect(insights.dueCount).toBe(0);
        expect(insights.lastStudied).toBeNull();
        expect(insights.focusCards).toHaveLength(0);
    });
});
