import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../../types';
import type { AppSettings, Class, Student, Test as RmTest } from '../../../types';
import { decodeTestAssignment } from '../../../utils/shareCode';

const mockDbStatus = vi.hoisted(() => ({ isConnected: false }));

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockClass2: Class = { id: 'c2', name: 'Class B' };
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

const classAStudents = mockStudents.filter((s) => s.classId === 'c1');

const mockSaveTestAssignment = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        students: mockStudents,
        classes: [mockClass, mockClass2],
        settings: mockSettings,
        saveTestAssignment: mockSaveTestAssignment,
    }),
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

describe('TestAssignmentModal', () => {
    beforeEach(() => {
        mockDbStatus.isConnected = false;
        mockSaveTestAssignment.mockClear();
    });

    it('generates per-student share links that decode back to a valid TestAssignmentPayload with distinct teacherKeys', async () => {
        const { default: TestAssignmentModal } = await import('../TestAssignmentModal');
        renderWithRouter(<TestAssignmentModal test={mockTest} onClose={vi.fn()} />);

        const teacherKeys = new Set<string>();
        for (const student of classAStudents) {
            const input = screen.getByLabelText(
                `tests.assignment_link_for:{"name":"${student.name}"}`
            ) as HTMLInputElement;
            const url = input.value;
            expect(url).toContain('#/test/');

            const code = url.split('#/test/')[1];
            const decoded = decodeTestAssignment(code);

            expect(decoded).not.toBeNull();
            expect(decoded?.testId).toBe('t1');
            expect(decoded?.studentId).toBe(student.id);
            expect(decoded?.teacherKey).toBeTruthy();
            expect(decoded?.requireSEB).toBe(true);
            expect(decoded?.durationMinutes).toBe(30);
            teacherKeys.add(decoded!.teacherKey);
        }
        // Each student's row must have its own id — a shared key would let one DB row
        // (test_assignments is 1:1 per teacherKey) silently overwrite another's assignment.
        expect(teacherKeys.size).toBe(classAStudents.length);
    });

    it('saves one test_assignments row per student when DB embedding is enabled', async () => {
        mockDbStatus.isConnected = true;
        const { default: TestAssignmentModal } = await import('../TestAssignmentModal');
        renderWithRouter(<TestAssignmentModal test={mockTest} onClose={vi.fn()} />);

        await waitFor(() => expect(mockSaveTestAssignment).toHaveBeenCalledTimes(classAStudents.length));

        const savedStudentIds = mockSaveTestAssignment.mock.calls.map(([a]) => a.studentId).sort();
        expect(savedStudentIds).toEqual(classAStudents.map((s) => s.id).sort());
        const savedKeys = new Set(mockSaveTestAssignment.mock.calls.map(([a]) => a.teacherKey));
        expect(savedKeys.size).toBe(classAStudents.length);
    });

    it('keeps a stable teacherKey per student when the class dropdown is switched back and forth', async () => {
        mockDbStatus.isConnected = true;
        const { default: TestAssignmentModal } = await import('../TestAssignmentModal');
        renderWithRouter(<TestAssignmentModal test={mockTest} onClose={vi.fn()} />);

        await waitFor(() => expect(mockSaveTestAssignment).toHaveBeenCalledTimes(classAStudents.length));
        const firstVisitKey = mockSaveTestAssignment.mock.calls.find(([a]) => a.studentId === 's1')?.[0]?.teacherKey;
        expect(firstVisitKey).toBeTruthy();

        const classSelect = screen.getByLabelText('tests.assignment_class_label');
        fireEvent.change(classSelect, { target: { value: 'c2' } });
        await waitFor(() => expect(mockSaveTestAssignment).toHaveBeenCalledTimes(mockStudents.length));

        fireEvent.change(classSelect, { target: { value: 'c1' } });
        await waitFor(() => expect(screen.getByLabelText('tests.assignment_class_label')).toHaveValue('c1'));

        // Revisiting class A must not re-save its students (they're already persisted),
        // and the link shown must still point at the exact row that was saved the first
        // time — in DB mode the share code IS the bare teacherKey (see shareCode.ts).
        expect(mockSaveTestAssignment).toHaveBeenCalledTimes(mockStudents.length);
        const input = screen.getByLabelText('tests.assignment_link_for:{"name":"Alice"}') as HTMLInputElement;
        const code = input.value.split('#/test/')[1];
        expect(code).toBe(firstVisitKey);
    });
});
