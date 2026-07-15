import { describe, it, expect } from 'vitest';
import {
    isStagedTest,
    entrySectionId,
    isAutoScorable,
    sectionQuestions,
    sectionMaxPoints,
    scoreSectionPct,
    resolveNextSection,
    maxPointsForPath,
    hasRoutingCycle,
} from './placementRouting';
import type { Test, TestQuestion } from '../types';

const mcQuestion = (id: string, sectionId: string, correctOptionId = 'right'): TestQuestion => ({
    id,
    prompt: `Question ${id}`,
    type: 'multiple-choice',
    points: 10,
    sectionId,
    options: [
        { id: 'wrong', text: 'Wrong', isCorrect: false },
        { id: correctOptionId, text: 'Right', isCorrect: correctOptionId === 'right' },
    ],
});

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 't1',
    name: 'Placement test',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    mode: 'placement',
    sections: [
        {
            id: 'routing',
            title: 'Routing',
            routing: { thresholdPct: 60, passSectionId: 'hard', failSectionId: 'easy' },
        },
        { id: 'easy', title: 'Easy', cefrLevel: 'A1' },
        { id: 'hard', title: 'Hard', cefrLevel: 'B1' },
    ],
    ...overrides,
});

describe('isStagedTest', () => {
    it('is true when any section has a routing rule', () => {
        expect(isStagedTest(makeTest())).toBe(true);
    });

    it('is false when no section has routing', () => {
        expect(isStagedTest(makeTest({ sections: [{ id: 's1', title: 'One' }] }))).toBe(false);
    });

    it('is false when there are no sections', () => {
        expect(isStagedTest(makeTest({ sections: undefined }))).toBe(false);
    });
});

describe('entrySectionId', () => {
    it('returns the first section id', () => {
        expect(entrySectionId(makeTest())).toBe('routing');
    });

    it('returns null when there are no sections', () => {
        expect(entrySectionId(makeTest({ sections: undefined }))).toBeNull();
    });
});

describe('isAutoScorable', () => {
    it('is false only for open questions', () => {
        expect(isAutoScorable({ id: 'q', prompt: '', type: 'open', points: 1 })).toBe(false);
        expect(isAutoScorable({ id: 'q', prompt: '', type: 'short-answer', points: 1 })).toBe(true);
        expect(isAutoScorable(mcQuestion('q', 'routing'))).toBe(true);
    });
});

describe('sectionQuestions', () => {
    it('includes questions tagged with the section id', () => {
        const test = makeTest({ questions: [mcQuestion('q1', 'easy'), mcQuestion('q2', 'hard')] });
        expect(sectionQuestions(test, 'easy').map((q) => q.id)).toEqual(['q1']);
    });

    it('folds unsectioned questions into the entry section', () => {
        const unsectioned: TestQuestion = { id: 'q0', prompt: 'Common', type: 'multiple-choice', points: 5 };
        const test = makeTest({ questions: [unsectioned, mcQuestion('q1', 'routing')] });
        expect(sectionQuestions(test, 'routing').map((q) => q.id)).toEqual(['q0', 'q1']);
        expect(sectionQuestions(test, 'easy')).toEqual([]);
    });
});

describe('sectionMaxPoints / scoreSectionPct', () => {
    it('sums only that section points', () => {
        const test = makeTest({ questions: [mcQuestion('q1', 'routing'), mcQuestion('q2', 'routing')] });
        expect(sectionMaxPoints(test, 'routing')).toBe(20);
    });

    it('scores a section independently of the rest of the test', () => {
        const test = makeTest({
            questions: [mcQuestion('q1', 'routing'), mcQuestion('q2', 'routing'), mcQuestion('q3', 'easy')],
        });
        const pct = scoreSectionPct(test, 'routing', [
            { questionId: 'q1', response: 'right' },
            { questionId: 'q2', response: 'wrong' },
        ]);
        expect(pct).toBe(50);
    });

    it('returns 0 when the section has no points', () => {
        expect(scoreSectionPct(makeTest({ questions: [] }), 'routing', [])).toBe(0);
    });
});

describe('resolveNextSection', () => {
    const test = makeTest({ questions: [mcQuestion('q1', 'routing')] });

    it('routes to passSectionId when the threshold is met', () => {
        expect(resolveNextSection(test, 'routing', [{ questionId: 'q1', response: 'right' }], ['routing'])).toBe(
            'hard'
        );
    });

    it('routes to failSectionId when below threshold', () => {
        expect(resolveNextSection(test, 'routing', [{ questionId: 'q1', response: 'wrong' }], ['routing'])).toBe(
            'easy'
        );
    });

    it('returns null for a terminal section with no routing', () => {
        expect(resolveNextSection(test, 'easy', [], ['routing', 'easy'])).toBeNull();
    });

    it('returns null when the routing target was already visited (cycle guard)', () => {
        expect(
            resolveNextSection(test, 'routing', [{ questionId: 'q1', response: 'right' }], ['routing', 'hard'])
        ).toBeNull();
    });

    it('returns null when the routing target section no longer exists', () => {
        const dangling = makeTest({
            sections: [
                {
                    id: 'routing',
                    title: 'Routing',
                    routing: { thresholdPct: 60, passSectionId: 'ghost', failSectionId: 'easy' },
                },
            ],
            questions: [mcQuestion('q1', 'routing')],
        });
        expect(
            resolveNextSection(dangling, 'routing', [{ questionId: 'q1', response: 'right' }], ['routing'])
        ).toBeNull();
    });
});

describe('maxPointsForPath', () => {
    it('sums max points across only the visited sections', () => {
        const test = makeTest({
            questions: [mcQuestion('q1', 'routing'), mcQuestion('q2', 'easy'), mcQuestion('q3', 'hard')],
        });
        expect(maxPointsForPath(test, ['routing', 'hard'])).toBe(20);
        expect(maxPointsForPath(test, ['routing', 'easy'])).toBe(20);
    });
});

describe('hasRoutingCycle', () => {
    it('is false for a simple branching tree', () => {
        expect(hasRoutingCycle(makeTest())).toBe(false);
    });

    it('detects a direct two-section cycle', () => {
        const test = makeTest({
            sections: [
                { id: 'a', title: 'A', routing: { thresholdPct: 60, passSectionId: 'b', failSectionId: 'b' } },
                { id: 'b', title: 'B', routing: { thresholdPct: 60, passSectionId: 'a', failSectionId: 'a' } },
            ],
        });
        expect(hasRoutingCycle(test)).toBe(true);
    });

    it('detects a self-referencing section', () => {
        const test = makeTest({
            sections: [{ id: 'a', title: 'A', routing: { thresholdPct: 60, passSectionId: 'a', failSectionId: 'a' } }],
        });
        expect(hasRoutingCycle(test)).toBe(true);
    });

    it('ignores dangling routing targets', () => {
        const test = makeTest({
            sections: [
                { id: 'a', title: 'A', routing: { thresholdPct: 60, passSectionId: 'ghost', failSectionId: 'ghost' } },
            ],
        });
        expect(hasRoutingCycle(test)).toBe(false);
    });
});
