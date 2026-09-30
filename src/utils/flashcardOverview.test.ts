import { describe, it, expect } from 'vitest';
import { computeCrossDeckOverview } from './flashcardOverview';
import { rateCard } from './flashcardScheduler';
import type { FlashcardAssignment, FlashcardDeck, FlashcardReview } from '../types';

const NOW = new Date('2026-07-04T10:00:00Z');

const mkDeck = (id: string, extra: Partial<FlashcardDeck> = {}): FlashcardDeck => ({
    id,
    name: id,
    createdAt: NOW.toISOString(),
    cards: [
        { id: `${id}-1`, front: 'a', back: 'b' },
        { id: `${id}-2`, front: 'c', back: 'd' },
    ],
    ...extra,
});

const assign = (deckId: string, studentId: string): FlashcardAssignment => ({
    deckId,
    studentId,
    deckName: deckId,
    cardCount: 2,
    createdAt: NOW.toISOString(),
});

describe('computeCrossDeckOverview', () => {
    it('sums per-deck insights across assigned students and finds the latest study date', () => {
        const review: FlashcardReview = {
            id: 'd1:s1',
            deckId: 'd1',
            studentId: 's1',
            updatedAt: NOW.toISOString(),
            cardStates: { 'd1-1': rateCard(undefined, 3, new Date('2026-07-03T09:00:00Z')) },
        };
        const overview = computeCrossDeckOverview(
            [mkDeck('d1'), mkDeck('d2')],
            [assign('d1', 's1'), assign('d1', 's2'), assign('d2', 's1')],
            [review],
            NOW
        );
        const d1 = overview.rows.find((r) => r.deck.id === 'd1')!;
        expect(d1.assignedCount).toBe(2);
        expect(d1.activeCount).toBe(1);
        expect(d1.insights.totalCards).toBe(4);
        expect(overview.totalCards).toBe(6);
        expect(overview.activeStudentCount).toBe(1);
        expect(overview.lastStudied).toBe('2026-07-03T09:00:00.000Z');
    });

    it('counts an unassigned deck as all-new cards and skips private student decks', () => {
        const overview = computeCrossDeckOverview(
            [
                mkDeck('d1'),
                mkDeck('own', { ownerStudentId: 's1' }),
                mkDeck('shared', { ownerStudentId: 's1', sharedWithTeacher: true }),
            ],
            [],
            [],
            NOW
        );
        expect(overview.rows.map((r) => r.deck.id)).toEqual(['d1', 'shared']);
        expect(overview.rows[0].insights.newCount).toBe(2);
        expect(overview.lastStudied).toBeNull();
    });
});
