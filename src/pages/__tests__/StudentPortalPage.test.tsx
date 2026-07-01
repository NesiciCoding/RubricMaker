import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    AppSettings,
    Class,
    GradeScale,
    Rubric,
    Student,
    StudentRubric,
    StudentEssayAssignmentSummary,
} from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

// Stable refs.
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const mockGradeScalesArr = [mockGradeScale];
const emptyArr: never[] = [];

const mockFetchMyEssayAssignments = vi.fn().mockResolvedValue([]);

const mockGradedStudentRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Great work' }],
    overallComment: 'Well done!',
    gradedAt: '2024-01-15T10:00:00Z',
    isPeerReview: false,
};

const mockGradedStudentRubric2: StudentRubric = {
    id: 'sr2',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: '2024-02-15T10:00:00Z',
    isPeerReview: false,
    notHandedIn: false,
};

const mockRubricWithCriteria: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Content',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
            ],
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

const mockPeerReview: StudentRubric = {
    id: 'pr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: 'Good effort' }],
    overallComment: 'Nice peer review',
    gradedAt: '2024-01-16T10:00:00Z',
    isPeerReview: true,
};

const mockRubricsWithCriteriaArr = [mockRubricWithCriteria];
const mockGradedStudentRubricsArr = [mockGradedStudentRubric, mockGradedStudentRubric2];
const mockPeerReviewsArr = [mockPeerReview];
const mockSaveRubricSelfAssessment = vi.fn();

const mockAppValue: Record<string, unknown> = {
    students: mockStudentsArr,
    classes: mockClassesArr,
    rubrics: mockRubricsWithCriteriaArr,
    studentRubrics: emptyArr,
    peerReviews: emptyArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    selfAssessments: emptyArr,
    saveRubricSelfAssessment: mockSaveRubricSelfAssessment,
    fetchMyEssayAssignments: mockFetchMyEssayAssignments,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: () => null,
    storageSync: { adapter: {} },
}));

vi.mock('../../utils/shareCode', () => ({
    encodeEssayAssignment: vi.fn(() => 'test-code'),
}));

vi.mock('../../components/Statistics/CefrProgressChart', () => ({ default: () => null }));
vi.mock('../../components/Students/RubricSelfAssessPanel', () => ({ default: () => null }));

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

let StudentPortalPageComp: React.ComponentType;

function renderAt(studentId: string) {
    const router = createMemoryRouter([{ path: '/portal/:studentId', element: <StudentPortalPageComp /> }], {
        initialEntries: [`/portal/${studentId}`],
    });
    return render(<RouterProvider router={router} />);
}

describe('StudentPortalPage', () => {
    beforeEach(async () => {
        mockFetchMyEssayAssignments.mockClear();
        const mod = await import('../StudentPortalPage');
        StudentPortalPageComp = mod.default;
    });

    it('shows the not-found state for an unknown student', () => {
        renderAt('unknown');
        expect(screen.getByText('studentPortal.not_found')).toBeInTheDocument();
    });

    it('renders the portal for a known student', async () => {
        renderAt('s1');
        // Student name and rubric stats appear once the portal loads.
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        // The stat cards for the overview section render translation keys.
        expect(screen.getByText('studentPortal.stat_rubrics')).toBeInTheDocument();
    });

    it('calls fetchMyEssayAssignments on mount', () => {
        renderAt('s1');
        expect(mockFetchMyEssayAssignments).toHaveBeenCalledTimes(1);
    });

    it('renders grade history section when graded studentRubrics exist', () => {
        mockAppValue.studentRubrics = mockGradedStudentRubricsArr;
        renderAt('s1');
        // With 2 graded records history.length > 1, grade chart section renders
        expect(screen.getAllByText('studentPortal.grade_history').length).toBeGreaterThan(0);
        // rubric grades section also renders
        expect(screen.getAllByText('studentPortal.rubric_grades').length).toBeGreaterThan(0);
        // Rubric name appears in the grade list
        expect(screen.getAllByText('Essay Rubric').length).toBeGreaterThan(0);
        // overallComment from first graded record renders
        expect(screen.getByText('Well done!')).toBeInTheDocument();
        mockAppValue.studentRubrics = emptyArr;
    });

    it('renders peer reviews section when peer reviews exist', () => {
        mockAppValue.peerReviews = mockPeerReviewsArr;
        renderAt('s1');
        expect(screen.getByText('Nice peer review')).toBeInTheDocument();
        mockAppValue.peerReviews = emptyArr;
    });

    it('renders copy link button', () => {
        renderAt('s1');
        expect(screen.getByText('studentPortal.copy_link')).toBeInTheDocument();
    });

    it('renders pending essay cards when fetchMyEssayAssignments returns data', async () => {
        const pendingEssay: StudentEssayAssignmentSummary = {
            teacherKey: 'essay-1',
            rubricId: 'r1',
            studentId: 's1',
            title: 'My Essay Title',
            prompt: 'Write something',
            minWords: 100,
            maxWords: 200,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: null,
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([pendingEssay]);
        renderAt('s1');
        expect(await screen.findByText('studentPortal.essays_pending')).toBeInTheDocument();
        expect(screen.getByText('My Essay Title')).toBeInTheDocument();
    });

    it('renders completed essay cards', async () => {
        const completedEssay: StudentEssayAssignmentSummary = {
            teacherKey: 'essay-2',
            rubricId: 'r1',
            studentId: 's1',
            title: 'Completed Essay',
            prompt: null,
            minWords: null,
            maxWords: null,
            timeLimitMinutes: null,
            requireSEB: false,
            readOnlyAfterSubmit: false,
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: null,
            submission: { submittedAt: '2024-01-10T10:00:00Z', wordCount: 250 },
        };
        mockFetchMyEssayAssignments.mockResolvedValueOnce([completedEssay]);
        renderAt('s1');
        expect(await screen.findByText('studentPortal.essays_completed')).toBeInTheDocument();
        expect(screen.getByText('Completed Essay')).toBeInTheDocument();
    });
});
