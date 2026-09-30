import type { FlashcardAssignment, FlashcardDeck, FlashcardReview } from '../types';
import { computeDeckInsights, type DeckInsights } from './flashcardInsights';

export interface DeckOverviewRow {
    deck: FlashcardDeck;
    assignedCount: number;
    /** Assigned students with at least one reviewed card. */
    activeCount: number;
    insights: DeckInsights;
}

export interface CrossDeckOverview {
    rows: DeckOverviewRow[];
    totalCards: number;
    masteredCount: number;
    dueCount: number;
    activeStudentCount: number;
    lastStudied: string | null;
}

const EMPTY_INSIGHTS_KEYS = ['newCount', 'learningCount', 'reviewCount', 'masteredCount', 'dueCount'] as const;

/**
 * Cross-deck teacher view built from the per-deck computation: each deck's insights are summed
 * over its assigned students, so a deck's totals count one card per (student, card) pair.
 * Student-owned decks that were not shared with the teacher are excluded.
 */
export function computeCrossDeckOverview(
    decks: FlashcardDeck[],
    assignments: FlashcardAssignment[],
    reviews: FlashcardReview[],
    now: Date = new Date()
): CrossDeckOverview {
    const reviewById = new Map(reviews.map((r) => [r.id, r]));
    const rows: DeckOverviewRow[] = [];
    const activeStudents = new Set<string>();
    let lastStudied: string | null = null;

    for (const deck of decks) {
        if (deck.ownerStudentId && !deck.sharedWithTeacher) continue;
        const assigned = assignments.filter((a) => a.deckId === deck.id);
        const summed: DeckInsights = {
            totalCards: 0,
            newCount: 0,
            learningCount: 0,
            reviewCount: 0,
            masteredCount: 0,
            dueCount: 0,
            lastStudied: null,
            focusCards: [],
        };
        let activeCount = 0;

        if (assigned.length === 0) {
            summed.totalCards = deck.cards.length;
            summed.newCount = deck.cards.length;
        }

        for (const a of assigned) {
            const review = reviewById.get(`${deck.id}:${a.studentId}`) ?? null;
            const insights = computeDeckInsights(deck, review, now);
            summed.totalCards += insights.totalCards;
            for (const key of EMPTY_INSIGHTS_KEYS) summed[key] += insights[key];
            if (insights.lastStudied) {
                activeCount++;
                activeStudents.add(a.studentId);
                if (!summed.lastStudied || insights.lastStudied > summed.lastStudied) {
                    summed.lastStudied = insights.lastStudied;
                }
            }
        }

        if (summed.lastStudied && (!lastStudied || summed.lastStudied > lastStudied)) lastStudied = summed.lastStudied;
        rows.push({ deck, assignedCount: assigned.length, activeCount, insights: summed });
    }

    return {
        rows,
        totalCards: rows.reduce((s, r) => s + r.insights.totalCards, 0),
        masteredCount: rows.reduce((s, r) => s + r.insights.masteredCount, 0),
        dueCount: rows.reduce((s, r) => s + r.insights.dueCount, 0),
        activeStudentCount: activeStudents.size,
        lastStudied,
    };
}
