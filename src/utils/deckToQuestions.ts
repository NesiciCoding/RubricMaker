import { nanoid } from './nanoid';
import { seededShuffle } from './seededShuffle';
import type { FlashcardCard, TestQuestion } from '../types';

const MULTIPLE_CHOICE_DISTRACTOR_COUNT = 3;

function normalizeText(s: string): string {
    return s.trim().toLowerCase();
}

/** Drops every item whose `keyFn` value isn't unique in the list — two cards with the same
 * visible front or back (e.g. two senses of "run") can't be told apart in a generated question,
 * so both are excluded rather than guessed at. */
function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const key = keyFn(item);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return items.filter((item) => counts.get(keyFn(item)) === 1);
}

/** Cards usable for matching/multiple-choice: non-empty front and back, and both unique in the
 * deck — a duplicate front makes distractors ambiguous, a duplicate back makes two questions
 * indistinguishable ("Which word means X?" twice, with different correct answers). Front and back
 * uniqueness are checked independently against the full pool — excluding one half of a front
 * clash must not "free up" its back for a card that clashes on back with the excluded card. */
function usableCards(cards: FlashcardCard[]): FlashcardCard[] {
    const base = cards.filter((c) => c.front.trim() && c.back.trim());
    const uniqueFronts = new Set(dedupeByKey(base, (c) => normalizeText(c.front)));
    const uniqueBacks = new Set(dedupeByKey(base, (c) => normalizeText(c.back)));
    return base.filter((c) => uniqueFronts.has(c) && uniqueBacks.has(c));
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
        const escaped = card.front.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Unicode-aware boundaries, not \b: \b is ASCII-only, so it fails to match after an
        // accented letter like "café" and the card would be silently skipped.
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
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
    const withPos = cards.filter((c) => c.front.trim() && c.partOfSpeech?.trim());
    // A front duplicated under two different parts of speech can't be sorted unambiguously.
    const usable = dedupeByKey(withPos, (c) => normalizeText(c.front));
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
