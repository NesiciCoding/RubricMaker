import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter } from '../../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../../types';
import type { AppSettings, Class, Student, Test as RmTest } from '../../../types';
import { toLocalDatetimeInput } from '../../../utils/dateInput';

const mockDbStatus = vi.hoisted(() => ({ isConnected: false }));
const { mockWriteText } = vi.hoisted(() => ({ mockWriteText: vi.fn() }));

const baseSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockClassA: Class = { id: 'c1', name: 'Class A' };
const mockClassB: Class = { id: 'c2', name: 'Class B' };
const mockStudents: Student[] = [
    { id: 's1', name: 'Alice', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
    { id: 's3', name: 'Carla', classId: 'c2' },
];

const mockTest: RmTest = {
    id: 't1',
    name: 'Vocabulary Quiz',
    questions: [{ id: 'q1', prompt: 'Q1', type: 'open', points: 1 }],
    requireSEB: true,
    shuffleQuestions: false,
    durationMinutes: 30,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockSaveTestAssignment = vi.fn().mockResolvedValue({ success: true });

// Mutated per test — the module-level mock reads the same object.
const mockState = {
    students: mockStudents,
    classes: [mockClassA, mockClassB],
    settings: { ...baseSettings, activeClassId: 'c1' },
    saveTestAssignment: mockSaveTestAssignment,
};

vi.mock('../../../context/AppContext', () => ({
    useRoster: () => mockState,
    useStudents: () => mockState,
    useClasses: () => mockState,
    useGrading: () => mockState,
    useAuthoring: () => mockState,
    useAssessment: () => mockState,
    useEssays: () => mockState,
    useFlashcards: () => mockState,
    useSettings: () => mockState,
    usePlatform: () => mockState,
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

vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({
        isConnected: mockDbStatus.isConnected,
        status: 'idle',
        lastSyncAt: null,
        userId: null,
        currentUser: null,
    }),
}));

vi.mock('../../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => ({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key' })),
}));

describe('TestAssignmentModal coverage', () => {
    let TestAssignmentModalComp: React.ComponentType<{ test: RmTest; onClose: () => void }>;

    beforeEach(async () => {
        mockDbStatus.isConnected = false;
        mockSaveTestAssignment.mockClear();
        mockSaveTestAssignment.mockResolvedValue({ success: true });
        mockWriteText.mockReset();
        mockWriteText.mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: mockWriteText },
            configurable: true,
        });
        mockState.students = mockStudents;
        mockState.classes = [mockClassA, mockClassB];
        mockState.settings = { ...baseSettings, activeClassId: 'c1' };
        const mod = await import('../TestAssignmentModal');
        TestAssignmentModalComp = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('defaults the class to the first class when no active class is set', () => {
        delete (mockState.settings as Record<string, unknown>).activeClassId;
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        expect(screen.getByLabelText('tests.assignment_class_label')).toHaveValue('c1');
    });

    it('shows the no-classes state when there is no class and no students', () => {
        delete (mockState.settings as Record<string, unknown>).activeClassId;
        mockState.classes = [];
        mockState.students = [];
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        // classId falls back to '' and the class filter passes everything (no students anyway).
        expect(screen.getByText('comparativeGrading.no_classes')).toBeInTheDocument();
    });

    it('shows all students when no class is selected', () => {
        delete (mockState.settings as Record<string, unknown>).activeClassId;
        mockState.classes = [];
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        // classId '' → the class filter passes every student across all classes.
        expect(screen.getByLabelText('tests.assignment_link_for:{"name":"Alice"}')).toBeInTheDocument();
        expect(screen.getByLabelText('tests.assignment_link_for:{"name":"Carla"}')).toBeInTheDocument();
    });

    it('prefills the deadline from the test due date and re-saves on edit', async () => {
        mockDbStatus.isConnected = true;
        const dueTest: RmTest = { ...mockTest, dueDate: '2024-06-15T10:00:00Z' };
        renderWithRouter(<TestAssignmentModalComp test={dueTest} onClose={vi.fn()} />);

        const deadline = screen.getByLabelText(/tests\.assignment_deadline_label/);
        const input = deadline.closest('div')!.querySelector('input') as HTMLInputElement;
        expect(input.value).toBe(toLocalDatetimeInput('2024-06-15T10:00:00Z'));

        // Editing the deadline re-saves each student with the new expiry.
        await waitFor(() => expect(mockSaveTestAssignment).toHaveBeenCalled());
        fireEvent.change(input, { target: { value: '2024-06-20T09:00:00' } });
        await waitFor(() =>
            expect(mockSaveTestAssignment).toHaveBeenLastCalledWith(
                expect.objectContaining({ expiresAt: new Date('2024-06-20T09:00:00').toISOString() })
            )
        );
    });

    it('counts failed saves and shows the partial-error message', async () => {
        mockDbStatus.isConnected = true;
        mockSaveTestAssignment.mockResolvedValue({ success: false });
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        expect(await screen.findByText('tests.assignment_save_partial_error:{"count":2}')).toBeInTheDocument();
    });

    it('copies a single link and reverts after 2.5s', async () => {
        vi.useFakeTimers();
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        fireEvent.click(screen.getAllByText('essay_assignment.copy')[0]);
        await act(async () => {});
        expect(mockWriteText).toHaveBeenCalledTimes(1);
        expect(screen.getAllByText('essay_assignment.copied').length).toBe(1);
        act(() => {
            vi.advanceTimersByTime(2500);
        });
        expect(screen.getAllByText('essay_assignment.copy')).toHaveLength(2);
    });

    it('handles clipboard failures for both copy actions', async () => {
        mockWriteText.mockRejectedValue(new Error('denied'));
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        // Single copy: falls back to the default label.
        fireEvent.click(screen.getAllByText('essay_assignment.copy')[0]);
        await waitFor(() => expect(mockWriteText).toHaveBeenCalledTimes(1));
        expect(screen.getAllByText('essay_assignment.copy').length).toBe(2);
        // Copy all: same fallback.
        fireEvent.click(screen.getByText('tests.copy_all_links:{"count":2}'));
        await waitFor(() => expect(mockWriteText).toHaveBeenCalledTimes(2));
        expect(screen.getByText('tests.copy_all_links:{"count":2}')).toBeInTheDocument();
    });

    it('copies all links and shows the copied state', async () => {
        vi.useFakeTimers();
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        fireEvent.click(screen.getByText('tests.copy_all_links:{"count":2}'));
        await act(async () => {});
        expect(mockWriteText).toHaveBeenCalledTimes(1);
        expect(screen.getByText('essay_assignment.copied')).toBeInTheDocument();
        // The copied text contains each student's name and link.
        const text = mockWriteText.mock.calls[0][0] as string;
        expect(text).toContain('Alice');
        expect(text).toContain('Bob');
        expect(text).toContain('#/test/');
        act(() => {
            vi.advanceTimersByTime(2500);
        });
        expect(screen.getByText('tests.copy_all_links:{"count":2}')).toBeInTheDocument();
    });

    it('unchecks DB embedding to fall back to embedded-test links', async () => {
        mockDbStatus.isConnected = true;
        mockSaveTestAssignment.mockResolvedValue({ success: true });
        renderWithRouter(<TestAssignmentModalComp test={mockTest} onClose={vi.fn()} />);
        await waitFor(() => expect(mockSaveTestAssignment).toHaveBeenCalled());
        expect(screen.getByText('tests.assignment_db_embed_help')).toBeInTheDocument();

        const toggle = screen.getByRole('checkbox');
        fireEvent.click(toggle);
        // DB block collapses; links now embed the full test instead of the supabase config.
        expect(screen.queryByText('tests.assignment_db_embed_help')).not.toBeInTheDocument();
        const input = screen.getByLabelText('tests.assignment_link_for:{"name":"Alice"}') as HTMLInputElement;
        const { decodeTestAssignment } = await import('../../../utils/shareCode');
        const decoded = decodeTestAssignment(input.value.split('#/test/')[1]);
        expect(decoded?.test).toEqual(mockTest);
        expect(decoded?.supabaseUrl).toBeUndefined();
    });
});
