import { describe, expect, it } from 'vitest';
import {
    carryTeacherAuthoredTestFields,
    TEACHER_AUTHORED_TEST_FIELDS,
} from '../../supabase/functions/_shared/teacherAuthoredTestFields';

describe('carryTeacherAuthoredTestFields', () => {
    it('keeps the teacher fields a rebuilt submission does not know about', () => {
        const built = { id: 'st1', answers: [], status: 'submitted' };
        const prior = {
            id: 'st1',
            answers: [{ questionId: 'q1', response: 'x' }],
            status: 'graded',
            reviewFlags: ['q1'],
            adjustmentPoints: 2,
            adjustment: { points: 2, appliedAt: '2026-01-01T00:00:00.000Z' },
            lastEditedBy: 'teacher-1',
        };

        const merged = carryTeacherAuthoredTestFields<Record<string, unknown>>(built, prior);

        expect(merged.reviewFlags).toEqual(['q1']);
        expect(merged.adjustmentPoints).toBe(2);
        expect(merged.adjustment).toEqual(prior.adjustment);
        expect(merged.lastEditedBy).toBe('teacher-1');
        // Attempt-owned fields stay with the new submission, not the old one.
        expect(merged.answers).toEqual([]);
        expect(merged.status).toBe('submitted');
    });

    it('leaves a teacher field the new copy already sets alone', () => {
        const merged = carryTeacherAuthoredTestFields({ reviewFlags: ['q2'] }, { reviewFlags: ['q1'] });
        expect(merged.reviewFlags).toEqual(['q2']);
    });

    it('cannot resurrect a flag the teacher cleared, because the cleared copy has none', () => {
        expect(
            carryTeacherAuthoredTestFields<Record<string, unknown>>({}, { reviewFlags: undefined }).reviewFlags
        ).toBeUndefined();
        expect(carryTeacherAuthoredTestFields({}, null)).toEqual({});
        expect(carryTeacherAuthoredTestFields({ id: 'st1' }, undefined)).toEqual({ id: 'st1' });
    });

    it('covers exactly the fields a student hand-in must never erase', () => {
        expect([...TEACHER_AUTHORED_TEST_FIELDS]).toEqual([
            'reviewFlags',
            'adjustment',
            'adjustmentPoints',
            'lastEditedBy',
        ]);
    });
});
