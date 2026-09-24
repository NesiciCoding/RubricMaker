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
