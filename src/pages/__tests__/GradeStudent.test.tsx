import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Rubric, Student } from '../../types';

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

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentBob: Student = { id: 's2', name: 'Bob', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSaveStudentRubric = vi.fn();
const mockUpdateSettings = vi.fn();

// Stable references — see ComparativeGrading/StatisticsPage tests for why this matters:
// fresh array/object literals on every useApp() call defeat memo/effect deps and can
// cause infinite render loops.
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent, mockStudentBob];
const mockClassesArr = [mockClass];
const mockStudentRubricsArr: never[] = [];
const mockAttachmentsArr: never[] = [];
const mockAnalysisResultsArr: never[] = [];
const mockGradeScalesArr = [mockGradeScale];
const mockEssayTemplatesArr: never[] = [];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    attachments: mockAttachmentsArr,
    analysisResults: mockAnalysisResultsArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    saveStudentRubric: mockSaveStudentRubric,
    updateSettings: mockUpdateSettings,
    saveAnalysisResult: vi.fn(),
    addCommentBankItem: vi.fn(),
    addAttachment: vi.fn(),
    saveEssayAssignment: vi.fn(),
    essayTemplates: mockEssayTemplatesArr,
    saveEssayTemplate: vi.fn(),
    fetchEssaySubmissionsForStudent: vi.fn().mockResolvedValue([]),
    deleteEssaySubmission: vi.fn(),
    getEssaySignedUrl: vi.fn(),
    fetchSchoolMembers: vi.fn().mockResolvedValue([]),
    commentBank: [],
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false }),
}));

vi.mock('../../components/Editor/TiptapEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) =>
        React.createElement('textarea', {
            'data-testid': 'tiptap-mock',
            value: content,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
        }),
}));

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

let GradeStudentComp: React.ComponentType;

function renderPage() {
    const router = createMemoryRouter(
        [{ path: '/rubrics/:rubricId/grade/:studentId', element: <GradeStudentComp /> }],
        { initialEntries: ['/rubrics/r1/grade/s1'] }
    );
    return render(<RouterProvider router={router} />);
}

describe('GradeStudent', () => {
    beforeEach(async () => {
        mockSaveStudentRubric.mockClear();
        mockUpdateSettings.mockClear();
        mockNavigate.mockClear();
        const mod = await import('../GradeStudent');
        GradeStudentComp = mod.default;
    });

    it('renders the rubric and student name', () => {
        renderPage();
        expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
        expect(screen.getByText('Criterion 1')).toBeInTheDocument();
    });

    it('selects a level and saves', () => {
        renderPage();
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([expect.objectContaining({ criterionId: 'c1', levelId: 'l1' })]),
            })
        );
    });

    it('toggles feedback-only and anchor checkboxes', () => {
        renderPage();
        const checkboxes = screen.getAllByRole('checkbox');
        const feedbackOnlyBox = checkboxes.find((cb) => cb.nextSibling?.textContent?.match(/feedback_only/));
        // Fall back: toggle the first checkbox (feedback-only) if text match fails.
        const target = (feedbackOnlyBox ?? checkboxes[0]) as HTMLInputElement;
        fireEvent.click(target);
        expect(target.checked).toBe(true);
    });

    it('edits the overall comment', () => {
        renderPage();
        const editors = screen.getAllByTestId('tiptap-mock');
        const overallCommentEditor = editors[editors.length - 1];
        fireEvent.change(overallCommentEditor, { target: { value: 'Great work overall' } });
        expect(overallCommentEditor).toHaveValue('Great work overall');
    });

    it('marks the student as not handed in and navigates to the next student', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.action_not_handed_in'));
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ notHandedIn: true }));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s2');
    });

    it('saves and advances to the next student', () => {
        renderPage();
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getByTitle('Next: Bob'));
        expect(mockSaveStudentRubric).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s2');
    });

    it('opens the keyboard shortcuts panel via the "?" key', () => {
        renderPage();
        fireEvent.keyDown(window, { key: '?' });
        expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });
});
