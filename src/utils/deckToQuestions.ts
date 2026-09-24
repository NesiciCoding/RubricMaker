import { nanoid } from './nanoid';
import { seededShuffle } from './seededShuffle';
import type { FlashcardCard, TestQuestion } from '../types';

const MULTIPLE_CHOICE_DISTRACTOR_COUNT = 3;

function usableCards(cards: FlashcardCard[]): FlashcardCard[] {
    return cards.filter((c) => c.front.trim() && c.back.trim());
}

/** One matching question pairing every card's front (word) with its back (definition/translation). */
export function generateMatchingFromDeck(deckName: string, cards: FlashcardCard[]): TestQuestion | null {
    const usable = usableCards(cards);
    if (usable.length < 2) return null;
    return {
        id: nanoid(),
        type: 'matching',
        prompt: deckName,
        points: usable.length,
        matchingPairs: usable.map((c) => ({ id: nanoid(), left: c.front, right: c.back })),
    };
}

/**
 * One multiple-choice question per card ("Which word means '{back}'?"), with distractor fronts
 * drawn from the rest of the deck. Cards need at least `MULTIPLE_CHOICE_DISTRACTOR_COUNT + 1`
 * usable siblings to get enough distinct distractors.
 */
export function generateMultipleChoiceFromDeck(cards: FlashcardCard[]): TestQuestion[] {
    const usable = usableCards(cards);
    if (usable.length <= MULTIPLE_CHOICE_DISTRACTOR_COUNT) return [];
    return usable.map((card): TestQuestion => {
        const others = usable.filter((c) => c.id !== card.id);
        const distractors = seededShuffle(others, `${card.id}-mc`).slice(0, MULTIPLE_CHOICE_DISTRACTOR_COUNT);
        const options = seededShuffle(
            [card, ...distractors].map((c) => ({ id: nanoid(), text: c.front, isCorrect: c.id === card.id })),
            `${card.id}-mc-order`
        );
        return { id: nanoid(), type: 'multiple-choice', prompt: card.back, points: 1, options };
    });
}

/** One cloze question per card whose `example` sentence contains the front word, gapping that word. */
export function generateClozeFromDeck(cards: FlashcardCard[]): TestQuestion[] {
    const questions: TestQuestion[] = [];
    for (const card of cards) {
        if (!card.example || !card.front.trim()) continue;
        const pattern = new RegExp(`\\b${card.front.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const match = card.example.match(pattern);
        if (!match || match.index === undefined) continue;
        const prompt =
            card.example.slice(0, match.index) + `{{${match[0]}}}` + card.example.slice(match.index + match[0].length);
        questions.push({ id: nanoid(), type: 'cloze', prompt, points: 1 });
    }
    return questions;
}

/** One categorize question sorting every card's front into a bucket per distinct `partOfSpeech`. Needs at least two distinct parts of speech to be useful. */
export function generateCategorizeFromDeck(deckName: string, cards: FlashcardCard[]): TestQuestion | null {
    const usable = cards.filter((c) => c.front.trim() && c.partOfSpeech?.trim());
    const distinctPos = [...new Set(usable.map((c) => c.partOfSpeech!.trim()))];
    if (distinctPos.length < 2) return null;
    const categoryIds = new Map(distinctPos.map((pos) => [pos, nanoid()]));
    return {
        id: nanoid(),
        type: 'categorize',
        prompt: deckName,
        points: usable.length,
        categories: distinctPos.map((pos) => ({ id: categoryIds.get(pos)!, label: pos })),
        categorizeItems: usable.map((c) => ({
            id: nanoid(),
            text: c.front,
            categoryId: categoryIds.get(c.partOfSpeech!.trim())!,
        })),
    };
}

/** Generates every applicable question type from a deck; callers filter/save the ones they want. */
export function generateQuestionsFromDeck(deckName: string, cards: FlashcardCard[]): TestQuestion[] {
    const matching = generateMatchingFromDeck(deckName, cards);
    const categorize = generateCategorizeFromDeck(deckName, cards);
    return [
        ...(matching ? [matching] : []),
        ...generateMultipleChoiceFromDeck(cards),
        ...generateClozeFromDeck(cards),
        ...(categorize ? [categorize] : []),
    ];
}
