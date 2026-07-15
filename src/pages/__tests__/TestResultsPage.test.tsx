import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Test as RmTest, StudentTest, Student } from '../../types';

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
    ranges: [
        { min: 0, max: 59, label: 'F', color: '#ef4444' },
        { min: 60, max: 79, label: 'C', color: '#f59e0b' },
        { min: 80, max: 100, label: 'A', color: '#22c55e' },
    ],
};

const mockTest: RmTest = {
    id: 't1',
    name: 'Vocabulary Quiz',
    questions: [
        {
            id: 'q-mc',
            prompt: 'Pick the correct option',
            type: 'multiple-choice',
            points: 4,
            options: [
                { id: 'a', text: 'Wrong', isCorrect: false },
                { id: 'b', text: 'Right', isCorrect: true },
            ],
        },
        {
            id: 'q-open',
            prompt: 'Explain your reasoning',
            type: 'open',
            points: 6,
        },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    gradeScaleId: 'gs1',
    createdAt: '2026-01-01T00:00:00.000Z',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockStudentTest: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [
        { questionId: 'q-mc', response: 'b' },
        { questionId: 'q-open', response: 'My reasoning', pointsEarned: 3 },
    ],
    status: 'submitted',
    startedAt: '2026-01-01T09:00:00.000Z',
    submittedAt: '2026-01-01T09:30:00.000Z',
    events: [
        { type: 'tab_switch', at: '2026-01-01T09:05:00.000Z' },
        { type: 'tab_switch', at: '2026-01-01T09:06:00.000Z' },
    ],
};

const mockSaveStudentTest = vi.fn();

const mockUseApp = {
    tests: [mockTest],
    studentTests: [mockStudentTest],
    students: [mockStudent],
    studentRubrics: [],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    updateSettings: vi.fn(),
    saveStudentTest: mockSaveStudentTest,
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

describe('TestResultsPage', () => {
    beforeEach(() => {
        mockSaveStudentTest.mockClear();
    });

    it('renders question results, totals, and grade mapping', async () => {
        const { default: TestResultsPage } = await import('../TestResultsPage');
        render(
            <MemoryRouter initialEntries={['/tests/t1/results/st1']}>
                <Routes>
                    <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Vocabulary Quiz')).toBeInTheDocument();
        expect(screen.getByText('Pick the correct option')).toBeInTheDocument();
        expect(screen.getByText('Explain your reasoning')).toBeInTheDocument();
        // 4 (auto MC) + 3 (manual open) = 7 / 10 = 70% -> grade C
        expect(screen.getByText('7.00 / 10')).toBeInTheDocument();
        expect(screen.getByText('70.0%')).toBeInTheDocument();
        expect(screen.getByText('C')).toBeInTheDocument();
        // session integrity badge for tab switches
        expect(screen.getByText(/tests.results.event_type_tab_switch: 2/)).toBeInTheDocument();
    });

    it('updates pointsEarned via the save helper when a manual score is entered', async () => {
        const { default: TestResultsPage } = await import('../TestResultsPage');
        render(
            <MemoryRouter initialEntries={['/tests/t1/results/st1']}>
                <Routes>
                    <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        const pointsInputs = screen.getAllByLabelText('tests.results.manual_points_label');
        const openPointsInput = pointsInputs[1] as HTMLInputElement;
        fireEvent.change(openPointsInput, { target: { value: '5' } });

        const saveButtons = screen.getAllByText('tests.results.save_score');
        fireEvent.click(saveButtons[1]);

        expect(mockSaveStudentTest).toHaveBeenCalledTimes(1);
        const saved = mockSaveStudentTest.mock.calls[0][0] as StudentTest;
        const openAnswer = saved.answers.find((a) => a.questionId === 'q-open');
        expect(openAnswer?.pointsEarned).toBe(5);
        expect(saved.rawTotalPoints).toBe(9); // 4 (MC) + 5 (open)
    });

    it('shows a late-submission badge when submittedAt is after the test due date', async () => {
        mockUseApp.tests = [{ ...mockTest, dueDate: '2026-01-01T09:15:00.000Z' }];
        const { default: TestResultsPage } = await import('../TestResultsPage');
        render(
            <MemoryRouter initialEntries={['/tests/t1/results/st1']}>
                <Routes>
                    <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('tests.results.late_submission')).toBeInTheDocument();
        mockUseApp.tests = [mockTest];
    });

    it('does not show a late-submission badge when submitted before the due date', async () => {
        mockUseApp.tests = [{ ...mockTest, dueDate: '2026-01-02T00:00:00.000Z' }];
        const { default: TestResultsPage } = await import('../TestResultsPage');
        render(
            <MemoryRouter initialEntries={['/tests/t1/results/st1']}>
                <Routes>
                    <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.queryByText('tests.results.late_submission')).not.toBeInTheDocument();
        mockUseApp.tests = [mockTest];
    });

    it('shows a not-found message for an unknown submission', async () => {
        const { default: TestResultsPage } = await import('../TestResultsPage');
        render(
            <MemoryRouter initialEntries={['/tests/t1/results/missing']}>
                <Routes>
                    <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('tests.results.not_found')).toBeInTheDocument();
    });
});
