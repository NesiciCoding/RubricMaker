import { describe, it, expect } from 'vitest';
import {
    generateMatchingFromDeck,
    generateMultipleChoiceFromDeck,
    generateClozeFromDeck,
    generateCategorizeFromDeck,
    generateQuestionsFromDeck,
} from './deckToQuestions';
import { renderClozeSegments } from './clozeParse';
import type { FlashcardCard } from '../types';

function card(overrides: Partial<FlashcardCard>): FlashcardCard {
    return { id: `id-${Math.random()}`, front: 'word', back: 'definition', ...overrides };
}

describe('generateMatchingFromDeck', () => {
    it('pairs every usable card front/back', () => {
        const cards = [card({ front: 'cat', back: 'a small animal' }), card({ front: 'dog', back: 'a pet' })];
        const q = generateMatchingFromDeck('My Deck', cards);
        expect(q?.type).toBe('matching');
        expect(q?.matchingPairs).toHaveLength(2);
        expect(q?.matchingPairs?.map((p) => p.left)).toEqual(['cat', 'dog']);
    });

    it('skips cards missing a front or back', () => {
        const cards = [
            card({ front: 'cat', back: 'a small animal' }),
            card({ front: 'dog', back: 'a pet' }),
            card({ front: '', back: 'no front' }),
        ];
        const q = generateMatchingFromDeck('My Deck', cards);
        expect(q?.matchingPairs).toHaveLength(2);
    });

    it('returns null with fewer than 2 usable cards', () => {
        expect(generateMatchingFromDeck('My Deck', [card({})])).toBeNull();
    });

    it("excludes cards with a duplicate front or back — ambiguous pairs can't be told apart", () => {
        const cards = [
            card({ front: 'run', back: 'to move fast' }),
            card({ front: 'run', back: 'to manage a business' }), // duplicate front
            card({ front: 'jog', back: 'to move fast' }), // duplicate back (with the first "run")
            card({ front: 'sprint', back: 'to run very fast' }),
            card({ front: 'walk', back: 'to move slowly' }),
        ];
        const q = generateMatchingFromDeck('My Deck', cards);
        expect(q?.matchingPairs?.map((p) => p.left)).toEqual(['sprint', 'walk']);
    });
});

describe('generateMultipleChoiceFromDeck', () => {
    const deck = ['cat', 'dog', 'bird', 'fish', 'lion'].map((front) => card({ front, back: `def of ${front}` }));

    it('creates one question per card with 4 options including the correct one', () => {
        const questions = generateMultipleChoiceFromDeck(deck);
        expect(questions).toHaveLength(5);
        for (const q of questions) {
            expect(q.options).toHaveLength(4);
            expect(q.options?.filter((o) => o.isCorrect)).toHaveLength(1);
        }
    });

    it('returns nothing when the deck is too small for distinct distractors', () => {
        expect(generateMultipleChoiceFromDeck(deck.slice(0, 3))).toEqual([]);
    });

    it('excludes cards with a duplicate back — two questions with the same prompt but different correct answers are unanswerable', () => {
        const cards = [
            card({ front: 'run', back: 'to move fast' }),
            card({ front: 'sprint', back: 'to move fast' }), // duplicate back
            card({ front: 'walk', back: 'to move slowly' }),
            card({ front: 'crawl', back: 'to move on hands and knees' }),
            card({ front: 'jump', back: 'to leap' }),
        ];
        const questions = generateMultipleChoiceFromDeck(cards);
        const prompts = questions.map((q) => q.prompt);
        expect(prompts).not.toContain('to move fast');
    });
});

describe('generateClozeFromDeck', () => {
    it('gaps the front word inside its example sentence', () => {
        const cards = [card({ front: 'abandon', example: 'He had to abandon the ship.' })];
        const questions = generateClozeFromDeck(cards);
        expect(questions).toHaveLength(1);
        const gaps = renderClozeSegments(questions[0].prompt).filter((s) => s.type === 'gap');
        expect(gaps).toHaveLength(1);
        expect(gaps[0].gap.alternatives[0].toLowerCase()).toBe('abandon');
    });

    it('skips cards without an example or without the word in it', () => {
        const cards = [card({ front: 'abandon' }), card({ front: 'flee', example: 'He ran away quickly.' })];
        expect(generateClozeFromDeck(cards)).toHaveLength(0);
    });

    it('matches accented words — \\b is ASCII-only and fails after a letter like "é"', () => {
        const cards = [card({ front: 'café', example: 'We went to a café yesterday.' })];
        const questions = generateClozeFromDeck(cards);
        expect(questions).toHaveLength(1);
        const gaps = renderClozeSegments(questions[0].prompt).filter((s) => s.type === 'gap');
        expect(gaps[0].gap.alternatives[0].toLowerCase()).toBe('café');
    });

    it('does not match the word as a substring of a longer word', () => {
        const cards = [card({ front: 'run', example: 'She is running late.' })];
        expect(generateClozeFromDeck(cards)).toHaveLength(0);
    });
});

describe('generateCategorizeFromDeck', () => {
    it('buckets cards by part of speech when at least two are present', () => {
        const cards = [
            card({ front: 'run', partOfSpeech: 'verb' }),
            card({ front: 'jump', partOfSpeech: 'verb' }),
            card({ front: 'happy', partOfSpeech: 'adjective' }),
        ];
        const q = generateCategorizeFromDeck('My Deck', cards);
        expect(q?.categories).toHaveLength(2);
        expect(q?.categorizeItems).toHaveLength(3);
    });

    it('returns null with only one part of speech', () => {
        const cards = [card({ front: 'run', partOfSpeech: 'verb' }), card({ front: 'jump', partOfSpeech: 'verb' })];
        expect(generateCategorizeFromDeck('My Deck', cards)).toBeNull();
    });

    it('excludes a front duplicated under two different parts of speech', () => {
        const cards = [
            card({ front: 'run', partOfSpeech: 'verb' }),
            card({ front: 'run', partOfSpeech: 'noun' }),
            card({ front: 'jump', partOfSpeech: 'verb' }),
            card({ front: 'happy', partOfSpeech: 'adjective' }),
        ];
        const q = generateCategorizeFromDeck('My Deck', cards);
        expect(q?.categorizeItems?.map((i) => i.text)).toEqual(['jump', 'happy']);
    });
});

describe('generateQuestionsFromDeck', () => {
    it('combines every applicable generator', () => {
        const cards = ['cat', 'dog', 'bird', 'fish', 'lion'].map((front) =>
            card({ front, back: `def of ${front}`, example: `I saw a ${front} today.`, partOfSpeech: 'noun' })
        );
        const questions = generateQuestionsFromDeck('My Deck', cards);
        const types = new Set(questions.map((q) => q.type));
        expect(types.has('matching')).toBe(true);
        expect(types.has('multiple-choice')).toBe(true);
        expect(types.has('cloze')).toBe(true);
        // only one part of speech present -> no categorize question
        expect(types.has('categorize')).toBe(false);
    });
});
