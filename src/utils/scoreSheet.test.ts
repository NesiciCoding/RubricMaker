import { describe, expect, it } from 'vitest';
import type { StudentTest, Test } from '../types';
import {
    applyCellEdit,
    buildScoreSheetCsv,
    countFlaggedCells,
    defaultScoreOnlyQuestions,
    flaggedColumnLabels,
    formatPoints,
    isFlaggedForReview,
    isSheetComplete,
    newScoreOnlyQuestion,
    parsePastedGrid,
    parsePoints,
    setAbsent,
    toggleReviewFlag,
    validateCell,
} from './scoreSheet';

const test: Test = {
    id: 't',
    name: 'T',
    questions: [
        { id: 'a', prompt: '1', type: 'open', points: 2 },
        { id: 'b', prompt: '2', type: 'short-answer', points: 3, expectedAnswer: 'cat' },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
};
const NOW = '2026-11-01T10:00:00.000Z';

describe('parsing', () => {
    it('reads dot and comma decimals', () => {
        expect(parsePoints('4,5')).toBe(4.5);
        expect(parsePoints(' 3 ')).toBe(3);
        expect(parsePoints('.5')).toBe(0.5);
        expect(parsePoints('2.')).toBe(2);
        expect(parsePoints('')).toBeNull();
        expect(parsePoints('-')).toBeNull();
        expect(parsePoints('abc')).toBeNaN();
        expect(parsePoints('-1')).toBeNaN();
    });

    it('validates cells against the max', () => {
        expect(validateCell('2', 2)).toBe('ok');
        expect(validateCell('2,5', 2)).toBe('over_max');
        expect(validateCell('x', 2)).toBe('invalid');
        expect(validateCell('', 2)).toBe('empty');
    });

    it('splits pasted spreadsheet blocks', () => {
        expect(parsePastedGrid('1\t2\r\n3\t4,5\n\n')).toEqual([
            ['1', '2'],
            ['3', '4,5'],
        ]);
    });
});

describe('applyCellEdit', () => {
    it('creates a manual record and grades it once every cell is filled', () => {
        const first = applyCellEdit(undefined, test, 's1', 'a', 1.5, NOW);
        expect(first).toMatchObject({ source: 'manual', status: 'in_progress', rawTotalPoints: 1.5, studentId: 's1' });
        const second = applyCellEdit(first, test, 's1', 'b', 9, NOW);
        expect(second.answers.find((x) => x.questionId === 'b')?.pointsEarned).toBe(3);
        expect(second).toMatchObject({ status: 'graded', rawTotalPoints: 4.5, gradedAt: NOW, submittedAt: NOW });
        expect(isSheetComplete(test, second)).toBe(true);
    });

    it('clears a typed cell', () => {
        const filled = applyCellEdit(undefined, test, 's1', 'a', 2, NOW);
        const cleared = applyCellEdit(filled, test, 's1', 'a', null, NOW);
        expect(cleared.answers).toEqual([]);
        expect(cleared.rawTotalPoints).toBe(0);
    });

    it("keeps an online answer's response and falls back to its auto-score when cleared", () => {
        const online: StudentTest = {
            id: 'x',
            testId: 't',
            studentId: 's1',
            status: 'submitted',
            startedAt: NOW,
            answers: [{ questionId: 'b', response: 'cat' }],
        };
        const overridden = applyCellEdit(online, test, 's1', 'b', 1, NOW);
        expect(overridden.answers).toEqual([{ questionId: 'b', response: 'cat', pointsEarned: 1 }]);
        expect(overridden.status).toBe('submitted');
        const restored = applyCellEdit(overridden, test, 's1', 'b', null, NOW);
        expect(restored.answers).toEqual([{ questionId: 'b', response: 'cat' }]);
        expect(restored.rawTotalPoints).toBe(3);
    });

    it('ignores an unknown question', () => {
        expect(applyCellEdit(undefined, test, 's1', 'zzz', 1, NOW).answers).toEqual([]);
    });
});

describe('helpers', () => {
    it('marks students absent and back', () => {
        const absent = setAbsent(undefined, test, 's1', true, NOW);
        expect(absent).toMatchObject({ absent: true, source: 'manual' });
        expect(setAbsent(absent, test, 's1', false, NOW).absent).toBeUndefined();
    });

    it('creates score-only columns', () => {
        expect(newScoreOnlyQuestion('1a', 4)).toMatchObject({ prompt: '1a', points: 4, type: 'open' });
        expect(defaultScoreOnlyQuestions().map((q) => q.prompt)).toEqual(['1', '2', '3', '4', '5']);
    });

    it('formats points per locale', () => {
        expect(formatPoints(4.5, 'nl')).toBe('4,5');
        expect(formatPoints(4, 'en')).toBe('4');
    });
});

describe('buildScoreSheetCsv', () => {
    it('writes points, totals and one column per unresolved norm tier', () => {
        const csv = buildScoreSheetCsv(
            ['1a', '1b'],
            [
                {
                    name: 'Anna',
                    studentNumber: '1',
                    points: [2, 1.5],
                    total: 3.5,
                    percentage: 70,
                    grade: '7.3',
                    absent: false,
                    flagged: ['1a'],
                },
                {
                    name: 'Bram',
                    studentNumber: '',
                    points: [null, null],
                    total: null,
                    percentage: null,
                    grade: '',
                    alternatives: [
                        { label: 'HAVO', grade: 6 },
                        { label: 'VWO', grade: null },
                    ],
                    absent: true,
                },
            ]
        );
        const [header, anna, bram] = csv.split(/\r?\n/);
        expect(header).toBe(
            'Student Name,Student Number,1a,1b,Total,Score %,Grade,Grade (HAVO),Grade (VWO),Absent,Flagged'
        );
        // The flag travels with the row, so a marked sheet is still findable after export.
        expect(anna).toBe('Anna,1,2,1.5,3.5,70.0,7.3,,,,1a');
        expect(bram).toBe('Bram,,,,,,,6,,yes,');
    });
});

describe('review flags', () => {
    it('flags and clears a cell without touching its score', () => {
        const flagged = toggleReviewFlag(undefined, test, 's1', 'a', NOW);
        expect(flagged.reviewFlags).toEqual(['a']);
        expect(flagged.source).toBe('manual');
        expect(flagged.answers).toEqual([]);
        expect(isFlaggedForReview(flagged, 'a')).toBe(true);

        const cleared = toggleReviewFlag(flagged, test, 's1', 'a', NOW);
        // An explicit empty array, not a removed field: the clear has to be able to beat a stale copy in a merge.
        expect(cleared.reviewFlags).toEqual([]);
        expect(isFlaggedForReview(cleared, 'a')).toBe(false);
    });

    it('keeps the flag through a re-typed cell and the score through a cleared flag', () => {
        const flagged = toggleReviewFlag(applyCellEdit(undefined, test, 's1', 'a', 1.5, NOW), test, 's1', 'a', NOW);
        expect(flagged.reviewFlags).toEqual(['a']);

        const retyped = applyCellEdit(flagged, test, 's1', 'a', 2, NOW);
        expect(retyped.reviewFlags).toEqual(['a']);
        expect(retyped.answers[0].pointsEarned).toBe(2);

        const cleared = toggleReviewFlag(retyped, test, 's1', 'a', NOW);
        expect(cleared.reviewFlags).toEqual([]);
        expect(cleared.answers[0].pointsEarned).toBe(2);
    });

    it('keeps several flags in the order they were set', () => {
        const two = toggleReviewFlag(toggleReviewFlag(undefined, test, 's1', 'a', NOW), test, 's1', 'b', NOW);
        expect(two.reviewFlags).toEqual(['a', 'b']);
        expect(isFlaggedForReview(two, 'b')).toBe(true);
        expect(isFlaggedForReview(two, 'zzz')).toBe(false);
        expect(isFlaggedForReview(undefined, 'a')).toBe(false);
    });
});

describe('review flags beyond the grid', () => {
    const withFlags = (studentId: string, reviewFlags: string[]): StudentTest => ({
        id: `st-${studentId}`,
        testId: 't',
        studentId,
        answers: [],
        status: 'in_progress',
        startedAt: NOW,
        source: 'manual',
        reviewFlags,
    });

    it('counts flagged cells across submissions and ignores ids no longer on the test', () => {
        expect(countFlaggedCells(test, [])).toBe(0);
        expect(countFlaggedCells(test, [withFlags('s1', ['a', 'gone']), withFlags('s2', ['b'])])).toBe(2);
    });

    it('labels the flagged columns in column order for the CSV', () => {
        expect(flaggedColumnLabels(test, undefined, ['1', '2'])).toEqual([]);
        expect(flaggedColumnLabels(test, ['b', 'a'], ['1', '2'])).toEqual(['1', '2']);
        expect(flaggedColumnLabels(test, ['b', 'gone'], ['1', '2'])).toEqual(['2']);
    });
});
