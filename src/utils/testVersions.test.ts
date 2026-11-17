import { describe, expect, it } from 'vitest';
import {
    MAX_TEST_VERSIONS,
    normalizeVersionCount,
    versionForStudent,
    versionIndexForStudent,
    versionLabels,
    versionQuestion,
    versionedTest,
} from './testVersions';
import type { Test, TestQuestion } from '../types';

function question(patch: Partial<TestQuestion> = {}): TestQuestion {
    return {
        id: 'q1',
        prompt: 'Pick one',
        type: 'multiple-choice',
        points: 1,
        options: [
            { id: 'a', text: 'one', isCorrect: true },
            { id: 'b', text: 'two', isCorrect: false },
            { id: 'c', text: 'three', isCorrect: false },
            { id: 'd', text: 'four', isCorrect: false },
        ],
        ...patch,
    };
}

function test(questions: TestQuestion[] = [question()], versionCount?: number): Test {
    return {
        id: 't1',
        name: 'Unit test',
        questions,
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00Z',
        versionCount,
    };
}

describe('versionCount helpers', () => {
    it('clamps to 1–4 and treats missing/garbage as a single version', () => {
        expect(normalizeVersionCount(undefined)).toBe(1);
        expect(normalizeVersionCount(0)).toBe(1);
        expect(normalizeVersionCount(-2)).toBe(1);
        expect(normalizeVersionCount(2.7)).toBe(2);
        expect(normalizeVersionCount(99)).toBe(MAX_TEST_VERSIONS);
    });

    it('offers letters only when there is more than one version', () => {
        expect(versionLabels(1)).toEqual([]);
        expect(versionLabels(undefined)).toEqual([]);
        expect(versionLabels(3)).toEqual(['A', 'B', 'C']);
        expect(versionLabels(9)).toEqual(['A', 'B', 'C', 'D']);
    });
});

describe('versionForStudent', () => {
    it('returns no version for a single-version test or a missing student', () => {
        expect(versionForStudent('s1', 1)).toBeNull();
        expect(versionForStudent('', 3)).toBeNull();
    });

    it('is stable for the same student and always inside the offered letters', () => {
        for (const id of ['s1', 'student-2', 'abc', 'zzz']) {
            const first = versionForStudent(id, 4);
            expect(first).toBe(versionForStudent(id, 4));
            expect(versionLabels(4)).toContain(first!);
        }
        expect(versionIndexForStudent('s1', 4)).toBe(versionIndexForStudent('s1', 4));
    });

    it('can land students on different versions', () => {
        const assigned = new Set(Array.from({ length: 40 }, (_, i) => versionForStudent(`student-${i}`, 4)));
        expect(assigned.size).toBeGreaterThan(1);
    });
});

describe('versionQuestion', () => {
    it('reorders choice options but keeps every option and id exactly once', () => {
        const original = question();
        const versioned = versionQuestion(original, 'B');
        expect(versioned.options).toHaveLength(4);
        expect(new Set(versioned.options!.map((o) => o.id))).toEqual(new Set(['a', 'b', 'c', 'd']));
        expect(original.options!.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('is deterministic per version/question and differs across versions', () => {
        const once = versionQuestion(question(), 'A').options!.map((o) => o.id);
        expect(versionQuestion(question(), 'A').options!.map((o) => o.id)).toEqual(once);
        const orders = new Set(
            ['A', 'B', 'C', 'D'].map((v) =>
                versionQuestion(question(), v)
                    .options!.map((o) => o.id)
                    .join('')
            )
        );
        expect(orders.size).toBeGreaterThan(1);
    });

    it('leaves non-choice questions and the authored question untouched', () => {
        const ordering = question({ type: 'ordering', orderItems: [{ id: 'o1', text: 'one' }] });
        expect(versionQuestion(ordering, 'B')).toBe(ordering);
        const unchanged = question();
        expect(versionQuestion(unchanged, null)).toBe(unchanged);
        const original = question();
        versionQuestion(original, 'C');
        expect(original.options!.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    });
});

describe('versionedTest', () => {
    it('returns the test unchanged when there is no version', () => {
        const source = test();
        expect(versionedTest(source, null)).toBe(source);
    });

    it('versions every choice question without mutating the source', () => {
        const source = test([question({ id: 'q1' }), question({ id: 'q2', type: 'multiple-response' })]);
        const versioned = versionedTest(source, 'B');
        expect(versioned).not.toBe(source);
        expect(versioned.questions[0].id).toBe('q1');
        expect(versioned.questions[1].type).toBe('multiple-response');
        expect(source.questions[0].options!.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(versioned.questions[0].options!.map((o) => o.id)).not.toEqual(['a', 'b', 'c', 'd']);
    });
});
