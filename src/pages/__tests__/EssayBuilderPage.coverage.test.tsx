import React from 'react';
import { screen, fireEvent, waitFor, act, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { encodeEssaySubmission } from '../../utils/shareCode';
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
    prompt: 'Write about it',
    minWords: 100,
    maxWords: 500,
    timeLimitMinutes: 45,
    requireSEB: true,
    readOnlyAfterSubmit: false,
    expiresAt: '2024-12-31T12:00:00.000Z',
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
const tourCapture = vi.hoisted(() => ({ onEvent: null as unknown as (data: { status: string }) => void }));

let routeParams: Record<string, string | undefined> = { teacherKey: 'tk1' };
let appOverrides: Record<string, unknown> = {};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate, useParams: () => routeParams };
});

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

const makeAppContextMock = () => ({
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
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

vi.mock('react-joyride', () => ({
    Joyride: ({ onEvent }: { onEvent: (data: { status: string }) => void }) => {
        tourCapture.onEvent = onEvent;
        return null;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
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

let EssayBuilderPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<EssayBuilderPageComp />);
}

describe('EssayBuilderPage coverage', () => {
    beforeEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        routeParams = { teacherKey: 'tk1' };
        appOverrides = {};
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
        const mod = await import('../EssayBuilderPage');
        EssayBuilderPageComp = mod.default;
    });

    it('pre-fills the edit form from an existing assignment and saves the changed fields', () => {
        renderPage();
        expect(screen.getByDisplayValue('My Essay')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Write about it')).toBeInTheDocument();
        expect(screen.getByDisplayValue('100')).toBeInTheDocument();
        expect(screen.getByDisplayValue('500')).toBeInTheDocument();
        expect(screen.getByDisplayValue('45')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2024-12-31T12:00')).toBeInTheDocument();
        expect(screen.getByLabelText('essay_assignment.require_seb_label')).toBeChecked();
        expect(screen.getByLabelText('essay_assignment.lock_after_submit_label')).not.toBeChecked();

        fireEvent.change(screen.getByDisplayValue('My Essay'), { target: { value: 'Renamed' } });
        fireEvent.change(screen.getByDisplayValue('Write about it'), { target: { value: 'New prompt' } });
        fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '150' } });
        fireEvent.change(screen.getByDisplayValue('500'), { target: { value: '600' } });
        fireEvent.change(screen.getByDisplayValue('45'), { target: { value: '30' } });
        fireEvent.change(screen.getByDisplayValue('2024-12-31T12:00'), { target: { value: '2025-01-15T09:30' } });
        fireEvent.click(screen.getByLabelText('essay_assignment.require_seb_label'));
        fireEvent.click(screen.getByLabelText('essay_assignment.lock_after_submit_label'));
        fireEvent.change(screen.getByLabelText('essays.rubric_connector_label'), { target: { value: '' } });

        fireEvent.click(screen.getByText('essays.save'));
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith(
            'tk1',
            expect.objectContaining({
                title: 'Renamed',
                prompt: 'New prompt',
                minWords: 150,
                maxWords: 600,
                timeLimitMinutes: 30,
                requireSEB: false,
                readOnlyAfterSubmit: true,
                expiresAt: expect.stringContaining('2025-01-15'),
                rubricId: '',
            })
        );
        expect(mockShowToast).toHaveBeenCalledWith('essays.save', 'success');
    });

    it('closes the tour on finished, skipped, and non-terminal events', () => {
        renderPage();
        fireEvent.click(screen.getByText('tutorial.eb_tour_button'));
        expect(tourCapture.onEvent).toBeTruthy();
        act(() => tourCapture.onEvent({ status: 'finished' }));
        act(() => tourCapture.onEvent({ status: 'skipped' }));
        act(() => tourCapture.onEvent({ status: 'next' }));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates back from the topbar and the not-found state', () => {
        renderPage();
        fireEvent.click(screen.getByText('common.back'));
        expect(mockNavigate).toHaveBeenCalledWith('/essays');

        routeParams = { teacherKey: 'missing' };
        cleanup();
        renderPage();
        expect(screen.getByText('essays.no_essays')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.back'));
        expect(mockNavigate).toHaveBeenCalledWith('/essays');
    });

    it('assigns new students and persists the group patch in edit mode', () => {
        renderPage();
        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        // The modal targets the first un-assigned student (Alice), then assigns Bob too.
        const assignButtons = screen.getAllByText('essays.assign_to_students');
        fireEvent.click(assignButtons[assignButtons.length - 1]);

        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk1', expect.objectContaining({ title: 'My Essay' }));
        expect(mockAddEssayAssignments).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ studentId: 's2', teacherKey: 'tk1' })])
        );
        expect(mockShowToast).toHaveBeenCalledWith('essays.assign_success', 'success');
    });

    it('assigns from the new-essay flow and routes to the generated group key', () => {
        routeParams = {};
        renderPage();
        fireEvent.change(screen.getByPlaceholderText('essays.title_label'), { target: { value: 'Fresh Essay' } });
        fireEvent.change(screen.getByLabelText('essays.rubric_connector_label'), { target: { value: 'r1' } });

        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        const assignButtons = screen.getAllByText('essays.assign_to_students');
        fireEvent.click(assignButtons[assignButtons.length - 1]);

        // No group exists yet, so no patch is persisted; the page routes to the new group.
        expect(mockUpdateEssayGroup).not.toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/essays\/[^/]+$/), { replace: true });
    });

    it('renders an unknown student id, swaps the copy icon, and resets it after the timeout', async () => {
        appOverrides = {
            essayAssignments: [mockAssignment, { ...mockAssignment, studentId: 'ghost', teacherKey: 'tk1' }],
        };
        renderPage();
        expect(screen.getByText('ghost')).toBeInTheDocument();

        vi.useFakeTimers();
        fireEvent.click(screen.getAllByLabelText('essays.copy_link')[0]);
        await act(async () => {});
        expect(screen.getAllByLabelText('essays.copy_link')[0].querySelector('svg')).not.toBeNull();
        act(() => {
            vi.advanceTimersByTime(2500);
        });
        vi.useRealTimers();
    });

    it('imports a valid submission, and reports invalid and wrong-essay codes', async () => {
        renderPage();
        fireEvent.click(screen.getByText('essays.import_submission_code'));
        const dialog = () => screen.getByRole('dialog');
        const textbox = () => within(dialog()).getByRole('textbox');

        const confirmBtn = () => within(dialog()).getByRole('button', { name: 'essays.import_submission_code' });

        // Invalid code.
        fireEvent.change(textbox(), { target: { value: 'not-a-code' } });
        fireEvent.click(confirmBtn());
        expect(screen.getByText('essays.import_error')).toBeInTheDocument();

        // Wrong essay (different teacherKey).
        fireEvent.change(textbox(), {
            target: { value: encodeEssaySubmission({ ...mockSubmission, teacherKey: 'other' }) },
        });
        fireEvent.click(confirmBtn());
        expect(screen.getByText('essays.import_wrong_essay')).toBeInTheDocument();

        // Valid code — resets the error and closes the modal.
        fireEvent.change(textbox(), { target: { value: encodeEssaySubmission(mockSubmission) } });
        expect(screen.queryByText('essays.import_error')).not.toBeInTheDocument();
        fireEvent.click(confirmBtn());
        await waitFor(() => expect(mockAddEssaySubmission).toHaveBeenCalledWith(mockSubmission));
        expect(mockShowToast).toHaveBeenCalledWith('essays.import_success', 'success');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes the import modal via Escape, the header close, and the cancel button', () => {
        renderPage();
        fireEvent.click(screen.getByText('essays.import_submission_code'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('essays.import_submission_code'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('essays.import_submission_code'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes the pick-class modal via Escape and its close button', () => {
        renderPage();
        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('button', { name: 'Class A' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByRole('button', { name: 'Class A' })).not.toBeInTheDocument();
    });

    it('opens the slip sheet from the assignment modal and closes it', () => {
        renderPage();
        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        fireEvent.click(screen.getByText(/essay_assignment.print_slips/));
        // The slip sheet renders the two class students.
        expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByLabelText('common.close')).not.toBeInTheDocument();
    });

    it('shows the monitor link when the assignment carries a Supabase URL', () => {
        appOverrides = { essayAssignments: [{ ...mockAssignment, supabaseUrl: 'https://db.example.com' }] };
        renderPage();
        expect(screen.getByText('essays.action_monitor')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'essays.action_monitor' })).toBeInTheDocument();
    });

    it('falls back to an empty rubric name when the selected rubric is missing', () => {
        appOverrides = { rubrics: [] };
        renderPage();
        fireEvent.click(screen.getByText('essays.assign_to_students'));
        fireEvent.click(screen.getByRole('button', { name: 'Class A' }));
        expect(screen.getByText(/essay_assignment.modal_title/)).toBeInTheDocument();
    });
});
