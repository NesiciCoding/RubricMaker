import { describe, it, expect } from 'vitest';
import type { Test, TestQuestion } from '../types';
import {
    answerSheetGeometry,
    answerSpaceFor,
    clozeBookletParts,
    groupQuestionsBySection,
    hotTextFallbackText,
    hotTextMirrorParts,
    optionLetter,
    orderingBookletItems,
    partialCreditLadder,
    pointLabel,
} from './testExamContent';

function q(overrides: Partial<TestQuestion> & Pick<TestQuestion, 'id' | 'type' | 'points' | 'prompt'>): TestQuestion {
    return { partialCredit: true, ...overrides };
}

function makeTest(overrides: Partial<Test> = {}): Test {
    return {
        id: 't1',
        name: 'Sample Test',
        questions: [],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('groupQuestionsBySection', () => {
    it('numbers questions continuously across sections, then ungrouped last', () => {
        const test = makeTest({
            sections: [
                { id: 's1', title: 'Tekst 1' },
                { id: 's2', title: 'Tekst 2' },
            ],
            questions: [
                q({ id: 'a', type: 'open', points: 1, prompt: 'A', sectionId: 's1' }),
                q({ id: 'b', type: 'open', points: 1, prompt: 'B', sectionId: 's2' }),
                q({ id: 'c', type: 'open', points: 1, prompt: 'C' }),
            ],
        });
        const groups = groupQuestionsBySection(test);
        expect(groups.map((g) => g.section?.title ?? null)).toEqual(['Tekst 1', 'Tekst 2', null]);
        expect(groups[0].questions[0].number).toBe(1);
        expect(groups[1].questions[0].number).toBe(2);
        expect(groups[2].questions[0].number).toBe(3);
    });
});

describe('optionLetter / pointLabel', () => {
    it('derives A/B/C... and "Np" labels', () => {
        expect(optionLetter(0)).toBe('A');
        expect(optionLetter(4)).toBe('E');
        expect(pointLabel(3)).toBe('3p');
    });
});

describe('partialCreditLadder', () => {
    it('matches the real CITO ladder for a 6-item / 3-point categorize question', () => {
        const question = q({
            id: 'q5',
            type: 'categorize',
            points: 3,
            prompt: 'wel/niet',
            categories: [
                { id: 'wel', label: 'wel' },
                { id: 'niet', label: 'niet' },
            ],
            categorizeItems: Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, text: `s${i}`, categoryId: 'wel' })),
        });
        expect(partialCreditLadder(question)).toEqual([
            { correct: 6, points: 3 },
            { correct: 5, points: 2 },
            { correct: 4, points: 1 },
            { correct: 3, points: 0 },
        ]);
    });

    it('matches the real CITO ladder for a 4-item / 2-point question', () => {
        const question = q({
            id: 'q11',
            type: 'categorize',
            points: 2,
            prompt: 'wel/niet',
            categories: [{ id: 'wel', label: 'wel' }],
            categorizeItems: Array.from({ length: 4 }, (_, i) => ({ id: `i${i}`, text: `s${i}`, categoryId: 'wel' })),
        });
        expect(partialCreditLadder(question)).toEqual([
            { correct: 4, points: 2 },
            { correct: 3, points: 1 },
            { correct: 2, points: 0 },
        ]);
    });

    it('returns null for single-shot question types', () => {
        const question = q({ id: 'q1', type: 'multiple-choice', points: 1, prompt: 'p', options: [] });
        expect(partialCreditLadder(question)).toBeNull();
    });

    it('returns null when partialCredit is explicitly false', () => {
        const question = q({
            id: 'q2',
            type: 'matching',
            points: 3,
            prompt: 'p',
            partialCredit: false,
            matchingPairs: [
                { id: '1', left: 'a', right: 'b' },
                { id: '2', left: 'c', right: 'd' },
            ],
        });
        expect(partialCreditLadder(question)).toBeNull();
    });
});

describe('hot-text helpers', () => {
    const question = q({
        id: 'ht1',
        type: 'hot-text',
        points: 1,
        prompt: 'select',
        hotTextPassage: 'The [[quick brown fox]] jumps over the [[lazy dog]].',
        hotTextCorrectIndices: [1],
    });

    it('produces a plain fallback quote with brackets stripped', () => {
        expect(hotTextFallbackText(question)).toBe('The quick brown fox jumps over the lazy dog.');
    });

    it('numbers each selectable fragment for the mirror mode', () => {
        const parts = hotTextMirrorParts(question);
        const fragments = parts.filter((p) => p.number !== undefined);
        expect(fragments).toEqual([
            { text: 'quick brown fox', number: 1 },
            { text: 'lazy dog', number: 2 },
        ]);
    });
});

describe('answerSheetGeometry', () => {
    it('lays out one row per question, tagging mcq vs open kind', () => {
        const test = makeTest({
            questions: [
                q({
                    id: 'mc',
                    type: 'multiple-choice',
                    points: 1,
                    prompt: 'p',
                    options: [
                        { id: 'a', text: 'A', isCorrect: true },
                        { id: 'b', text: 'B', isCorrect: false },
                    ],
                }),
                q({ id: 'op', type: 'open', points: 2, prompt: 'p' }),
            ],
        });
        const blocks = answerSheetGeometry(test);
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ number: 1, space: { kind: 'choice', optionLetters: ['A', 'B'] } });
        expect(blocks[1]).toMatchObject({ number: 2, space: { kind: 'long' } });
        // Blocks never overlap vertically.
        expect(blocks[1].y).toBeGreaterThan(blocks[0].y);
    });
});

describe('answerSpaceFor', () => {
    it('maps question types to their answer-sheet space kind', () => {
        expect(answerSpaceFor(q({ id: 'a', type: 'multiple-choice', points: 1, prompt: 'p', options: [] })).kind).toBe(
            'choice'
        );
        expect(answerSpaceFor(q({ id: 'b', type: 'short-answer', points: 1, prompt: 'p' })).kind).toBe('short');
        expect(answerSpaceFor(q({ id: 'c', type: 'open', points: 1, prompt: 'p' })).kind).toBe('long');
        expect(answerSpaceFor(q({ id: 'd', type: 'numeric', points: 1, prompt: 'p' })).kind).toBe('numeric');
        expect(answerSpaceFor(q({ id: 'e', type: 'audio-response', points: 1, prompt: 'p' })).kind).toBe('none');

        const matching = answerSpaceFor(
            q({
                id: 'f',
                type: 'matching',
                points: 3,
                prompt: 'p',
                matchingPairs: [
                    { id: '1', left: 'a', right: 'b' },
                    { id: '2', left: 'c', right: 'd' },
                ],
            })
        );
        expect(matching).toMatchObject({ kind: 'subitems', subItemCount: 2 });
    });
});

describe('clozeBookletParts', () => {
    it('leaves gaps blank (never the answer) and numbers them', () => {
        const question = q({
            id: 'cz',
            type: 'cloze',
            points: 2,
            prompt: 'The {{cat|kitten}} sat on the {{mat|rug}}.',
        });
        const parts = clozeBookletParts(question);
        const blanks = parts.filter((p) => p.blankNumber !== undefined);
        expect(blanks).toEqual([
            { text: '', blankNumber: 1 },
            { text: '', blankNumber: 2 },
        ]);
        expect(parts.some((p) => p.text.includes('cat') || p.text.includes('mat'))).toBe(false);
    });
});

describe('orderingBookletItems', () => {
    it('never prints items in their stored (correct-order) sequence', () => {
        const question = q({
            id: 'seed-that-reorders',
            type: 'ordering',
            points: 4,
            prompt: 'p',
            orderItems: [
                { id: '1', text: 'first' },
                { id: '2', text: 'second' },
                { id: '3', text: 'third' },
                { id: '4', text: 'fourth' },
            ],
        });
        const items = orderingBookletItems(question);
        expect(items.map((i) => i.text).sort()).toEqual(['first', 'fourth', 'second', 'third']);
        expect(items.map((i) => i.text)).not.toEqual(['first', 'second', 'third', 'fourth']);
    });
});
