import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { decodeEssayAssignment } from '../../utils/shareCode';
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

// Assigned to Bob individually from GradeStudent's modal — a different teacherKey,
// linked back to the canonical group ('tk1') via sourceTeacherKey, so it should
// surface on this rubric's Builder page as a merged row.
const mockIndividualAssignment: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's2',
    teacherKey: 'tk-individual',
    sourceTeacherKey: 'tk1',
    title: 'My Essay (individual)',
    prompt: 'Individual prompt text',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-03T00:00:00Z',
};

// Alice also has a second, individually-assigned row for the SAME rubric+student —
// the collision case where a naive studentId-only lookup would resolve to the wrong row.
const mockIndividualAssignmentSameStudent: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk-individual-alice',
    sourceTeacherKey: 'tk1',
    title: 'My Essay (individual, Alice)',
    prompt: "Alice's individual prompt",
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-04T00:00:00Z',
};

// A totally unrelated essay that happens to reuse the same rubric, under its own
// teacherKey with no sourceTeacherKey back to 'tk1' — must NOT be merged into tk1's roster.
const mockUnrelatedAssignmentSameRubric: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's2',
    teacherKey: 'tk-unrelated',
    title: 'A Completely Different Essay',
    prompt: 'Unrelated prompt',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-05T00:00:00Z',
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

    describe('essays assigned individually from GradeStudent', () => {
        beforeEach(() => {
            Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
            appOverrides = { essayAssignments: [mockAssignment, mockIndividualAssignment] };
        });

        it('surfaces the row with an "Individual" badge instead of hiding it', async () => {
            const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
            renderWithRouter(<EssayBuilderPage />);
            expect(screen.getByText('Bob')).toBeInTheDocument();
            expect(screen.getByText('essays.individual_assignment_badge')).toBeInTheDocument();
        });

        it('copies a link built from the individual row, not the canonical group', async () => {
            const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
            renderWithRouter(<EssayBuilderPage />);
            const copyButtons = screen.getAllByLabelText('essays.copy_link');
            fireEvent.click(copyButtons[1]); // Bob's row (second, after Alice/mockAssignment)

            const copiedUrl = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
            const code = copiedUrl.split('#/essay/')[1];
            const decoded = decodeEssayAssignment(code);
            expect(decoded?.teacherKey).toBe('tk-individual');
            expect(decoded?.prompt).toBe('Individual prompt text');
            expect(decoded?.studentId).toBe('s2');
        });

        it('skips already-assigned students (canonical or individual) when bulk-assigning the class', async () => {
            const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
            renderWithRouter(<EssayBuilderPage />);
            fireEvent.click(screen.getByText('essays.assign_to_students'));
            fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
            // Confirm inside the now-open modal (its own button shares this same label).
            const confirmButtons = screen.getAllByText('essays.assign_to_students');
            fireEvent.click(confirmButtons[confirmButtons.length - 1]);
            // Both Alice (canonical) and Bob (individual) are already assigned — nothing new to add.
            expect(mockShowToast).toHaveBeenCalledWith('essays.no_new_students', 'info');
        });

        it('resolves each row copy-link correctly when the same student has both a canonical and an individual row', async () => {
            appOverrides = { essayAssignments: [mockAssignment, mockIndividualAssignmentSameStudent] };
            const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
            renderWithRouter(<EssayBuilderPage />);
            const copyButtons = screen.getAllByLabelText('essays.copy_link');
            expect(copyButtons).toHaveLength(2);

            fireEvent.click(copyButtons[0]); // Alice's canonical row
            const firstUrl = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
            const firstDecoded = decodeEssayAssignment(firstUrl.split('#/essay/')[1]);
            expect(firstDecoded?.teacherKey).toBe('tk1');
            expect(firstDecoded?.prompt).toBeUndefined();

            fireEvent.click(copyButtons[1]); // Alice's individual row
            const secondUrl = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
            const secondDecoded = decodeEssayAssignment(secondUrl.split('#/essay/')[1]);
            expect(secondDecoded?.teacherKey).toBe('tk-individual-alice');
            expect(secondDecoded?.prompt).toBe("Alice's individual prompt");
        });

        it('does not merge in an unrelated essay that happens to reuse the same rubric', async () => {
            appOverrides = { essayAssignments: [mockAssignment, mockUnrelatedAssignmentSameRubric] };
            const { default: EssayBuilderPage } = await import('../EssayBuilderPage');
            renderWithRouter(<EssayBuilderPage />);
            // Only Alice (the canonical row) should show — the unrelated essay for Bob,
            // sharing rubricId but with no sourceTeacherKey back to 'tk1', must not appear.
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.queryByText('Bob')).not.toBeInTheDocument();
            expect(screen.queryByText('essays.individual_assignment_badge')).not.toBeInTheDocument();
        });
    });
});
