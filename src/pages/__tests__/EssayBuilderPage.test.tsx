import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, EssayAssignment, EssaySubmission, Rubric, Student } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockClasses: Class[] = [{ id: 'c1', name: 'Class A' }];
const mockStudents: Student[] = [
    { id: 's1', name: 'Alice', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
];

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 0,
    scoringMode: 'weighted-percentage',
};

const mockAssignment: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'My Essay',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockSubmission: EssaySubmission = {
    id: 'sub1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'tk1',
    contentHtml: '<p>hi</p>',
    wordCount: 1,
    submittedAt: '2024-01-02T00:00:00Z',
};

const mockNavigate = vi.fn();
const mockShowToast = vi.fn();
const mockUpdateEssayGroup = vi.fn();
const mockAddEssayAssignments = vi.fn();
const mockAddEssaySubmission = vi.fn();

let routeParams: Record<string, string | undefined> = { teacherKey: 'tk1' };
let appOverrides: Record<string, unknown> = {};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate, useParams: () => routeParams };
});

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        essayAssignments: [mockAssignment],
        essaySubmissions: [mockSubmission],
        rubrics: [mockRubric],
        classes: mockClasses,
        students: mockStudents,
        addEssayAssignments: mockAddEssayAssignments,
        updateEssayGroup: mockUpdateEssayGroup,
        addEssaySubmission: mockAddEssaySubmission,
        settings: mockSettings,
        studentRubrics: [],
        ...appOverrides,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('EssayBuilderPage', () => {
    beforeEach(() => {
        routeParams = { teacherKey: 'tk1' };
        appOverrides = {};
        mockNavigate.mockClear();
        mockShowToast.mockClear();
        mockUpdateEssayGroup.mockClear();
        mockAddEssayAssignments.mockClear();
    });

    it('shows the not-found state for an unknown teacherKey', async () => {
        routeParams = { teacherKey: 'missing' };
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        renderWithRouter(<EssayBuilderPage />);
        expect(screen.getByText('essays.no_essays')).toBeInTheDocument();
    });

    it('renders the new-essay form when no teacherKey is present', async () => {
        routeParams = {};
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        renderWithRouter(<EssayBuilderPage />);
        expect(screen.getByText('essays.builder_title_new')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('essays.title_label')).toHaveValue('');
    });

    it('renders the edit form pre-filled and saves', async () => {
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        renderWithRouter(<EssayBuilderPage />);
        expect(screen.getByText('essays.builder_title_edit')).toBeInTheDocument();
        expect(screen.getByDisplayValue('My Essay')).toBeInTheDocument();
        fireEvent.click(screen.getByText('essays.save'));
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk1', expect.objectContaining({ title: 'My Essay' }));
        expect(mockShowToast).toHaveBeenCalled();
    });

    it('opens the assign-to-class modal and assigns new students', async () => {
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        renderWithRouter(<EssayBuilderPage />);
        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        // The assignment modal opens for the first un-assigned class student (Alice).
        expect(screen.getByText('essay_assignment.modal_title:{"name":"Alice"}')).toBeInTheDocument();
    });

    it('opens the import-submission modal', async () => {
        const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
        renderWithRouter(<EssayBuilderPage />);
        fireEvent.click(screen.getByText('essays.import_submission_code'));
        expect(screen.getByText('essays.import_code_label')).toBeInTheDocument();
    });
});
