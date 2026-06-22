import { describe, it, expect } from 'vitest';
import { getModerationQueue, isSecondMarkerEntry } from './coGradingModerationQueue';
import type { Rubric, Student, StudentRubric } from '../types';

const rubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    gradeScaleId: '1',
    format: {} as any,
    attachmentIds: [],
    createdAt: '',
    updatedAt: '',
    totalMaxPoints: 20,
    scoringMode: 'total-points',
    criteria: [
        {
            id: 'c1',
            title: 'Structure',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] },
                { id: 'l2', label: 'Weak', minPoints: 0, maxPoints: 5, description: '', subItems: [] },
            ],
        },
    ],
};

const students: Student[] = [{ id: 'stu1', name: 'Alice', classId: 'c1' } as Student];

function baseline(): StudentRubric {
    return {
        id: 'sr1',
        rubricId: 'r1',
        studentId: 'stu1',
        entries: [{ criterionId: 'c1', levelId: 'l1', comment: '', checkedSubItems: [] }],
        overallComment: '',
        isPeerReview: false,
        gradedBy: 'teacher-a@school.org',
    };
}

function secondMarker(levelId: string): StudentRubric {
    return {
        id: 'sr2',
        rubricId: 'r1',
        studentId: 'stu1',
        entries: [{ criterionId: 'c1', levelId, comment: '', checkedSubItems: [] }],
        overallComment: '',
        isPeerReview: true,
        gradedBy: 'teacher-b@school.org',
    };
}

describe('isSecondMarkerEntry', () => {
    it('treats a peer review as a co-grade when gradedBy is not a known student id', () => {
        expect(isSecondMarkerEntry(secondMarker('l1'), students)).toBe(true);
    });

    it('treats a peer review as a student peer review when gradedBy matches a student id', () => {
        const studentPeerReview: StudentRubric = { ...secondMarker('l1'), gradedBy: 'stu1' };
        expect(isSecondMarkerEntry(studentPeerReview, students)).toBe(false);
    });
});

describe('getModerationQueue', () => {
    it('flags a student when the two markers disagree above the threshold', () => {
        const queue = getModerationQueue([rubric], [baseline()], [secondMarker('l2')], students, 1);
        expect(queue).toHaveLength(1);
        expect(queue[0].studentId).toBe('stu1');
        expect(queue[0].secondMarkerId).toBe('teacher-b@school.org');
        expect(queue[0].totalAbsDelta).toBeGreaterThanOrEqual(1);
    });

    it('does not flag agreeing markers', () => {
        const queue = getModerationQueue([rubric], [baseline()], [secondMarker('l1')], students, 1);
        expect(queue).toHaveLength(0);
    });

    it('ignores real student peer reviews', () => {
        const studentPeerReview = { ...secondMarker('l2'), gradedBy: 'stu1' };
        const queue = getModerationQueue([rubric], [baseline()], [studentPeerReview], students, 1);
        expect(queue).toHaveLength(0);
    });
});
