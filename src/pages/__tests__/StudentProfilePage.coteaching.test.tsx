import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Rubric, Student, StudentRubric } from '../../types';

// #1062's "Done when": "Statistics and student profiles list and filter by colleague rubrics used
// in co-taught classes." The teacher owns no rubrics at all here — colleagueRubric only ever
// arrives via useSharedMaterials (shared, or used in a co-taught class, migrations 095/096).
const colleagueRubric: Rubric = {
    id: 'colleague-r',
    name: "Ann's Rubric",
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] }],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'colleague-r',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-06-01T00:00:00Z',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const emptyArr: never[] = [];
const mockAppValue = {
    students: [mockStudent],
    classes: [mockClass],
    rubrics: [] as Rubric[],
    studentRubrics: [mockSr],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    selfAssessments: emptyArr,
    speakingSessions: emptyArr,
    standardMasteryTargets: emptyArr,
    tests: emptyArr,
    studentTests: emptyArr,
    flashcardDecks: emptyArr,
    flashcardAssignments: emptyArr,
    flashcardReviews: emptyArr,
    essayAssignments: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: unknown) => unknown) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
}));

vi.mock('../../hooks/useSharedMaterials', () => ({
    useSharedMaterials: (kind: 'rubric' | 'test') => ({
        status: 'ready',
        connected: true,
        items: kind === 'rubric' ? [{ item: colleagueRubric, ownerId: 'ann', ownerName: 'Ann', access: 'view' }] : [],
        folders: [],
        refresh: vi.fn(),
        save: vi.fn(),
    }),
}));

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 300 }),
    };
});

vi.mock('react-joyride', () => ({
    Joyride: () => null,
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../utils/pdfExport', () => ({ exportSinglePdf: vi.fn() }));
vi.mock('../../services/database/AuditLogger', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../components/Statistics/LearningGoalChart', () => ({ default: () => null }));
vi.mock('../../components/Statistics/CefrProgressChart', () => ({ default: () => null }));
vi.mock('../../components/Recordings/RecordingPlayer', () => ({ default: () => null }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let StudentProfilePageComp: React.ComponentType;

function renderAt(studentId: string) {
    const router = createMemoryRouter([{ path: '/students/:id', element: <StudentProfilePageComp /> }], {
        initialEntries: [`/students/${studentId}`],
    });
    return render(<RouterProvider router={router} />);
}

describe('StudentProfilePage — a colleague’s shared/co-taught rubric', () => {
    beforeEach(async () => {
        const mod = await import('../StudentProfilePage');
        StudentProfilePageComp = mod.default;
    });

    it('names the grade history entry with the class owner’s rubric, not just my own', () => {
        renderAt('s1');
        expect(screen.getAllByText("Ann's Rubric").length).toBeGreaterThan(0);
    });
});
