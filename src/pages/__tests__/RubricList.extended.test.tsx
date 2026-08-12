import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student, StudentRubric } from '../../types';
import { encodeRubricShareCode } from '../../utils/rubricImport';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'A test rubric',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const mockRubric2: Rubric = {
    ...mockRubric,
    id: 'r2',
    name: 'Math Rubric',
    subject: 'Math',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const mockClass1: Class = { id: 'c1', name: 'Class A', year: 'jaar-2', voTrack: 'havo' };
const mockClass2: Class = { id: 'c2', name: 'Class B' };
const mockStudent1: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c2' };
const mockStudentRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
};

const mockAddRubric = vi.fn(() => ({ ...mockRubric, id: 'new-r' }));
const mockUpdateRubric = vi.fn();
const mockDeleteRubric = vi.fn();
const mockCreateGroupStudentRubrics = vi.fn(() => [{ studentId: 's1' }]);
const mockNavigate = vi.fn();

const mockDbStatus = vi.hoisted(() => ({ isConnected: false }));
const mockFetchRubricShares = vi.fn().mockResolvedValue([]);
const mockShareRubricWithEmail = vi.fn();
const mockUnshareRubric = vi.fn();
const mockFetchSharedRubrics = vi.fn().mockResolvedValue([]);
const mockFetchSchoolSharedRubrics = vi.fn().mockResolvedValue([]);

const mockRubricsArr = [mockRubric, mockRubric2];
const mockStudentsArr = [mockStudent1, mockStudent2];
const mockClassesArr = [mockClass1, mockClass2];
const mockStudentRubricsArr = [mockStudentRubric];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    settings: mockSettings,
    addRubric: mockAddRubric,
    updateRubric: mockUpdateRubric,
    deleteRubric: mockDeleteRubric,
    createGroupStudentRubrics: mockCreateGroupStudentRubrics,
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
    useDbStatus: () => ({ isConnected: mockDbStatus.isConnected }),
}));

vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchRubricShares: (...args: unknown[]) => mockFetchRubricShares(...args),
            shareRubricWithEmail: (...args: unknown[]) => mockShareRubricWithEmail(...args),
            unshareRubric: (...args: unknown[]) => mockUnshareRubric(...args),
            fetchSharedRubrics: (...args: unknown[]) => mockFetchSharedRubrics(...args),
            fetchSchoolSharedRubrics: (...args: unknown[]) => mockFetchSchoolSharedRubrics(...args),
        },
    },
}));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

vi.mock('../../components/Rubric/ImportRubricModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'import-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Import')
        ),
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

let RubricListComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<RubricListComp />);
}

describe('RubricList extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockDbStatus.isConnected = false;
        mockFetchRubricShares.mockResolvedValue([]);
        mockFetchSharedRubrics.mockResolvedValue([]);
        mockFetchSchoolSharedRubrics.mockResolvedValue([]);
        mockAddRubric.mockReturnValue({ ...mockRubric, id: 'new-r' });
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
        const mod = await import('../RubricList');
        RubricListComp = mod.default;
    });

    it('filters by subject', () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('rubricList.all_subjects'), { target: { value: 'Math' } });
        expect(screen.getByText('Math Rubric')).toBeInTheDocument();
        expect(screen.queryByText('Essay Rubric')).not.toBeInTheDocument();
    });

    it('switches to the list view with graded counts and navigates from a row', () => {
        renderPage();
        fireEvent.click(screen.getByText('common.view_list'));
        const table = screen.getByRole('table');
        expect(within(table).getByText('Math Rubric')).toBeInTheDocument();
        // r1 has one graded student (Alice); r2 has none
        const rows = within(table).getAllByRole('row');
        expect(rows[1].textContent).toContain('1');
        fireEvent.click(rows[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1');
    });

    it('filters by cohort year through the real CohortFilter', () => {
        renderPage();
        // Year select comes from the real CohortFilter (jaar-2 on class c1)
        const yearSelect = screen.getByLabelText('statistics.filters.year');
        fireEvent.change(yearSelect, { target: { value: 'jaar-2' } });
        // Only r1 has a graded student in a jaar-2 class
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.queryByText('Math Rubric')).not.toBeInTheDocument();
    });

    it('shows the drag handle only when the list is unfiltered', () => {
        renderPage();
        // One handle per rubric card
        expect(screen.getAllByLabelText('rubricList.drag_to_reorder')).toHaveLength(2);

        fireEvent.change(screen.getByPlaceholderText('rubricList.search_rubrics'), {
            target: { value: 'Essay' },
        });
        expect(screen.queryByLabelText('rubricList.drag_to_reorder')).not.toBeInTheDocument();
    });

    it('imports a rubric from a valid share code and navigates to it', () => {
        renderPage();
        fireEvent.click(screen.getByText('Import from code'));
        fireEvent.change(screen.getByPlaceholderText('Paste share code here…'), {
            target: { value: encodeRubricShareCode(mockRubric) },
        });
        fireEvent.click(screen.getByText('Import rubric'));

        expect(mockAddRubric).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Essay Rubric', subject: 'English', criteria: [] })
        );
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new-r');
    });

    it('shows an error for an invalid share code', () => {
        renderPage();
        fireEvent.click(screen.getByText('Import from code'));
        fireEvent.change(screen.getByPlaceholderText('Paste share code here…'), {
            target: { value: 'not-a-valid-code' },
        });
        fireEvent.click(screen.getByText('Import rubric'));
        expect(screen.getByText('Invalid share code. Make sure you pasted the full code.')).toBeInTheDocument();
        expect(mockAddRubric).not.toHaveBeenCalled();
    });

    it('differentiates a rubric for a different VO track with fresh ids', () => {
        renderPage();
        fireEvent.click(screen.getAllByTitle('voTrack.differentiate_title')[0]);
        expect(screen.getByText('Essay Rubric (HAVO)')).toBeInTheDocument();

        fireEvent.click(screen.getByText('VWO'));
        expect(screen.getByText('Essay Rubric (VWO)')).toBeInTheDocument();

        fireEvent.click(screen.getByText('voTrack.action_create'));
        expect(mockAddRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Essay Rubric (VWO)',
                cefrTargetLevel: expect.any(String),
            })
        );
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new-r');
    });

    it('starts group grading once at least two students are selected', () => {
        // Without an active class the modal lists students from every class
        delete mockSettings.activeClassId;
        renderPage();
        fireEvent.click(screen.getAllByText('rubricList.action_group_grade')[0]);
        const checkboxes = within(screen.getByRole('dialog')).getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);

        fireEvent.click(screen.getByText(/rubricList.group_grade_start_btn/));
        expect(mockCreateGroupStudentRubrics).toHaveBeenCalledWith('r1', ['s1', 's2']);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s1');
    });

    it('launches a speaking session for a selected student', () => {
        renderPage();
        fireEvent.change(screen.getAllByLabelText('rubricList.speaking_select_student')[0], {
            target: { value: 's1' },
        });
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r1/s1');
    });

    describe('Supabase sharing', () => {
        it('lists rubrics shared with me and by the department when connected', async () => {
            mockDbStatus.isConnected = true;
            mockFetchSharedRubrics.mockResolvedValue([{ ...mockRubric2, id: 'shared-1' }]);
            mockFetchSchoolSharedRubrics.mockResolvedValue([{ ...mockRubric2, id: 'dept-1' }]);
            renderPage();

            await waitFor(() => expect(screen.getByText('rubricList.shared_with_me')).toBeInTheDocument());
            expect(screen.getByText('rubricList.shared_with_department')).toBeInTheDocument();
            expect(mockFetchSharedRubrics).toHaveBeenCalled();
            expect(mockFetchSchoolSharedRubrics).toHaveBeenCalled();
        });

        it('shares a rubric with a colleague by email', async () => {
            mockDbStatus.isConnected = true;
            mockShareRubricWithEmail.mockResolvedValue({ success: true });
            renderPage();

            fireEvent.click(screen.getAllByTitle('rubricList.action_share_colleague')[0]);
            await waitFor(() => expect(mockFetchRubricShares).toHaveBeenCalledWith('r1'));

            fireEvent.change(screen.getByPlaceholderText('rubricList.share_email_placeholder'), {
                target: { value: 'colleague@school.nl' },
            });
            fireEvent.click(screen.getByText('rubricList.share_btn'));

            await waitFor(() =>
                expect(mockShareRubricWithEmail).toHaveBeenCalledWith('r1', 'colleague@school.nl', 'read')
            );
            expect(screen.getByText('rubricList.share_success')).toBeInTheDocument();
        });

        it('reports a not-found email and generic errors', async () => {
            mockDbStatus.isConnected = true;
            mockShareRubricWithEmail.mockResolvedValue({ success: false, notFound: true });
            renderPage();

            fireEvent.click(screen.getAllByTitle('rubricList.action_share_colleague')[0]);
            fireEvent.change(screen.getByPlaceholderText('rubricList.share_email_placeholder'), {
                target: { value: 'ghost@school.nl' },
            });
            fireEvent.click(screen.getByText('rubricList.share_btn'));
            await waitFor(() =>
                expect(screen.getByText('rubricList.share_notfound:{"email":"ghost@school.nl"}')).toBeInTheDocument()
            );

            mockShareRubricWithEmail.mockResolvedValue({ success: false, error: 'RLS blocked' });
            fireEvent.click(screen.getByText('rubricList.share_btn'));
            await waitFor(() => expect(screen.getByText('RLS blocked')).toBeInTheDocument());
        });

        it('unshares a rubric and toggles department sharing', async () => {
            mockDbStatus.isConnected = true;
            mockFetchRubricShares.mockResolvedValue([{ userId: 'u1', email: 'x@y.z', mode: 'read' }]);
            renderPage();

            fireEvent.click(screen.getAllByTitle('rubricList.action_share_colleague')[0]);
            await waitFor(() => expect(screen.getByText('x@y.z')).toBeInTheDocument());

            fireEvent.click(screen.getByLabelText('rubricList.action_unshare'));
            expect(mockUnshareRubric).toHaveBeenCalledWith('r1', 'u1');
            await waitFor(() => expect(screen.queryByText('x@y.z')).not.toBeInTheDocument());

            fireEvent.click(screen.getByText('rubricList.share_with_department'));
            expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ sharedWithSchool: true }));
        });
    });
});
