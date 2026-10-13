import { describe, it, expect } from 'vitest';
import { remapEntriesToRubric, sameGradeScale } from './gradeSnapshot';
import { calcGradeSummary } from './gradeCalc';
import { DEFAULT_FORMAT } from '../types';
import type { GradeScale, Rubric, ScoreEntry, StudentRubric } from '../types';

const scale: GradeScale = {
    id: 'gs',
    name: 'Scale',
    type: 'letter',
    ranges: [
        { min: 50, max: 100, label: 'Pass', color: '#0f0' },
        { min: 0, max: 49, label: 'Fail', color: '#f00' },
    ],
};

const rubric: Rubric = {
    id: 'r',
    name: 'R',
    subject: '',
    description: '',
    gradeScaleId: 'gs',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '',
    updatedAt: '',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    criteria: [
        {
            id: 'c1',
            title: 'Kept',
            description: '',
            weight: 50,
            levels: [
                {
                    id: 'hi',
                    label: 'High',
                    minPoints: 6,
                    maxPoints: 8,
                    description: '',
                    subItems: [{ id: 'si1', label: 'Sub' }],
                },
            ],
        },
        {
            id: 'c3',
            title: 'New',
            description: '',
            weight: 50,
            levels: [{ id: 'x', label: 'X', minPoints: 0, maxPoints: 4, description: '', subItems: [] }],
        },
    ],
};

const entry = (patch: Partial<ScoreEntry>): ScoreEntry => ({
    criterionId: 'c1',
    levelId: null,
    comment: '',
    checkedSubItems: [],
    ...patch,
});

describe('sameGradeScale', () => {
    it('compares ids and every range field', () => {
        expect(sameGradeScale(scale, { ...scale })).toBe(true);
        expect(sameGradeScale(null, undefined)).toBe(true);
        expect(sameGradeScale(scale, null)).toBe(false);
        expect(sameGradeScale(scale, { ...scale, id: 'other' })).toBe(false);
        expect(sameGradeScale(scale, { ...scale, ranges: scale.ranges.slice(1) })).toBe(false);
        expect(sameGradeScale(scale, { ...scale, ranges: [{ ...scale.ranges[0], min: 55 }, scale.ranges[1]] })).toBe(
            false
        );
    });
});

describe('remapEntriesToRubric', () => {
    it('keeps surviving levels, clamps points, drops stale sub-items, starts new criteria ungraded and retains removed criteria', () => {
        const { entries, clearedCount, removedCount } = remapEntriesToRubric(
            [
                entry({
                    levelId: 'hi',
                    selectedPoints: 10,
                    checkedSubItems: ['si1', 'gone'],
                    subItemScores: { si1: 1, gone: 2 },
                    comment: 'keep me',
                }),
                entry({ criterionId: 'c2', levelId: 'any', comment: 'old criterion feedback' }),
            ],
            rubric
        );
        expect(clearedCount).toBe(0);
        expect(removedCount).toBe(1);
        expect(entries).toEqual([
            entry({
                levelId: 'hi',
                selectedPoints: 8,
                checkedSubItems: ['si1'],
                subItemScores: { si1: 1 },
                comment: 'keep me',
            }),
            entry({ criterionId: 'c3' }),
            entry({ criterionId: 'c2', levelId: 'any', comment: 'old criterion feedback' }),
        ]);
    });

    it('clears a level the new version no longer has and counts it', () => {
        const { entries, clearedCount, removedCount } = remapEntriesToRubric(
            [entry({ levelId: 'removed', selectedPoints: 3, checkedSubItems: ['si1'], comment: 'note' })],
            rubric
        );
        expect(clearedCount).toBe(1);
        expect(removedCount).toBe(0);
        expect(entries[0]).toMatchObject({
            levelId: null,
            selectedPoints: undefined,
            checkedSubItems: [],
            comment: 'note',
        });
    });

    it('clears a manual override when its level is gone so the criterion is not still scored', () => {
        const { entries, clearedCount } = remapEntriesToRubric(
            [entry({ levelId: 'removed', overridePoints: 7, comment: 'note' })],
            rubric
        );
        expect(clearedCount).toBe(1);
        expect(entries[0]).toMatchObject({ levelId: null, overridePoints: undefined, comment: 'note' });
    });

    it('drops a single-point outcome when the destination rubric grades by level', () => {
        const { entries } = remapEntriesToRubric([entry({ levelId: null, singlePointOutcome: 'meets' })], rubric);
        expect(entries[0].singlePointOutcome).toBeUndefined();
    });

    it('keeps a single-point outcome while the destination rubric is still single-point', () => {
        const singlePointRubric: Rubric = { ...rubric, scoringMode: 'single-point' };
        const { entries } = remapEntriesToRubric(
            [entry({ levelId: null, singlePointOutcome: 'exceeds' })],
            singlePointRubric
        );
        expect(entries[0].singlePointOutcome).toBe('exceeds');
    });

    it('leaves ungraded entries and points without a selection alone', () => {
        const ungraded = entry({ comment: 'draft' });
        const unpointed = entry({ criterionId: 'c3', levelId: 'x' });
        const { entries } = remapEntriesToRubric([ungraded, unpointed], rubric);
        expect(entries[0]).toBe(ungraded);
        expect(entries[1]).toMatchObject({ levelId: 'x', selectedPoints: undefined, subItemScores: undefined });
    });
});

describe('calcGradeSummary with a saved grade scale', () => {
    const sr = (gradeScaleSnapshot?: GradeScale): StudentRubric => ({
        id: 's',
        rubricId: 'r',
        studentId: 'st',
        isPeerReview: false,
        overallComment: '',
        entries: [
            entry({ levelId: 'hi', selectedPoints: 6 }),
            entry({ criterionId: 'c3', levelId: 'x', selectedPoints: 2 }),
        ],
        gradeScaleSnapshot,
    });
    const edited: GradeScale = {
        ...scale,
        ranges: [
            { min: 90, max: 100, label: 'Pass', color: '#0f0' },
            { min: 0, max: 89, label: 'Fail', color: '#f00' },
        ],
    };

    it("uses the scale the grade was saved with, not the caller's edited one", () => {
        expect(calcGradeSummary(sr(scale), rubric.criteria, edited, rubric).letterGrade).toBe('Pass');
    });

    it('falls back to the live scale for records saved before snapshots existed', () => {
        expect(calcGradeSummary(sr(), rubric.criteria, edited, rubric).letterGrade).toBe('Fail');
    });
});
