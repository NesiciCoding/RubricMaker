import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, EssayAssignment, EssaySubmission, Rubric } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
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
    totalMaxPoints: 0,
    scoringMode: 'weighted-percentage',
};

function makeAssignment(
    id: string,
    teacherKey: string,
    studentId: string,
    opts: Partial<EssayAssignment> = {}
): EssayAssignment {
    return {
        rubricId: 'r1',
        studentId,
        teacherKey,
        title: `Essay ${id}`,
        readOnlyAfterSubmit: true,
        createdAt: '2024-01-01T00:00:00Z',
        ...opts,
    };
}

function makeSubmission(id: string, teacherKey: string, studentId: string): EssaySubmission {
    return {
        id,
        assignmentRubricId: 'r1',
        assignmentStudentId: studentId,
        teacherKey,
        contentHtml: '<p>hi</p>',
        wordCount: 1,
        submittedAt: '2024-01-02T00:00:00Z',
    };
}

const mockNavigate = vi.fn();
const mockDeleteEssayGroup = vi.fn();
const mockUpdateEssayGroup = vi.fn();

const mockApp: Record<string, unknown> = {
    essayAssignments: [],
    essaySubmissions: [],
    rubrics: [mockRubric],
    classes: [],
    students: [],
    settings: mockSettings,
    studentRubrics: [],
    deleteEssayGroup: mockDeleteEssayGroup,
    updateEssayGroup: mockUpdateEssayGroup,
};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockApp,
    useStudents: () => mockApp,
    useClasses: () => mockApp,
    useGrading: () => mockApp,
    useAuthoring: () => mockApp,
    useAssessment: () => mockApp,
    useEssays: () => mockApp,
    useFlashcards: () => mockApp,
    useSettings: () => mockApp,
    usePlatform: () => mockApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (params) return `${key}:${JSON.stringify(params)}`;
            return key;
        },
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false, status: 'idle', lastSyncAt: null, userId: null, currentUser: null }),
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => null),
}));

let capturedOnDragEnd: ((result: unknown) => void) | null = null;
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (r: unknown) => void }) => {
        capturedOnDragEnd = onDragEnd;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

let PageComp: React.ComponentType;

function loadPage() {
    return renderWithRouter(<PageComp />);
}

describe('EssayListPage coverage', () => {
    beforeEach(async () => {
        mockNavigate.mockClear();
        mockDeleteEssayGroup.mockClear();
        mockUpdateEssayGroup.mockClear();
        capturedOnDragEnd = null;
        mockApp.essayAssignments = [];
        mockApp.essaySubmissions = [];
        mockApp.classes = [];
        mockApp.students = [];
        const mod = await import('../EssayListPage');
        PageComp = mod.default;
    });

    it('groups assignments by teacher key and renders the progress bar', () => {
        mockApp.students = [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c1' },
        ];
        mockApp.essayAssignments = [makeAssignment('a1', 'tk1', 's1'), makeAssignment('a2', 'tk1', 's2')];
        mockApp.essaySubmissions = [makeSubmission('sub1', 'tk1', 's1')];
        loadPage();
        // One group with two rows — the title renders once.
        expect(screen.getAllByText('Essay a1').length).toBeGreaterThan(0);
        expect(screen.queryByText('Essay a2')).not.toBeInTheDocument();
        // 1 of 2 submitted → 50% progress.
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
        // Edit icon, primary edit, and monitor link all target the group.
        fireEvent.click(screen.getByLabelText('tests.action_edit'));
        expect(mockNavigate).toHaveBeenLastCalledWith('/essays/tk1');
        fireEvent.click(screen.getByText('tests.action_edit'));
        expect(mockNavigate).toHaveBeenLastCalledWith('/essays/tk1');
        expect(screen.getByRole('link', { name: /essays.action_monitor/ })).toHaveAttribute(
            'href',
            '/essays/tk1/monitor'
        );
        expect(mockNavigate).toHaveBeenCalledTimes(2);
    });

    it('filters groups by cohort year', () => {
        mockApp.classes = [
            { id: 'c1', name: 'Class A', year: 'jaar-1' },
            { id: 'c2', name: 'Class B', year: 'jaar-2' },
        ];
        mockApp.students = [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c2' },
        ];
        mockApp.essayAssignments = [makeAssignment('a1', 'tk1', 's1'), makeAssignment('a2', 'tk2', 's2')];
        loadPage();
        expect(screen.getByText('Essay a1')).toBeInTheDocument();
        expect(screen.getByText('Essay a2')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('statistics.filters.year'), { target: { value: 'jaar-1' } });
        expect(screen.getByText('Essay a1')).toBeInTheDocument();
        expect(screen.queryByText('Essay a2')).not.toBeInTheDocument();
    });

    it('reorders groups via drag, skips unchanged orders, and ignores no-op drags', () => {
        mockApp.essayAssignments = [
            makeAssignment('a1', 'tk1', 's1', { displayOrder: 0 }),
            makeAssignment('a2', 'tk2', 's1', { displayOrder: 1 }),
            makeAssignment('a3', 'tk3', 's1', { displayOrder: 2 }),
        ];
        loadPage();
        expect(capturedOnDragEnd).not.toBeNull();
        // Move index 1 → 2: tk1 keeps order 0 (skip), tk3 gets 1, tk2 gets 2.
        capturedOnDragEnd?.({
            source: { droppableId: 'essay-list', index: 1 },
            destination: { droppableId: 'essay-list', index: 2 },
        });
        expect(mockUpdateEssayGroup).toHaveBeenCalledTimes(2);
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk3', { displayOrder: 1 });
        expect(mockUpdateEssayGroup).toHaveBeenCalledWith('tk2', { displayOrder: 2 });
        expect(mockUpdateEssayGroup).not.toHaveBeenCalledWith('tk1', expect.anything());
        // Same index and missing destination are no-ops.
        mockUpdateEssayGroup.mockClear();
        capturedOnDragEnd?.({
            source: { droppableId: 'essay-list', index: 0 },
            destination: { droppableId: 'essay-list', index: 0 },
        });
        capturedOnDragEnd?.({ source: { droppableId: 'essay-list', index: 0 }, destination: undefined });
        expect(mockUpdateEssayGroup).not.toHaveBeenCalled();
    });

    it('cancels the delete confirm and keeps the group', async () => {
        mockApp.essayAssignments = [makeAssignment('a1', 'tk1', 's1')];
        loadPage();
        fireEvent.click(screen.getByLabelText('tests.action_delete'));
        fireEvent.click(screen.getByText('common.cancel'));
        await waitFor(() => expect(mockDeleteEssayGroup).not.toHaveBeenCalled());
        // Confirm path deletes the group.
        fireEvent.click(screen.getByLabelText('tests.action_delete'));
        fireEvent.click(screen.getByText('common.delete'));
        await waitFor(() => expect(mockDeleteEssayGroup).toHaveBeenCalledWith('tk1'));
    });

    it('navigates to the new essay from the empty-state CTA', () => {
        loadPage();
        expect(screen.getByText('essays.no_essays')).toBeInTheDocument();
        // The empty-state CTA is the second 'new essay' button (after the Topbar action).
        fireEvent.click(screen.getAllByText('essays.new_essay')[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/essays/new');
    });
});
