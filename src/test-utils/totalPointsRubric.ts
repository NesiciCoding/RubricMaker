import { DEFAULT_FORMAT } from '../types';
import type { GradeScale, Rubric, StudentRubric } from '../types';

// Two 10-point criteria (raw max 20) scored 5 + 3, with totalMaxPoints capped at 10: weighted
// scoring gives 40% (F), total-points scoring gives 80% (B), so a caller that drops the rubric
// shows a visibly different grade from GradeStudent.
export const TOTAL_POINTS_PERCENT = 80;
export const WEIGHTED_PERCENT = 40;

export const totalPointsScale: GradeScale = {
    id: 'tp-scale',
    name: 'Total points scale',
    type: 'letter',
    ranges: [
        { min: 90, max: 100, label: 'A', color: '#16a34a' },
        { min: 80, max: 89, label: 'B', color: '#2563eb' },
        { min: 0, max: 79, label: 'F', color: '#dc2626' },
    ],
};

function criterion(id: string) {
    return {
        id,
        title: `Criterion ${id}`,
        description: '',
        weight: 50,
        levels: [
            { id: `${id}-hi`, label: 'High', minPoints: 0, maxPoints: 10, description: '', subItems: [] },
            { id: `${id}-lo`, label: 'Low', minPoints: 0, maxPoints: 4, description: '', subItems: [] },
        ],
    };
}

export function makeTotalPointsRubric(overrides: Partial<Rubric> = {}): Rubric {
    return {
        id: 'tp-rubric',
        name: 'Total points rubric',
        subject: 'English',
        description: '',
        criteria: [criterion('c1'), criterion('c2')],
        gradeScaleId: totalPointsScale.id,
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        totalMaxPoints: 10,
        scoringMode: 'total-points',
        ...overrides,
    };
}

export function makeTotalPointsGrade(overrides: Partial<StudentRubric> = {}): StudentRubric {
    return {
        id: 'tp-sr',
        rubricId: 'tp-rubric',
        studentId: 'tp-student',
        entries: [
            { criterionId: 'c1', levelId: 'c1-hi', checkedSubItems: [], comment: '', selectedPoints: 5 },
            { criterionId: 'c2', levelId: 'c2-hi', checkedSubItems: [], comment: '', selectedPoints: 3 },
        ],
        overallComment: '',
        isPeerReview: false,
        gradedAt: '2026-02-01T10:00:00.000Z',
        ...overrides,
    };
}
