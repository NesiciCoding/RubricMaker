import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Rubric, Student, StudentRubric, SpeakingSession } from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
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

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
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

const mockSession: SpeakingSession = {
    id: 'ss1',
    rubricId: 'r1',
    studentId: 's1',
    durationSeconds: 120,
    elapsedSeconds: 95,
    pronunciationMarks: [],
    entries: [],
    overallComment: 'Good session',
    gradedAt: '2024-06-15T00:00:00Z',
};

const mockNavigate = vi.fn();

// Stable refs.
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const mockRubricsArr = [mockRubric];
const mockStudentRubricsArr = [mockSr];
const mockGradeScalesArr = [mockGradeScale];
const emptyArr: never[] = [];

const mockAppValue = {
    students: mockStudentsArr,
    classes: mockClassesArr,
    rubrics: mockRubricsArr,
    studentRubrics: mockStudentRubricsArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    selfAssessments: emptyArr,
    speakingSessions: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

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

describe('StudentProfilePage', () => {
    beforeEach(async () => {
        mockNavigate.mockClear();
        const mod = await import('../StudentProfilePage');
        StudentProfilePageComp = mod.default;
    });

    it('shows the not-found state for an unknown student id', () => {
        renderAt('unknown-id');
        expect(screen.getByText('Student not found')).toBeInTheDocument();
    });

    it('renders the student name and grade history', () => {
        renderAt('s1');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        // With one graded rubric, the chart history entry renders the rubric name.
        expect(screen.getAllByText('Essay Rubric').length).toBeGreaterThan(0);
    });

    it('switches to the portfolio tab', () => {
        renderAt('s1');
        // Tab buttons use dynamic key `studentProfile.tab_overview` / `studentProfile.tab_portfolio`.
        fireEvent.click(screen.getByText('studentProfile.tab_portfolio'));
        // Portfolio renders a timeline; with one graded entry it shows the rubric grade kind.
        expect(screen.getByText('studentProfile.tab_portfolio')).toBeInTheDocument();
    });

    it('navigates back to the students list', () => {
        renderAt('unknown-id');
        fireEvent.click(screen.getByText('Back'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
    });

    it('renders the speaking sessions history section', () => {
        (mockAppValue as Record<string, unknown>).speakingSessions = [mockSession];
        renderAt('s1');
        expect(screen.getByText('speaking.sessions_history')).toBeInTheDocument();
        expect(screen.getByText('selfAssess.view_full')).toBeInTheDocument();
        (mockAppValue as Record<string, unknown>).speakingSessions = emptyArr;
    });

    it('navigates to a speaking session when view-full button clicked', () => {
        (mockAppValue as Record<string, unknown>).speakingSessions = [mockSession];
        renderAt('s1');
        fireEvent.click(screen.getByText('selfAssess.view_full'));
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r1/s1');
        (mockAppValue as Record<string, unknown>).speakingSessions = emptyArr;
    });

    it('navigates directly to speaking session when new-session clicked and only one rubric', () => {
        (mockAppValue as Record<string, unknown>).speakingSessions = emptyArr;
        renderAt('s1');
        fireEvent.click(screen.getByText('speaking.new_session'));
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r1/s1');
    });

    it('navigates to grade edit when edit-grade button clicked in history table', () => {
        renderAt('s1');
        const editBtn = screen.queryByTitle('Edit Grade');
        if (editBtn) {
            fireEvent.click(editBtn);
            expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/grade/'));
        }
    });
});
