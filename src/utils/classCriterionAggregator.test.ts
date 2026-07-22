import { describe, it, expect } from 'vitest';
import { aggregateClassCriterionAverages } from './classCriterionAggregator';
import type { Rubric, RubricCriterion, Student, StudentRubric } from '../types';

// ─── Builders ─────────────────────────────────────────────────────────────────

function mkCriterion(id: string, title = `Criterion ${id}`): RubricCriterion {
    return {
        id,
        title,
        description: '',
        weight: 100,
        levels: [
            { id: `${id}-lo`, label: 'Low', minPoints: 0, maxPoints: 0, description: '', subItems: [] },
            { id: `${id}-hi`, label: 'High', minPoints: 4, maxPoints: 4, description: '', subItems: [] },
        ],
    };
}

function mkRubric(id: string, criteria: RubricCriterion[], cefrSkill?: Rubric['cefrSkill']): Rubric {
    return {
        id,
        name: `Rubric ${id}`,
        subject: '',
        description: '',
        gradeScaleId: 'none',
        format: {} as never,
        attachmentIds: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        totalMaxPoints: 0,
        scoringMode: 'weighted-percentage',
        criteria,
        cefrSkill,
    };
}

function mkStudent(id: string, classId: string): Student {
    return { id, name: `Student ${id}`, classId };
}

function mkSR(
    id: string,
    rubricId: string,
    studentId: string,
    opts: {
        gradedAt?: string;
        /** Explicit opt-out of the default gradedAt, since a plain `undefined` default value is indistinguishable from "not passed" via destructuring. */
        ungraded?: boolean;
        notHandedIn?: boolean;
        levelId?: string;
        criterionId?: string;
    } = {}
): StudentRubric {
    const { gradedAt, ungraded, notHandedIn, levelId, criterionId } = opts;
    return {
        id,
        rubricId,
        studentId,
        entries: criterionId ? [{ criterionId, levelId: levelId ?? null, checkedSubItems: [], comment: '' }] : [],
        overallComment: '',
        isPeerReview: false,
        gradedAt: ungraded ? undefined : (gradedAt ?? '2024-01-01T00:00:00Z'),
        notHandedIn,
    };
}

// ─── aggregateClassCriterionAverages ──────────────────────────────────────────

describe('aggregateClassCriterionAverages', () => {
    it('returns null rubric and empty bars when there is no eligible grading', () => {
        const result = aggregateClassCriterionAverages([], [], [], undefined);
        expect(result).toEqual({ rubric: null, bars: [] });
    });

    it('ignores rubrics whose cefrSkill is not "writing", even if more recently graded', () => {
        const writingCriterion = mkCriterion('c1');
        const writingRubric = mkRubric('writing-rubric', [writingCriterion], 'writing');
        const readingRubric = mkRubric('reading-rubric', [mkCriterion('c2')], 'reading');
        const student = mkStudent('s1', 'class-a');

        const srs = [
            mkSR('sr1', writingRubric.id, student.id, {
                gradedAt: '2024-01-01T00:00:00Z',
                criterionId: 'c1',
                levelId: 'c1-hi',
            }),
            // Graded later, but not a writing rubric — must not be selected.
            mkSR('sr2', readingRubric.id, student.id, { gradedAt: '2024-06-01T00:00:00Z' }),
        ];

        const result = aggregateClassCriterionAverages(srs, [writingRubric, readingRubric], [student], undefined);

        expect(result.rubric?.id).toBe('writing-rubric');
    });

    it('excludes ungraded and not-handed-in submissions', () => {
        const rubric = mkRubric('r1', [mkCriterion('c1')], 'writing');
        const student = mkStudent('s1', 'class-a');
        const srs = [
            mkSR('sr-ungraded', rubric.id, student.id, { ungraded: true, criterionId: 'c1', levelId: 'c1-hi' }),
            mkSR('sr-nhi', rubric.id, student.id, { notHandedIn: true, criterionId: 'c1', levelId: 'c1-hi' }),
        ];

        const result = aggregateClassCriterionAverages(srs, [rubric], [student], undefined);

        expect(result.rubric).toBeNull();
        expect(result.bars).toEqual([]);
    });

    it('scopes to the active class when one is set', () => {
        const rubric = mkRubric('r1', [mkCriterion('c1')], 'writing');
        const studentInClass = mkStudent('s1', 'class-a');
        const studentOutsideClass = mkStudent('s2', 'class-b');
        const srs = [
            mkSR('sr1', rubric.id, studentInClass.id, { criterionId: 'c1', levelId: 'c1-hi' }),
            mkSR('sr2', rubric.id, studentOutsideClass.id, { criterionId: 'c1', levelId: 'c1-lo' }),
        ];

        const result = aggregateClassCriterionAverages(srs, [rubric], [studentInClass, studentOutsideClass], 'class-a');

        // Only class-a's full-marks entry should count — average should be 100%, not diluted by class-b.
        expect(result.bars).toEqual([{ name: 'Criterion c1', pct: 100 }]);
    });

    it('computes the correct per-criterion percentage average across included gradings', () => {
        const rubric = mkRubric('r1', [mkCriterion('c1')], 'writing');
        const s1 = mkStudent('s1', 'class-a');
        const s2 = mkStudent('s2', 'class-a');
        const srs = [
            mkSR('sr1', rubric.id, s1.id, { criterionId: 'c1', levelId: 'c1-hi' }), // 4/4 = 100%
            mkSR('sr2', rubric.id, s2.id, { criterionId: 'c1', levelId: 'c1-lo' }), // 0/4 = 0%
        ];

        const result = aggregateClassCriterionAverages(srs, [rubric], [s1, s2], undefined);

        expect(result.rubric?.id).toBe('r1');
        expect(result.bars).toEqual([{ name: 'Criterion c1', pct: 50 }]);
    });
});
