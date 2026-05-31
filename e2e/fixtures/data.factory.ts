import type { Rubric, Student, Class, StudentRubric, ScoreEntry, AppSettings } from '../../src/types';
import { DEFAULT_FORMAT } from '../../src/types';

let idCounter = 0;
const uid = () => `test-${++idCounter}-${Math.random().toString(36).slice(2, 8)}`;

export function buildClass(overrides: Partial<Class> = {}): Class {
    return {
        id: uid(),
        name: 'Class 4A',
        ...overrides,
    };
}

export function buildRubric(overrides: Partial<Rubric> = {}): Rubric {
    const criterionId = uid();
    const levels = [
        { id: uid(), label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Outstanding work', subItems: [] },
        { id: uid(), label: 'Good', minPoints: 3, maxPoints: 3, description: 'Solid work', subItems: [] },
        { id: uid(), label: 'Adequate', minPoints: 2, maxPoints: 2, description: 'Acceptable work', subItems: [] },
        { id: uid(), label: 'Poor', minPoints: 1, maxPoints: 1, description: 'Needs improvement', subItems: [] },
    ];
    return {
        id: uid(),
        name: 'Test Rubric',
        subject: 'English',
        description: '',
        criteria: [
            {
                id: criterionId,
                title: 'Writing Quality',
                description: '',
                weight: 100,
                levels,
            },
        ],
        gradeScaleId: 'letter-10',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalMaxPoints: 4,
        scoringMode: 'weighted-percentage',
        ...overrides,
    };
}

export function buildStudent(classId: string, overrides: Partial<Student> = {}): Student {
    return {
        id: uid(),
        name: 'Alice Jansen',
        classId,
        ...overrides,
    };
}

export function buildStudentRubric(
    rubric: Rubric,
    student: Student,
    overrides: Partial<StudentRubric> = {}
): StudentRubric {
    const entries: ScoreEntry[] = rubric.criteria.map((c) => ({
        criterionId: c.id,
        levelId: c.levels[0].id,
        comment: '',
        checkedSubItems: [],
    }));
    return {
        id: uid(),
        rubricId: rubric.id,
        studentId: student.id,
        entries,
        overallComment: '',
        isPeerReview: false,
        gradedAt: new Date().toISOString(),
        ...overrides,
    };
}

export function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
    return {
        defaultGradeScaleId: 'letter-10',
        theme: 'light',
        language: 'en',
        accentColor: '#3b82f6',
        defaultFormat: DEFAULT_FORMAT,
        hasSeenTutorial: true,
        needsOnboarding: false,
        userRole: 'admin',
        ...overrides,
    };
}
