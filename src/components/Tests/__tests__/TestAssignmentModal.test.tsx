import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithRouter } from '../../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../../types';
import type { AppSettings, Class, Student, Test as RmTest } from '../../../types';
import { decodeTestAssignment } from '../../../utils/testShareCode';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudents: Student[] = [
    { id: 's1', name: 'Alice', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
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

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        students: mockStudents,
        classes: [mockClass],
        settings: mockSettings,
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
    useDbStatus: () => ({ isConnected: false, status: 'idle', lastSyncAt: null, userId: null, currentUser: null }),
}));

vi.mock('../../../services/database', () => ({
    loadSupabaseConfig: vi.fn(() => null),
}));

describe('TestAssignmentModal', () => {
    it('generates per-student share links that decode back to a valid TestAssignmentPayload', async () => {
        const { default: TestAssignmentModal } = await import('../TestAssignmentModal');
        renderWithRouter(<TestAssignmentModal test={mockTest} onClose={vi.fn()} />);

        for (const student of mockStudents) {
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
        }
    });
});
