import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
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
    criteria: [],
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

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const mockAddStudent = vi.fn();
const mockDeleteStudent = vi.fn();
const mockAddClass = vi.fn();
const mockUpdateClass = vi.fn();
const mockDeleteClass = vi.fn();
const mockMergeClasses = vi.fn();
const mockUpdateSettings = vi.fn();
const mockNavigate = vi.fn();

// Stable refs to avoid infinite render loops via useMemo/useEffect deps.
const mockClassesArr = [mockClass];
const mockStudentsArr = [mockStudent];
const mockStudentRubricsArr: never[] = [];
const mockRubricsArr = [mockRubric];
const mockGradeScalesArr = [mockGradeScale];

const mockAppValue = {
    classes: mockClassesArr,
    students: mockStudentsArr,
    studentRubrics: mockStudentRubricsArr,
    rubrics: mockRubricsArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    addStudent: mockAddStudent,
    updateStudent: vi.fn(),
    deleteStudent: mockDeleteStudent,
    addClass: mockAddClass,
    updateClass: mockUpdateClass,
    deleteClass: mockDeleteClass,
    mergeClasses: mockMergeClasses,
    updateSettings: mockUpdateSettings,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

vi.mock('react-joyride', () => ({
    Joyride: () => null,
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../components/Students/CsvImportModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'csv-import-modal' },
            React.createElement('button', { onClick: onClose }, 'Close CSV')
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
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

let StudentsPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<StudentsPageComp />);
}

describe('StudentsPage', () => {
    beforeEach(async () => {
        mockAddStudent.mockClear();
        mockDeleteStudent.mockClear();
        mockUpdateClass.mockClear();
        mockNavigate.mockClear();
        const mod = await import('../StudentsPage');
        StudentsPageComp = mod.default;
    });

    it('renders the page title and the active class tab', () => {
        renderPage();
        expect(screen.getByText('studentsPage.title')).toBeInTheDocument();
        // Class A appears in both the tab and the Topbar class selector — use getAllByText.
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
    });

    it('lists a student in the active class', () => {
        renderPage();
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('searches and filters students', () => {
        renderPage();
        const search = screen.getByPlaceholderText('studentsPage.search_students');
        fireEvent.change(search, { target: { value: 'No match' } });
        expect(screen.getByText('studentsPage.no_students_match')).toBeInTheDocument();
    });

    it('navigates to the student profile via the view button', () => {
        renderPage();
        fireEvent.click(screen.getByTitle('studentsPage.view_profile'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1');
    });

    it('opens the add-student modal and adds a student', () => {
        renderPage();
        // Header button (first occurrence) opens the modal.
        fireEvent.click(screen.getAllByText('studentsPage.add_student')[0]);
        const nameInput = screen.getByPlaceholderText('studentsPage.form_name_placeholder');
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        // The modal submit button is the last occurrence of add_student text.
        const addBtns = screen.getAllByText('studentsPage.add_student');
        fireEvent.click(addBtns[addBtns.length - 1]);
        expect(mockAddStudent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bob' }));
    });

    it('deletes a student after confirming', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('studentsPage.action_delete_student'));
        // Inline confirm modal (not useConfirm hook) — no async needed.
        fireEvent.click(screen.getByText('common.delete'));
        expect(mockDeleteStudent).toHaveBeenCalledWith('s1');
    });

    it('opens the link-rubrics modal from the class context menu', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('studentsPage.action_class_menu'));
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        expect(screen.getByText(/Link rubrics to Class A/)).toBeInTheDocument();
    });

    it('adds a new class by pressing Enter in the class name input', () => {
        renderPage();
        const input = screen.getByPlaceholderText('studentsPage.new_class_placeholder');
        fireEvent.change(input, { target: { value: 'Class B' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(mockAddClass).toHaveBeenCalledWith(expect.objectContaining({ name: 'Class B' }));
    });

    it('toggles a rubric checkbox in the link-rubrics modal', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('studentsPage.action_class_menu'));
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        // The rubric appears as a checkbox
        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);
        expect(mockUpdateClass).toHaveBeenCalled();
    });

    it('closes the link-rubrics modal with Done button', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('studentsPage.action_class_menu'));
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        fireEvent.click(screen.getByText('Done'));
        expect(screen.queryByText(/Link rubrics to Class A/)).not.toBeInTheDocument();
    });

    it('clears all rubric links via Clear all button', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('studentsPage.action_class_menu'));
        fireEvent.click(screen.getByText('studentsPage.link_rubrics'));
        fireEvent.click(screen.getByText('Clear all'));
        expect(mockUpdateClass).toHaveBeenCalledWith(expect.objectContaining({ rubricIds: [] }));
    });
});
