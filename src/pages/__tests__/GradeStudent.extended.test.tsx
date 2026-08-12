import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, EssayAssignment, GradeScale, Rubric, Student } from '../../types';

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
const mockDeleteStudentRubric = vi.fn();
const mockNavigate = vi.fn();

const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent, mockStudentBob];
const mockClassesArr = [mockClass];
const mockGradeScalesArr = [mockGradeScale];

let mockStudentRubricsArr: never[] = [];

const mockAppValue: Record<string, unknown> = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    attachments: [],
    analysisResults: [],
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    saveStudentRubric: mockSaveStudentRubric,
    updateSettings: mockUpdateSettings,
    deleteStudentRubric: mockDeleteStudentRubric,
    saveAnalysisResult: vi.fn(),
    addCommentBankItem: vi.fn(),
    recordCommentBankUsage: vi.fn(),
    addAttachment: vi.fn(),
    saveEssayAssignment: vi.fn().mockResolvedValue({ success: true }),
    essayAssignments: [] as EssayAssignment[],
    addEssayAssignments: vi.fn(),
    essayTemplates: [],
    saveEssayTemplate: vi.fn(),
    fetchEssaySubmissionsForStudent: vi.fn().mockResolvedValue([]),
    deleteEssaySubmission: vi.fn(),
    getEssaySignedUrl: vi.fn(),
    fetchSchoolMembers: vi.fn().mockResolvedValue([]),
    commentBank: [],
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
    useRoster: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

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

const existingSR = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    classId: 'c1',
    isPeerReview: false,
    entries: [{ criterionId: 'c1', levelId: 'l2', comment: '', checkedSubItems: [], selectedPoints: undefined }],
    overallComment: 'Existing comment',
    gradedAt: '2024-01-01T00:00:00Z',
};

describe('GradeStudent extended', () => {
    beforeEach(async () => {
        Element.prototype.scrollIntoView = vi.fn();
        mockSaveStudentRubric.mockClear();
        mockUpdateSettings.mockClear();
        mockDeleteStudentRubric.mockClear();
        mockNavigate.mockClear();
        mockStudentRubricsArr = [];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        mockAppValue.students = mockStudentsArr;
        const mod = await import('../GradeStudent');
        GradeStudentComp = mod.default;
    });

    it('applies a global score modifier and saves it', () => {
        renderPage();
        fireEvent.change(screen.getByRole('combobox', { name: 'gradeStudent.label_modifier' }), {
            target: { value: 'points' },
        });
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
        fireEvent.change(screen.getByPlaceholderText('gradeStudent.modifier_reason_placeholder'), {
            target: { value: 'Late penalty' },
        });
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                globalModifier: { type: 'points', value: 5, reason: 'Late penalty' },
            })
        );
    });

    it('saves and advances with Ctrl+S', () => {
        renderPage();
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(mockSaveStudentRubric).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s2');
    });

    it('closes the shortcuts panel with Escape and navigates criteria with Tab', () => {
        renderPage();
        fireEvent.keyDown(window, { key: '?' });
        expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

        // Tab focuses criterion 0; a number key then picks its level.
        fireEvent.keyDown(window, { key: 'Tab' });
        fireEvent.keyDown(window, { key: '2' });
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([expect.objectContaining({ criterionId: 'c1', levelId: 'l2' })]),
            })
        );
    });

    it('toggles the grade navigation scope from the actions menu', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
        fireEvent.click(screen.getByText('gradeStudent.nav_scope_rubric_classes'));
        expect(mockUpdateSettings).toHaveBeenCalledWith({ gradeNavigationScope: 'current-class' });
    });

    it('marks not-handed-in and navigates back when no next student exists', () => {
        mockAppValue.students = [mockStudent];
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
        fireEvent.click(screen.getByText('gradeStudent.action_not_handed_in'));
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(expect.objectContaining({ notHandedIn: true }));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('deletes an existing grade via the confirm dialog', () => {
        mockStudentRubricsArr = [existingSR] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
        fireEvent.click(screen.getByText('gradeStudent.action_delete_grade'));
        expect(screen.getByText('gradeStudent.delete_grade_message')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.delete'));
        expect(mockDeleteStudentRubric).toHaveBeenCalledWith('sr1', 'student');
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('deletes a group grade with the group scope selected', () => {
        const groupSR = {
            ...existingSR,
            id: 'sr2',
            studentId: 's2',
            groupId: 'g1',
        };
        mockStudentRubricsArr = [{ ...existingSR, groupId: 'g1' }, groupSR] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        // Group banner shows the group member names.
        expect(screen.getByText(/gradeStudent.group_grade_banner/)).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
        fireEvent.click(screen.getByText('gradeStudent.action_delete_grade'));
        expect(screen.getByText(/gradeStudent.delete_grade_group_message/)).toBeInTheDocument();

        // Default scope is 'student'; switch to group.
        fireEvent.click(screen.getByText('gradeStudent.delete_grade_scope_group:{"names":"Bob"}'));
        fireEvent.click(screen.getAllByText('common.delete')[0]);
        expect(mockDeleteStudentRubric).toHaveBeenCalledWith('sr1', 'group');
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('starts a co-grading session from the actions menu', () => {
        mockStudentRubricsArr = [existingSR] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        expect(screen.getByText('coGrading.modal_title')).toBeInTheDocument();

        // Disconnected → free-text colleague input; submit is disabled until named.
        const startBtn = screen.getByText('coGrading.action_start');
        expect(startBtn).toBeDisabled();
        fireEvent.change(screen.getByLabelText('coGrading.colleague_label'), {
            target: { value: 'Ms. Jones' },
        });
        fireEvent.click(startBtn);
        expect(mockNavigate).toHaveBeenCalledWith(
            '/rubrics/r1/peer-review/s1?reviewerId=' + encodeURIComponent('Ms. Jones')
        );
    });
});
