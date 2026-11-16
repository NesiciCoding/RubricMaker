import { nanoid } from './nanoid';
import { gapCorrectAnswers, parseClozeGaps, plainQuestionPromptText } from './clozeParse';
import { htmlToPlainText } from './essayUtils';
import type { FlashcardCard, FlashcardDeck, TestQuestion } from '../types';

/** A question whose answer earned less than its full points, as scored for the submission being reviewed. */
export interface MissedQuestion {
    question: TestQuestion;
    pointsEarned: number;
}

function cardBack(question: TestQuestion): string {
    return htmlToPlainText(plainQuestionPromptText(question)).trim();
}

function card(front: string, back: string): FlashcardCard | null {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) return null;
    return { id: nanoid(), front: f, back: b };
}

/**
 * Cards equivalent to one test question — the reverse of `deckToQuestions.ts`, so a missed item
 * becomes something the student can review. Only types with a real prompt/answer pair are mapped:
 * `true-false`, `matrix`, `ordering`, `categorize`, `hot-text`, `numeric`, `open` and the
 * multi-part EFL types carry nothing a flashcard can flip on, so they are left to the caller's
 * skipped count rather than turned into an ambiguous card.
 */
export function cardsFromQuestion(question: TestQuestion): FlashcardCard[] {
    switch (question.type) {
        case 'multiple-choice':
        case 'multiple-response': {
            const correct = (question.options ?? [])
                .filter((option) => option.isCorrect)
                .map((option) => option.text.trim())
                .filter(Boolean);
            const back = cardBack(question);
            const single = card(correct.join(' / '), back);
            return single ? [single] : [];
        }
        case 'short-answer': {
            const accepted = question.expectedAnswers?.length
                ? question.expectedAnswers
                : question.expectedAnswer
                  ? [question.expectedAnswer]
                  : [];
            const single = card(accepted[0] ?? '', cardBack(question));
            return single ? [single] : [];
        }
        case 'matching': {
            const back = cardBack(question);
            return (question.matchingPairs ?? [])
                .map((pair) => card(pair.left, pair.right.trim() || back))
                .filter((c): c is FlashcardCard => !!c);
        }
        case 'cloze':
        case 'cloze-dropdown':
        case 'cloze-bank': {
            const legacyFirstOnly = question.type === 'cloze-dropdown';
            const back = cardBack(question);
            return parseClozeGaps(question.prompt)
                .map((gap) => card(gapCorrectAnswers(gap, legacyFirstOnly)[0] ?? '', back))
                .filter((c): c is FlashcardCard => !!c);
        }
        default:
            return [];
    }
}

/**
 * One card per missed item (a cloze question yields one per gap). Duplicate front/back pairs are
 * folded, since a deck showing the same card twice adds nothing to the review.
 */
export function cardsFromMissedQuestions(entries: MissedQuestion[]): FlashcardCard[] {
    const seen = new Set<string>();
    const cards: FlashcardCard[] = [];
    for (const entry of entries) {
        if (entry.pointsEarned >= entry.question.points) continue;
        for (const c of cardsFromQuestion(entry.question)) {
            const key = `${c.front.toLowerCase()}\u0000${c.back.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            cards.push(c);
        }
    }
    return cards;
}

/** A new student/teacher review deck for a submission's missed items, or null when nothing maps to a card. */
export function buildReviewDeck(name: string, entries: MissedQuestion[]): FlashcardDeck | null {
    const cards = cardsFromMissedQuestions(entries);
    if (cards.length === 0) return null;
    return {
        id: nanoid(),
        name: name.trim(),
        cards,
        deckKind: 'vocabulary',
        createdAt: new Date().toISOString(),
    };
}
