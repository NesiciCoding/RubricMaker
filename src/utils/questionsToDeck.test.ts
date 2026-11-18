import { describe, expect, it } from 'vitest';
import { buildReviewDeck, cardsFromMissedQuestions, cardsFromQuestion } from './questionsToDeck';
import type { TestQuestion } from '../types';

function question(patch: Partial<TestQuestion> & Pick<TestQuestion, 'type'>): TestQuestion {
    return { id: 'q1', prompt: '', points: 1, ...patch };
}

describe('cardsFromQuestion', () => {
    it('turns a multiple-choice answer into an answer/prompt card with the HTML stripped', () => {
        const cards = cardsFromQuestion(
            question({
                type: 'multiple-choice',
                prompt: '<p>Yesterday I ___ to school.</p>',
                options: [
                    { id: 'a', text: 'went', isCorrect: true },
                    { id: 'b', text: 'goed', isCorrect: false },
                ],
            })
        );
        expect(cards).toHaveLength(1);
        expect(cards[0].front).toBe('went');
        expect(cards[0].back).toBe('Yesterday I ___ to school.');
    });

    it('joins every correct multiple-response option', () => {
        const cards = cardsFromQuestion(
            question({
                type: 'multiple-response',
                prompt: 'Which are vegetables?',
                options: [
                    { id: 'a', text: 'carrot', isCorrect: true },
                    { id: 'b', text: 'potato', isCorrect: true },
                    { id: 'c', text: 'apple', isCorrect: false },
                ],
            })
        );
        expect(cards[0].front).toBe('carrot / potato');
    });

    it('prefers the first accepted short answer', () => {
        const cards = cardsFromQuestion(
            question({
                type: 'short-answer',
                prompt: 'Capital of France?',
                expectedAnswer: 'Paris',
                expectedAnswers: ['Paris', 'paris'],
            })
        );
        expect(cards[0]).toMatchObject({ front: 'Paris', back: 'Capital of France?' });
    });

    it('makes one card per matching pair', () => {
        const cards = cardsFromQuestion(
            question({
                type: 'matching',
                prompt: 'Match the words',
                matchingPairs: [
                    { id: 'p1', left: 'cat', right: 'a small animal' },
                    { id: 'p2', left: '', right: 'to run' },
                ],
            })
        );
        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({ front: 'cat', back: 'a small animal' });
    });

    it('makes one card per cloze gap and follows the dropdown first-answer rule', () => {
        const cloze = cardsFromQuestion(question({ type: 'cloze', prompt: 'The {{cat|dog}} sat on the {{mat}}.' }));
        expect(cloze.map((c) => c.front)).toEqual(['cat', 'mat']);

        const dropdown = cardsFromQuestion(question({ type: 'cloze-dropdown', prompt: 'The {{=cat|~dog}} sat.' }));
        expect(dropdown.map((c) => c.front)).toEqual(['cat']);
    });

    it('maps no card for a type without a prompt/answer pair', () => {
        expect(cardsFromQuestion(question({ type: 'true-false', prompt: 'The sky is green.' }))).toEqual([]);
        expect(cardsFromQuestion(question({ type: 'numeric', prompt: '2 + 2' }))).toEqual([]);
    });
});

describe('cardsFromMissedQuestions', () => {
    it('keeps only answers that lost points, including partial credit', () => {
        const cards = cardsFromMissedQuestions([
            {
                question: question({
                    id: 'full',
                    type: 'multiple-choice',
                    prompt: 'Pick one',
                    options: [{ id: 'a', text: 'right', isCorrect: true }],
                }),
                pointsEarned: 1,
            },
            {
                question: question({
                    id: 'partial',
                    type: 'multiple-choice',
                    prompt: 'Pick two',
                    points: 2,
                    options: [
                        { id: 'a', text: 'one', isCorrect: true },
                        { id: 'b', text: 'two', isCorrect: true },
                    ],
                }),
                pointsEarned: 1,
            },
        ]);
        expect(cards).toHaveLength(1);
        expect(cards[0].back).toBe('Pick two');
    });

    it('folds duplicate front/back pairs', () => {
        const make = (id: string) => ({
            question: question({
                id,
                type: 'multiple-choice' as const,
                prompt: 'Same prompt',
                options: [{ id: 'a', text: 'same answer', isCorrect: true }],
            }),
            pointsEarned: 0,
        });
        expect(cardsFromMissedQuestions([make('a'), make('b')])).toHaveLength(1);
    });
});

describe('buildReviewDeck', () => {
    it('returns null when nothing maps to a card', () => {
        expect(buildReviewDeck('Deck', [])).toBeNull();
    });

    it('builds a vocabulary deck from the missed items', () => {
        const deck = buildReviewDeck('  Unit 4 review  ', [
            {
                question: question({
                    type: 'multiple-choice',
                    prompt: 'A young dog',
                    options: [{ id: 'a', text: 'puppy', isCorrect: true }],
                }),
                pointsEarned: 0,
            },
        ]);
        expect(deck).toMatchObject({ name: 'Unit 4 review', deckKind: 'vocabulary' });
        expect(deck?.cards).toHaveLength(1);
        expect(deck?.cards[0].front).toBe('puppy');
    });
});
