import { describe, it, expect } from 'vitest';
import type { Rubric, Student, StudentRubric } from '../types';
import { liveStudentRubrics, rubricGradesInScope } from './liveStudentRubrics';

const sr = (id: string, studentId: string, extra: Partial<StudentRubric> = {}): StudentRubric => ({
    id,
    rubricId: 'r1',
    studentId,
    entries: [],
    overallComment: '',
    isPeerReview: false,
    ...extra,
});

const liveStudents: Student[] = [
    { id: 'a', name: 'Anna', classId: 'c1' },
    { id: 'b', name: 'Bob', classId: 'c2' },
];

const grades = [
    sr('1', 'a'),
    sr('2', 'b', { notHandedIn: true }),
    sr('3', 'archived'),
    sr('4', 'a', { deletedAt: '2026-01-01T00:00:00Z' }),
    sr('5', 'a', { rubricId: 'r2' }),
];

describe('liveStudentRubrics', () => {
    it('drops grades of archived (absent) students and soft-deleted grades', () => {
        expect(liveStudentRubrics(grades, liveStudents).map((g) => g.id)).toEqual(['1', '2', '5']);
    });
});

describe('rubricGradesInScope', () => {
    it('excludes archived students from the all-classes scope', () => {
        expect(rubricGradesInScope(grades, 'r1', liveStudents).map((g) => g.id)).toEqual(['1', '2']);
        expect(rubricGradesInScope(grades, 'r1', liveStudents, { classId: 'all' }).map((g) => g.id)).toEqual([
            '1',
            '2',
        ]);
    });

    it('all-classes totals equal the sum of per-class totals', () => {
        const all = rubricGradesInScope(grades, 'r1', liveStudents).length;
        const perClass =
            rubricGradesInScope(grades, 'r1', liveStudents, { classId: 'c1' }).length +
            rubricGradesInScope(grades, 'r1', liveStudents, { classId: 'c2' }).length;
        expect(all).toBe(perClass);
    });

    it('optionally excludes not-handed-in work', () => {
        expect(rubricGradesInScope(grades, 'r1', liveStudents, { excludeNotHandedIn: true }).map((g) => g.id)).toEqual([
            '1',
        ]);
    });
});

describe('one live grade per student and rubric', () => {
    it('keeps only the first record for a duplicated student/rubric pair', () => {
        const dupes = [sr('first', 'a'), sr('second', 'a'), sr('other-rubric', 'a', { rubricId: 'r2' })];
        expect(liveStudentRubrics(dupes, liveStudents).map((g) => g.id)).toEqual(['first', 'other-rubric']);
        expect(rubricGradesInScope(dupes, 'r1', liveStudents).map((g) => g.id)).toEqual(['first']);
    });

    it('skips a soft-deleted duplicate in favour of the live one', () => {
        const dupes = [sr('deleted', 'a', { deletedAt: '2026-01-01T00:00:00Z' }), sr('live', 'a')];
        expect(liveStudentRubrics(dupes, liveStudents).map((g) => g.id)).toEqual(['live']);
    });

    it('drops grades of deleted rubrics when the live rubric list is given', () => {
        const rubrics = [{ id: 'r1' }] as Rubric[];
        expect(liveStudentRubrics(grades, liveStudents, rubrics).map((g) => g.id)).toEqual(['1', '2']);
    });
});
