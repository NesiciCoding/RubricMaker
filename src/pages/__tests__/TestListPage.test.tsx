import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Student, Test as RmTest } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockTest: RmTest = {
    id: 't1',
    name: 'Vocabulary Quiz',
    description: 'A short quiz',
    questions: [
        {
            id: 'q1',
            prompt: 'What is 2+2?',
            type: 'multiple-choice',
            points: 2,
            options: [
                { id: 'o1', text: '3', isCorrect: false },
                { id: 'o2', text: '4', isCorrect: true },
            ],
        },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockAddTest = vi.fn((t: Omit<RmTest, 'id' | 'createdAt' | 'updatedAt'>) => ({
    ...t,
    id: 'new-test',
    createdAt: '2024-01-02T00:00:00Z',
}));
const mockDeleteTest = vi.fn();
const mockUpdateTest = vi.fn();
const noop = vi.fn();

const mockUseApp = {
    tests: [mockTest],
    students: [mockStudent],
    classes: [mockClass],
    gradeScales: [mockGradeScale],
    studentRubrics: [],
    studentTests: [],
    settings: mockSettings,
    addTest: mockAddTest,
    updateTest: mockUpdateTest,
    deleteTest: mockDeleteTest,
    saveStudentTest: noop,
    updateSettings: noop,
};

vi.mock('../../context/AppContext', () => ({ useApp: () => mockUseApp }));

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

describe('TestListPage', () => {
    beforeEach(() => {
        mockAddTest.mockClear();
        mockDeleteTest.mockClear();
    });

    it('renders the test list with question count and total points', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        expect(screen.getByText('Vocabulary Quiz')).toBeInTheDocument();
        expect(screen.getByText(/tests.question_count/)).toBeInTheDocument();
        expect(screen.getByText(/tests.total_points/)).toBeInTheDocument();
    });

    it('duplicates a test with a new id and copy suffix', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        const duplicateBtn = screen.getByTitle('tests.action_duplicate');
        fireEvent.click(duplicateBtn);

        expect(mockAddTest).toHaveBeenCalledTimes(1);
        const arg = mockAddTest.mock.calls[0][0];
        expect(arg.name).toBe('Vocabulary Quiz tests.copy_suffix');
        expect(arg.questions).toHaveLength(1);
        expect(arg.questions[0].id).not.toBe('q1');
        expect(arg.questions[0].options?.[0].id).not.toBe('o1');
    });

    it('opens the assignment modal when assign is clicked', async () => {
        const { default: TestListPage } = await import('../TestListPage');
        render(
            <MemoryRouter>
                <TestListPage />
            </MemoryRouter>
        );
        const assignBtn = screen.getByTitle('tests.action_assign');
        fireEvent.click(assignBtn);
        expect(screen.getByText(/tests.assignment_modal_title/)).toBeInTheDocument();
    });
});
