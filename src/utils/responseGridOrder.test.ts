import { describe, it, expect } from 'vitest';
import { buildColumnMeta, orderColumns, questionCefrLevel, type GridColumnMeta } from './responseGridOrder';
import type { Test } from '../types';

const test: Test = {
    id: 't1',
    name: 'T',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [
        { id: 'secB', title: 'B section', cefrLevel: 'B1' },
        { id: 'secA', title: 'A section', cefrLevel: 'A2' },
    ],
    questions: [
        { id: 'q1', prompt: 'p1', type: 'multiple-choice', points: 1, sectionId: 'secB' },
        { id: 'q2', prompt: 'p2', type: 'short-answer', points: 1, sectionId: 'secA' },
        { id: 'q3', prompt: 'p3', type: 'open', points: 1 },
    ],
};

describe('questionCefrLevel', () => {
    it('reads the section level, then falls back to the first linked descriptor', () => {
        expect(questionCefrLevel(test, test.questions[0])).toBe('B1');
        expect(
            questionCefrLevel(test, {
                id: 'x',
                prompt: '',
                type: 'open',
                points: 1,
                linkedCefrDescriptors: [
                    { descriptorId: 'd', level: 'C1', skill: 'reading', descriptionEn: '', descriptionNl: '' },
                ],
            })
        ).toBe('C1');
        expect(questionCefrLevel(test, test.questions[2])).toBeUndefined();
    });
});

describe('orderColumns', () => {
    const cols = buildColumnMeta(
        test,
        new Map([
            ['q1', 0.2],
            ['q2', 0.9],
        ])
    );

    it('keeps original order by default', () => {
        expect(orderColumns(cols, [{ key: 'original', dir: 'asc' }]).map((c) => c.id)).toEqual(['q1', 'q2', 'q3']);
    });

    it('orders by CEFR level ascending, unlevelled last', () => {
        expect(orderColumns(cols, [{ key: 'cefr', dir: 'asc' }]).map((c) => c.id)).toEqual(['q2', 'q1', 'q3']);
    });

    it('orders by cumulative score ascending (hardest first), unanswered last', () => {
        expect(orderColumns(cols, [{ key: 'score', dir: 'asc' }]).map((c) => c.id)).toEqual(['q1', 'q2', 'q3']);
    });

    it('breaks ties on a secondary key then original index', () => {
        const tied: GridColumnMeta[] = [
            { id: 'a', originalIndex: 0, type: 'open', cefrLevel: 'B1' },
            { id: 'b', originalIndex: 1, type: 'open', cefrLevel: 'A2' },
            { id: 'c', originalIndex: 2, type: 'open', cefrLevel: 'A2' },
        ];
        const out = orderColumns(tied, [
            { key: 'type', dir: 'asc' },
            { key: 'cefr', dir: 'asc' },
        ]);
        expect(out.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    });

    it('reverses with desc', () => {
        expect(orderColumns(cols, [{ key: 'cefr', dir: 'desc' }]).map((c) => c.id)).toEqual(['q1', 'q2', 'q3']);
    });
});
