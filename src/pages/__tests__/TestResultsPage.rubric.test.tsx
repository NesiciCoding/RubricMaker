import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Rubric, Test as RmTest, StudentTest, Student } from '../../types';
import type { StoreData } from '../../store/storage';

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

const baseStudentTest: StudentTest = {
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

const mockUseApp: Record<string, unknown> = {
    rubrics: [] as Rubric[],
    tests: [mockTest],
    studentTests: [baseStudentTest],
    students: [mockStudent],
    studentRubrics: [],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    updateSettings: vi.fn(),
    saveStudentTest: mockSaveStudentTest,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockUseApp,
    useStudents: () => mockUseApp,
    useClasses: () => mockUseApp,
    useGrading: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
}));

vi.mock('../../context/useStore', () => ({
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockUseApp as unknown as StoreData),
    useStoreActions: () => mockUseApp,
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

const rubric = {
    id: 'r1',
    name: 'Email rubric',
    createdAt: '2026-01-01T00:00:00.000Z',
    scoringMode: 'weighted-percentage',
    totalMaxPoints: 0,
    criteria: [
        {
            id: 'c1',
            title: 'Content',
            description: '',
            weight: 100,
            levels: [
                { id: 'lo', label: 'Low', minPoints: 1, maxPoints: 1, description: '', subItems: [] },
                { id: 'hi', label: 'High', minPoints: 4, maxPoints: 4, description: '', subItems: [], cefrLevel: 'B2' },
            ],
        },
    ],
} as unknown as Rubric;

const rubricTest: RmTest = {
    ...mockTest,
    questions: [{ id: 'q-open', prompt: 'Write an email', type: 'open', points: 6, rubricId: 'r1' }],
};

function renderPage(Page: React.ComponentType) {
    render(
        <MemoryRouter initialEntries={['/tests/t1/results/st1']}>
            <Routes>
                <Route path="/tests/:testId/results/:studentTestId" element={<Page />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('TestResultsPage — rubric-scored answers', () => {
    beforeEach(() => {
        mockSaveStudentTest.mockClear();
        mockUseApp.tests = [rubricTest];
        mockUseApp.rubrics = [rubric];
        mockUseApp.studentTests = [
            {
                ...baseStudentTest,
                answers: [{ questionId: 'q-open', response: 'Dear Sam, thanks for the invitation.' }],
            },
        ];
    });

    it('scores per criterion, maps the total onto the question points and stores the entries', async () => {
        const { default: TestResultsPage } = await import('../TestResultsPage');
        renderPage(TestResultsPage);
        expect(screen.queryByLabelText('tests.results.manual_points_label')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /High/ }));
        fireEvent.click(screen.getByText('tests.results.save_score'));

        const saved = mockSaveStudentTest.mock.calls[0][0] as StudentTest;
        const answer = saved.answers[0];
        expect(answer.pointsEarned).toBe(6);
        expect(answer.rubricEntries).toEqual([expect.objectContaining({ criterionId: 'c1', levelId: 'hi' })]);
        expect(answer.rubricSnapshot?.id).toBe('r1');
        expect(saved.rawTotalPoints).toBe(6);
    });

    it('shows the writing insights for a typed answer', async () => {
        const { default: TestResultsPage } = await import('../TestResultsPage');
        renderPage(TestResultsPage);
        expect(screen.getByText('tests.results.insights_title')).toBeInTheDocument();
    });

    it('keeps scoring a graded answer with the snapshot taken at scoring time, not the edited live rubric', async () => {
        mockUseApp.rubrics = [{ ...rubric, name: 'Edited later' }];
        mockUseApp.studentTests = [
            {
                ...baseStudentTest,
                answers: [
                    {
                        questionId: 'q-open',
                        response: 'Dear Sam',
                        pointsEarned: 6,
                        rubricEntries: [{ criterionId: 'c1', levelId: 'hi', checkedSubItems: [], comment: '' }],
                        rubricSnapshot: rubric,
                    },
                ],
            },
        ];
        const { default: TestResultsPage } = await import('../TestResultsPage');
        renderPage(TestResultsPage);
        expect(screen.getByText(/rubric_scoring_title.*Email rubric/)).toBeInTheDocument();
        expect(screen.queryByText(/Edited later/)).toBeNull();
    });

    it('falls back to manual points when the rubric is gone and no snapshot exists', async () => {
        mockUseApp.rubrics = [];
        const { default: TestResultsPage } = await import('../TestResultsPage');
        renderPage(TestResultsPage);
        expect(screen.getByLabelText('tests.results.manual_points_label')).toBeInTheDocument();
    });
});
