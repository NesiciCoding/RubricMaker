import { createEmptyCard, fsrs, State, type Card, type Grade } from 'ts-fsrs';
import type { FlashcardCard, FlashcardCardState, FlashcardDeck, FlashcardReview } from '../types';

/** Anki-style rating: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy (ts-fsrs Grade values). */
export type FlashcardRating = 1 | 2 | 3 | 4;

export const NEW_CARDS_PER_SESSION = 20;

/** Review-state cards at or above this stability (days) count as mastered — Anki's "mature" threshold. */
export const MASTERED_STABILITY_DAYS = 21;

const scheduler = fsrs();

function serializeCard(card: Card): FlashcardCardState {
    return {
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        learning_steps: card.learning_steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}),
    };
}

function reviveCard(state: FlashcardCardState): Card {
    return {
        due: new Date(state.due),
        stability: state.stability,
        difficulty: state.difficulty,
        elapsed_days: state.elapsed_days,
        scheduled_days: state.scheduled_days,
        learning_steps: state.learning_steps,
        reps: state.reps,
        lapses: state.lapses,
        state: state.state as State,
        ...(state.last_review ? { last_review: new Date(state.last_review) } : {}),
    };
}

/** Apply a rating to a card's (possibly absent) state and return the next serialized state. */
export function rateCard(
    state: FlashcardCardState | undefined,
    rating: FlashcardRating,
    now: Date = new Date()
): FlashcardCardState {
    const card = state ? reviveCard(state) : createEmptyCard(now);
    const result = scheduler.next(card, now, rating as Grade);
    return serializeCard(result.card);
}

function intervalLabel(from: Date, to: Date): string {
    const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 31) return `${days}d`;
    return `${Math.round(days / 30.44)}mo`;
}

/** Compact next-interval labels ("10m", "3d") for the four rating buttons. */
export function previewIntervals(
    state: FlashcardCardState | undefined,
    now: Date = new Date()
): Record<FlashcardRating, string> {
    const card = state ? reviveCard(state) : createEmptyCard(now);
    const preview = scheduler.repeat(card, now);
    return {
        1: intervalLabel(now, preview[1].card.due),
        2: intervalLabel(now, preview[2].card.due),
        3: intervalLabel(now, preview[3].card.due),
        4: intervalLabel(now, preview[4].card.due),
    };
}

export interface StudyQueue {
    /** Previously studied cards whose FSRS due date has passed, oldest due first. */
    due: FlashcardCard[];
    /** Never-studied cards, in deck order, capped at newLimit. */
    fresh: FlashcardCard[];
}

export function buildStudyQueue(
    deck: FlashcardDeck,
    review: FlashcardReview | null,
    now: Date = new Date(),
    newLimit: number = NEW_CARDS_PER_SESSION
): StudyQueue {
    const states = review?.cardStates ?? {};
    const due = deck.cards
        .filter((c) => states[c.id] && new Date(states[c.id].due).getTime() <= now.getTime())
        .sort((a, b) => new Date(states[a.id].due).getTime() - new Date(states[b.id].due).getTime());
    const fresh = deck.cards.filter((c) => !states[c.id]).slice(0, newLimit);
    return { due, fresh };
}

export function isMastered(state: FlashcardCardState): boolean {
    return state.state === State.Review && state.stability >= MASTERED_STABILITY_DAYS;
}
