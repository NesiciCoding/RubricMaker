import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    AppSettings,
    GradeScale,
    LinkedCefrDescriptor,
    Test as RmTest,
    StudentTest,
    Student,
    TestQuestion,
} from '../../types';
import { encodeAudioResponse } from '../../utils/audioResponseCode';

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
        { min: 60, max: 100, label: 'A', color: '#22c55e' },
    ],
};

const std = {
    guid: 'std-1',
    statementNotation: 'L.1',
    description: 'Use language',
    standardSetTitle: 'S',
    jurisdictionTitle: 'J',
};
const cefrDesc: LinkedCefrDescriptor = {
    descriptorId: 'd1',
    level: 'B1',
    skill: 'reading',
    descriptionEn: 'Can read short texts',
    descriptionNl: '',
};

const mcQ: TestQuestion = {
    id: 'q-mc',
    prompt: 'Pick the correct option',
    type: 'multiple-choice',
    points: 4,
    linkedStandards: [std],
    linkedCefrDescriptors: [cefrDesc],
    options: [
        { id: 'a', text: 'Wrong', isCorrect: false },
        { id: 'b', text: 'Right', isCorrect: true },
    ],
};
const mrQ: TestQuestion = {
    id: 'q-mr',
    prompt: 'Pick both',
    type: 'multiple-response',
    points: 4,
    options: [
        { id: 'a', text: 'Alpha', isCorrect: true },
        { id: 'b', text: 'Beta', isCorrect: true },
        { id: 'c', text: 'Gamma', isCorrect: false },
    ],
};
const clozeQ: TestQuestion = {
    id: 'q-cloze',
    prompt: 'The {{quick}} brown fox',
    type: 'cloze',
    points: 2,
};
const dropdownQ: TestQuestion = {
    id: 'q-drop',
    prompt: 'Pick {{one|two}}',
    type: 'cloze-dropdown',
    points: 2,
};
const matchingQ: TestQuestion = {
    id: 'q-match',
    prompt: 'Match them',
    type: 'matching',
    points: 4,
    matchingPairs: [
        { id: 'm1', left: 'A', right: '1' },
        { id: 'm2', left: 'B', right: '2' },
    ],
};
const orderingQ: TestQuestion = {
    id: 'q-order',
    prompt: 'Order the steps',
    type: 'ordering',
    points: 2,
    orderItems: [
        { id: 'o1', text: 'First' },
        { id: 'o2', text: 'Second' },
    ],
};
const categorizeQ: TestQuestion = {
    id: 'q-cat',
    prompt: 'Categorize',
    type: 'categorize',
    points: 3,
    categories: [
        { id: 'cat1', label: 'Animals' },
        { id: 'cat2', label: 'Vehicles' },
    ],
    categorizeItems: [
        { id: 'ci1', text: 'Dog', categoryId: 'cat1' },
        { id: 'ci2', text: 'Car', categoryId: 'cat2' },
    ],
};
const hotTextQ: TestQuestion = {
    id: 'q-hot',
    prompt: 'Select the fragments',
    type: 'hot-text',
    points: 2,
    hotTextPassage: 'The [[quick]] brown [[fox]]',
    hotTextCorrectIndices: [0],
};
const audioQ: TestQuestion = {
    id: 'q-audio',
    prompt: 'Say your name',
    type: 'audio-response',
    points: 2,
};

const mockTest: RmTest = {
    id: 't1',
    name: 'Comprehensive Quiz',
    questions: [mcQ, mrQ, clozeQ, dropdownQ, matchingQ, orderingQ, categorizeQ, hotTextQ, audioQ],
    requireSEB: false,
    shuffleQuestions: false,
    gradeScaleId: 'gs1',
    durationMinutes: 120,
    createdAt: '2026-01-01T00:00:00.000Z',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

function makeStudentTest(overrides: Partial<StudentTest> = {}): StudentTest {
    return {
        id: 'st1',
        testId: 't1',
        studentId: 's1',
        answers: [
            { questionId: 'q-mc', response: 'b' },
            { questionId: 'q-mr', response: JSON.stringify(['a', 'b']) },
            { questionId: 'q-cloze', response: JSON.stringify({ 0: 'quick' }) },
            { questionId: 'q-drop', response: JSON.stringify({ 0: 'one' }) },
            { questionId: 'q-match', response: JSON.stringify({ m1: 'm1', m2: 'm2' }) },
            { questionId: 'q-order', response: JSON.stringify(['o1', 'o2']) },
            { questionId: 'q-cat', response: JSON.stringify({ ci1: 'cat1', ci2: 'cat2' }) },
            { questionId: 'q-hot', response: JSON.stringify([0]) },
            {
                questionId: 'q-audio',
                response: encodeAudioResponse({
                    dataUri: 'data:audio/webm;base64,abc',
                    mimeType: 'audio/webm',
                    durationSec: 5,
                }),
            },
        ],
        status: 'submitted',
        startedAt: '2026-01-01T09:00:00.000Z',
        submittedAt: '2026-01-01T09:30:00.000Z',
        ...overrides,
    };
}

const mockSaveStudentTest = vi.fn();

const mockUseApp: Record<string, unknown> = {
    tests: [mockTest],
    studentTests: [makeStudentTest()],
    students: [mockStudent],
    studentRubrics: [],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    updateSettings: vi.fn(),
    saveStudentTest: mockSaveStudentTest,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockUseApp,
    useRoster: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
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

function renderPage(route = '/tests/t1/results/st1') {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

let TestResultsPage: React.ComponentType;

describe('TestResultsPage extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockUseApp.tests = [mockTest];
        mockUseApp.studentTests = [makeStudentTest()];
        const mod = await import('../TestResultsPage');
        TestResultsPage = mod.default;
    });

    it('renders standards and CEFR rollups with earned points', () => {
        renderPage();
        expect(screen.getByText('tests.results.standards_rollup_title')).toBeInTheDocument();
        expect(screen.getByText('L.1')).toBeInTheDocument();
        // Standards and CEFR rollups both show the same earned/max row
        expect(screen.getAllByText(/4\.00 \/ 4 \(100%\)/).length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('tests.results.cefr_rollup_title')).toBeInTheDocument();
        expect(screen.getByText('Can read short texts')).toBeInTheDocument();
        expect(screen.getByText('B1')).toBeInTheDocument();
    });

    it('shows the time-on-task line with an outlier badge and no-events message when events are absent', () => {
        // 20 minutes against a 120-minute limit (ratio 0.2) is an outlier
        mockUseApp.studentTests = [
            makeStudentTest({
                startedAt: '2026-01-01T09:00:00.000Z',
                submittedAt: '2026-01-01T09:20:00.000Z',
                events: undefined,
            }),
        ];
        renderPage();
        expect(screen.getByText(/tests.results.time_on_task:/)).toBeInTheDocument();
        expect(screen.getByText('tests.results.time_on_task_outlier')).toBeInTheDocument();
        expect(screen.getByText('tests.results.integrity_no_events')).toBeInTheDocument();
    });

    it('renders formatted responses for every question type', () => {
        mockUseApp.studentTests = [makeStudentTest({ events: undefined })];
        const { container } = renderPage();
        expect(screen.getByText('Right')).toBeInTheDocument();
        expect(screen.getByText('Alpha, Beta')).toBeInTheDocument();
        // cloze gap fills, matching pairs, ordering, categorize, hot-text, audio
        expect(screen.getAllByText(/quick/).length).toBeGreaterThan(0);
        expect(screen.getByText('one')).toBeInTheDocument();
        // matching right-side labels (grade 'A' also exists on the page, so use the sides)
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('1. First')).toBeInTheDocument();
        expect(screen.getByText('Dog')).toBeInTheDocument();
        expect(screen.getByText('Animals')).toBeInTheDocument();
        expect(screen.getByText('Car')).toBeInTheDocument();
        expect(screen.getByText('Vehicles')).toBeInTheDocument();
        expect(screen.getByText('fox')).toBeInTheDocument();
        expect(container.querySelector('audio')).not.toBeNull();
    });

    it('shows the no-response message for unanswered questions', () => {
        mockUseApp.studentTests = [makeStudentTest({ answers: [{ questionId: 'q-mc', response: 'b' }] })];
        renderPage();
        expect(screen.getAllByText('tests.results.no_response').length).toBeGreaterThan(0);
    });

    it('shows raw vs adjusted points when an adjustment is applied', () => {
        mockUseApp.studentTests = [makeStudentTest({ adjustmentPoints: 2, events: undefined })];
        renderPage();
        expect(screen.getByText(/tests.results.raw_points/)).toBeInTheDocument();
        expect(screen.getByText(/\+2\.00/)).toBeInTheDocument();
    });

    it('saves feedback alongside the manual score', () => {
        renderPage();
        fireEvent.change(screen.getAllByLabelText('tests.results.feedback_label')[0], {
            target: { value: 'Nice work' },
        });
        fireEvent.click(screen.getAllByText('tests.results.save_score')[0]);

        expect(mockSaveStudentTest).toHaveBeenCalledTimes(1);
        const saved = mockSaveStudentTest.mock.calls[0][0] as StudentTest;
        const mcAnswer = saved.answers.find((a) => a.questionId === 'q-mc');
        expect(mcAnswer?.feedback).toBe('Nice work');
        expect(saved.status).toBe('graded');
    });

    it('renders the staged placement path and scores only presented sections', () => {
        const stagedTest: RmTest = {
            ...mockTest,
            mode: 'placement',
            placementEngine: 'mst',
            sections: [
                {
                    id: 'sec1',
                    title: 'Reading',
                    cefrLevel: 'A2',
                    routing: { thresholdPct: 70, passSectionId: 'sec2', failSectionId: 'sec2' },
                },
                {
                    id: 'sec2',
                    title: 'Writing',
                    cefrLevel: 'B1',
                    routing: { thresholdPct: 70, passSectionId: 'sec1', failSectionId: 'sec1' },
                },
            ],
            questions: mockTest.questions.map((q) => ({ ...q, sectionId: 'sec1' })),
        };
        mockUseApp.tests = [stagedTest];
        mockUseApp.studentTests = [makeStudentTest({ sectionPath: ['sec1'], events: undefined })];
        renderPage();

        expect(screen.getByText('tests.results.placement_path_title')).toBeInTheDocument();
        expect(screen.getAllByText(/placement_path_step/)).toHaveLength(1);
        expect(screen.getByText(/Reading \(A2\)/)).toBeInTheDocument();
    });

    it('renders the staircase path with overridden levels', () => {
        const staircaseTest: RmTest = {
            ...mockTest,
            mode: 'placement',
            placementEngine: 'staircase',
        };
        mockUseApp.tests = [staircaseTest];
        mockUseApp.studentTests = [
            makeStudentTest({
                levelPath: [
                    { sectionId: 'sec1', level: 'A2', questionId: 'q-mc', correct: true },
                    { sectionId: 'sec2', level: 'B1', questionId: 'q-mr', correct: false, overridden: 'up' },
                ],
                events: undefined,
            }),
        ];
        renderPage();

        expect(screen.getByText('tests.results.placement_path_title')).toBeInTheDocument();
        expect(screen.getAllByText(/placement_path_step/)).toHaveLength(2);
        expect(screen.getByText(/placement_overridden_label/)).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('auto-grades short-answer and numeric questions when expectations exist', () => {
        const autoTest: RmTest = {
            ...mockTest,
            questions: [
                { id: 'q-sa', prompt: 'Capital?', type: 'short-answer', points: 2, expectedAnswer: 'Paris' },
                { id: 'q-num', prompt: 'What is 42?', type: 'numeric', points: 3, expectedNumericValue: 42 },
            ],
        };
        mockUseApp.tests = [autoTest];
        mockUseApp.studentTests = [
            makeStudentTest({
                answers: [
                    { questionId: 'q-sa', response: 'Paris' },
                    { questionId: 'q-num', response: '42' },
                ],
                events: undefined,
            }),
        ];
        renderPage();
        expect(screen.getAllByText(/tests.results.auto_scored/).length).toBe(2);
        expect(screen.getAllByLabelText('tests.results.manual_points_label')).toHaveLength(2);
    });
});
