import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student } from '../../types';

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

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockAddRubric = vi.fn(() => ({ ...mockRubric, id: 'new-r' }));
const mockUpdateRubric = vi.fn();
const mockDeleteRubric = vi.fn();
const mockCreateGroupStudentRubrics = vi.fn(() => [{ studentId: 's1' }]);
const mockNavigate = vi.fn();

// Stable refs to avoid infinite render loops via useMemo/useEffect deps.
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudent];
const mockClassesArr = [mockClass];
const mockStudentRubricsArr: never[] = [];

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
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false }),
}));

vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchSharedRubrics: vi.fn().mockResolvedValue([]),
            fetchSchoolSharedRubrics: vi.fn().mockResolvedValue([]),
            fetchRubricShares: vi.fn().mockResolvedValue([]),
            shareRubricWithEmail: vi.fn(),
            unshareRubric: vi.fn(),
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
    default: ({ onClose, onImport }: { onClose: () => void; onImport: (r: unknown) => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'import-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Import'),
            React.createElement(
                'button',
                {
                    onClick: () =>
                        onImport({
                            name: 'Imported',
                            subject: 'Math',
                            description: '',
                            criteria: [],
                        }),
                },
                'Do Import'
            )
        ),
}));

vi.mock('../../components/CohortFilter', () => ({
    default: () => React.createElement('div', { 'data-testid': 'cohort-filter' }),
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

describe('RubricList', () => {
    beforeEach(async () => {
        mockAddRubric.mockClear();
        mockUpdateRubric.mockClear();
        mockDeleteRubric.mockClear();
        mockNavigate.mockClear();
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
        const mod = await import('../RubricList');
        RubricListComp = mod.default;
    });

    it('shows the empty state when there are no rubrics', async () => {
        // Temporarily override rubrics to empty for this test
        const orig = mockAppValue.rubrics;
        (mockAppValue as Record<string, unknown>).rubrics = [];
        renderPage();
        expect(screen.getByText('rubricList.no_rubrics')).toBeInTheDocument();
        (mockAppValue as Record<string, unknown>).rubrics = orig;
    });

    it('renders a rubric card', () => {
        renderPage();
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        // Subject appears in both the card and the subject filter select — use getAllByText.
        expect(screen.getAllByText('English').length).toBeGreaterThan(0);
    });

    it('filters rubrics by search text', () => {
        renderPage();
        const search = screen.getByPlaceholderText('rubricList.search_rubrics');
        fireEvent.change(search, { target: { value: 'No match' } });
        expect(screen.getByText('rubricList.no_rubrics')).toBeInTheDocument();
    });

    it('navigates to create a new rubric', () => {
        renderPage();
        fireEvent.click(screen.getByText('rubricList.new_rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new');
    });

    it('navigates to edit a rubric via the edit button', () => {
        renderPage();
        fireEvent.click(screen.getByTitle('rubricList.action_edit'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1');
    });

    it('duplicates a rubric', () => {
        renderPage();
        fireEvent.click(screen.getByTitle('rubricList.action_duplicate'));
        expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ name: 'Essay Rubric (Copy)' }));
    });

    it('deletes a rubric after confirming', async () => {
        renderPage();
        await act(async () => {
            fireEvent.click(screen.getByTitle('rubricList.action_delete'));
        });
        const confirmBtn = screen.getByText('common.delete');
        await act(async () => {
            fireEvent.click(confirmBtn);
        });
        expect(mockDeleteRubric).toHaveBeenCalledWith('r1');
    });

    it('copies the share code to clipboard', async () => {
        renderPage();
        fireEvent.click(screen.getByTitle('Copy share code (for other teachers)'));
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('copies the preview link to clipboard', () => {
        renderPage();
        fireEvent.click(screen.getByTitle('Share preview with students (copy link)'));
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('opens and closes the import modal', () => {
        renderPage();
        fireEvent.click(screen.getByText('rubricList.import_rubric'));
        expect(screen.getByTestId('import-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Import'));
        expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
    });

    it('imports a rubric and navigates to the builder', () => {
        renderPage();
        fireEvent.click(screen.getByText('rubricList.import_rubric'));
        fireEvent.click(screen.getByText('Do Import'));
        expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ name: 'Imported' }));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new-r');
    });

    it('opens the code import modal and closes it', () => {
        renderPage();
        fireEvent.click(screen.getByText('Import from code'));
        expect(screen.getByPlaceholderText('Paste share code here…')).toBeInTheDocument();
        // Close via aria-label — the code import close button is the only one rendered here.
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByPlaceholderText('Paste share code here…')).not.toBeInTheDocument();
    });

    it('opens the differentiate modal and closes it', () => {
        renderPage();
        fireEvent.click(screen.getByTitle('voTrack.differentiate_title'));
        expect(screen.getByText('voTrack.differentiate_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('voTrack.differentiate_action')).not.toBeInTheDocument();
    });

    it('opens the group grading modal and shows the student list', () => {
        renderPage();
        fireEvent.click(screen.getByText('rubricList.action_group_grade'));
        expect(screen.getByText('rubricList.group_grade_title')).toBeInTheDocument();
        // The student should appear as a selectable checkbox row (also in Topbar dropdown).
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        // The start button renders (with count=0 before any selection).
        expect(screen.getByText(/rubricList.group_grade_start_btn/)).toBeInTheDocument();
    });
});
