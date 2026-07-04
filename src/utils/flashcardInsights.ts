import { State } from 'ts-fsrs';
import type { FlashcardCard, FlashcardDeck, FlashcardReview } from '../types';
import { isMastered } from './flashcardScheduler';

export interface DeckInsights {
    totalCards: number;
    newCount: number;
    /** Learning or relearning: recently introduced or recently forgotten. */
    learningCount: number;
    /** Graduated to review but below the mastered stability threshold. */
    reviewCount: number;
    masteredCount: number;
    dueCount: number;
    lastStudied: string | null;
    /** Cards to work on next: most lapses first, then highest FSRS difficulty. */
    focusCards: FlashcardCard[];
}

const FOCUS_LIMIT = 5;

/** Everything is derived from the FSRS card states already stored on the review row. */
export function computeDeckInsights(
    deck: FlashcardDeck,
    review: FlashcardReview | null,
    now: Date = new Date()
): DeckInsights {
    const states = review?.cardStates ?? {};
    let newCount = 0;
    let learningCount = 0;
    let reviewCount = 0;
    let masteredCount = 0;
    let dueCount = 0;
    let lastStudied: string | null = null;

    for (const card of deck.cards) {
        const s = states[card.id];
        if (!s) {
            newCount++;
            continue;
        }
        if (new Date(s.due).getTime() <= now.getTime()) dueCount++;
        if (s.last_review && (!lastStudied || s.last_review > lastStudied)) lastStudied = s.last_review;
        if (isMastered(s)) masteredCount++;
        else if (s.state === State.Review) reviewCount++;
        else if (s.state === State.New) newCount++;
        else learningCount++;
    }

    const focusCards = deck.cards
        .filter((c) => {
            const s = states[c.id];
            return s && s.reps > 0 && (s.lapses > 0 || s.difficulty >= 7);
        })
        .sort((a, b) => {
            const sa = states[a.id];
            const sb = states[b.id];
            return sb.lapses - sa.lapses || sb.difficulty - sa.difficulty;
        })
        .slice(0, FOCUS_LIMIT);

    return {
        totalCards: deck.cards.length,
        newCount,
        learningCount,
        reviewCount,
        masteredCount,
        dueCount,
        lastStudied,
        focusCards,
    };
}
