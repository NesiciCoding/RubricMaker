import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Test as RmTest, StudentTest, Student, TestQuestion } from '../../types';

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

function q(
    partial: Partial<TestQuestion> & { id: string; prompt: string; type: TestQuestion['type']; points: number }
): TestQuestion {
    return partial as TestQuestion;
}

const edgeQuestions: TestQuestion[] = [
    q({
        id: 'e-mr-empty',
        prompt: 'Pick none',
        type: 'multiple-response',
        points: 2,
        options: [{ id: 'a', text: 'A', isCorrect: true }],
    }),
    q({
        id: 'e-mr-bad',
        prompt: 'Bad MR',
        type: 'multiple-response',
        points: 2,
        options: [{ id: 'a', text: 'A', isCorrect: true }],
    }),
    q({ id: 'e-tf', prompt: 'True or false', type: 'true-false', points: 2 }),
    q({ id: 'e-cloze-bad', prompt: 'The {{quick}} fox', type: 'cloze', points: 2 }),
    q({ id: 'e-cloze-plain', prompt: 'Plain text, no gaps', type: 'cloze', points: 2 }),
    q({ id: 'e-cloze-wrong', prompt: 'The {{quick}} fox', type: 'cloze', points: 2 }),
    q({ id: 'e-drop-wrong', prompt: 'Pick {{one|two}}', type: 'cloze-dropdown', points: 2 }),
    q({ id: 'e-match-none', prompt: 'No pairs', type: 'matching', points: 2, matchingPairs: [] }),
    q({
        id: 'e-match-bad',
        prompt: 'Bad match',
        type: 'matching',
        points: 2,
        matchingPairs: [{ id: 'm1', left: 'A', right: '1' }],
    }),
    q({
        id: 'e-match-unknown',
        prompt: 'Unknown pick',
        type: 'matching',
        points: 2,
        matchingPairs: [{ id: 'm1', left: 'A', right: '1' }],
    }),
    q({ id: 'e-order-none', prompt: 'No order', type: 'ordering', points: 2, orderItems: [] }),
    q({
        id: 'e-order-bad',
        prompt: 'Bad order',
        type: 'ordering',
        points: 2,
        orderItems: [{ id: 'o1', text: 'First' }],
    }),
    q({
        id: 'e-order-wrong',
        prompt: 'Wrong order',
        type: 'ordering',
        points: 2,
        orderItems: [
            { id: 'o1', text: 'First' },
            { id: 'o2', text: 'Second' },
        ],
    }),
    q({
        id: 'e-cat-none',
        prompt: 'No cats',
        type: 'categorize',
        points: 2,
        categories: [{ id: 'c1', label: 'G' }],
        categorizeItems: [],
    }),
    q({
        id: 'e-cat-bad',
        prompt: 'Bad cat',
        type: 'categorize',
        points: 2,
        categories: [{ id: 'c1', label: 'G' }],
        categorizeItems: [{ id: 'i1', text: 'X', categoryId: 'c1' }],
    }),
    q({
        id: 'e-cat-unknown',
        prompt: 'Unknown cat',
        type: 'categorize',
        points: 2,
        categories: [{ id: 'c1', label: 'G' }],
        categorizeItems: [{ id: 'i1', text: 'X', categoryId: 'c1' }],
    }),
    q({ id: 'e-hot-plain', prompt: 'No fragments', type: 'hot-text', points: 2, hotTextPassage: 'nothing here' }),
    q({
        id: 'e-hot-bad',
        prompt: 'Bad hot',
        type: 'hot-text',
        points: 2,
        hotTextPassage: 'The [[quick]] fox',
        hotTextCorrectIndices: [0],
    }),
    q({
        id: 'e-hot-nocorrect',
        prompt: 'No correct',
        type: 'hot-text',
        points: 2,
        hotTextPassage: 'The [[quick]] fox',
    }),
    q({ id: 'e-audio-bad', prompt: 'Bad audio', type: 'audio-response', points: 2 }),
    q({ id: 'e-open', prompt: 'Open question', type: 'open', points: 2 }),
    q({ id: 'e-open-answered', prompt: 'Answered open', type: 'open', points: 2 }),
    q({
        id: 'e-mc-wrong',
        prompt: 'Wrong pick',
        type: 'multiple-choice',
        points: 4,
        options: [
            { id: 'a', text: 'Wrong', isCorrect: false },
            { id: 'b', text: 'Right', isCorrect: true },
        ],
    }),
    q({
        id: 'e-mc-unknown',
        prompt: 'Unknown option',
        type: 'multiple-choice',
        points: 2,
        options: [{ id: 'a', text: 'Only option', isCorrect: true }],
    }),
    q({
        id: 'e-mr-unknown',
        prompt: 'Unknown MR ids',
        type: 'multiple-response',
        points: 2,
        options: [{ id: 'a', text: 'A', isCorrect: true }],
    }),
    q({
        id: 'e-match-wrong',
        prompt: 'Wrong match',
        type: 'matching',
        points: 2,
        matchingPairs: [
            { id: 'm1', left: 'L1', right: 'R1' },
            { id: 'm2', left: 'L2', right: 'R2' },
        ],
    }),
    q({ id: 'e-match-nopairs', prompt: 'No pair field', type: 'matching', points: 2 }),
    q({ id: 'e-order-noitems', prompt: 'No item field', type: 'ordering', points: 2 }),
    q({
        id: 'e-cat-noitems',
        prompt: 'No cat items',
        type: 'categorize',
        points: 2,
        categories: [{ id: 'c1', label: 'G' }],
    }),
    q({
        id: 'e-cat-nocats',
        prompt: 'No cat cats',
        type: 'categorize',
        points: 2,
        categorizeItems: [{ id: 'i1', text: 'X', categoryId: 'c1' }],
    }),
    q({
        id: 'e-cat-wrong',
        prompt: 'Wrong cat',
        type: 'categorize',
        points: 2,
        categories: [
            { id: 'c1', label: 'G' },
            { id: 'c2', label: 'H' },
        ],
        categorizeItems: [{ id: 'i1', text: 'X', categoryId: 'c1' }],
    }),
    q({ id: 'e-hot-nopassage', prompt: 'No passage', type: 'hot-text', points: 2 }),
];

const edgeAnswers = [
    { questionId: 'e-match-none', response: '{}' },
    { questionId: 'e-order-none', response: '[]' },
    { questionId: 'e-cat-none', response: '{}' },
    { questionId: 'e-hot-plain', response: '[]' },
    { questionId: 'e-hot-nocorrect', response: '[]' },
    { questionId: 'e-open-answered', response: 'my raw answer' },
    { questionId: 'e-mc-unknown', response: 'zzz' },
    { questionId: 'e-mr-unknown', response: JSON.stringify(['zzz']) },
    { questionId: 'e-match-wrong', response: JSON.stringify({ m1: 'm2', m2: 'm2' }) },
    { questionId: 'e-match-nopairs', response: '{}' },
    { questionId: 'e-order-noitems', response: '[]' },
    { questionId: 'e-cat-noitems', response: '{}' },
    { questionId: 'e-cat-nocats', response: JSON.stringify({ i1: 'c1' }) },
    { questionId: 'e-cat-wrong', response: JSON.stringify({ i1: 'c2' }) },
    { questionId: 'e-hot-nopassage', response: '[]' },
    { questionId: 'e-mr-empty', response: '[]' },
    { questionId: 'e-mr-bad', response: 'not-json' },
    { questionId: 'e-tf', response: 'true' },
    { questionId: 'e-cloze-bad', response: 'not-json' },
    { questionId: 'e-cloze-plain', response: '{}' },
    { questionId: 'e-cloze-wrong', response: JSON.stringify({ 0: 'slow' }) },
    { questionId: 'e-drop-wrong', response: JSON.stringify({ 0: 'two' }) },
    { questionId: 'e-match-bad', response: 'not-json' },
    { questionId: 'e-match-unknown', response: JSON.stringify({ m1: 'zzz' }) },
    { questionId: 'e-order-bad', response: 'not-json' },
    { questionId: 'e-order-wrong', response: JSON.stringify(['o2', 'o1']) },
    { questionId: 'e-cat-bad', response: 'not-json' },
    { questionId: 'e-cat-unknown', response: JSON.stringify({ i1: 'zzz' }) },
    { questionId: 'e-hot-bad', response: 'not-json' },
    { questionId: 'e-audio-bad', response: 'garbage-code' },
    { questionId: 'e-mc-wrong', response: 'a' },
];

const mockTest: RmTest = {
    id: 't1',
    name: 'Edge Quiz',
    questions: edgeQuestions,
    requireSEB: false,
    shuffleQuestions: false,
    gradeScaleId: 'gs1',
    createdAt: '2026-01-01T00:00:00.000Z',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

function makeStudentTest(overrides: Partial<StudentTest> = {}): StudentTest {
    return {
        id: 'st1',
        testId: 't1',
        studentId: 's1',
        answers: edgeAnswers,
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
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockUseApp),
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

function renderPage(route = '/tests/t1/results/st1') {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
                <Route path="/tests" element={<div>TESTS-ROUTE</div>} />
            </Routes>
        </MemoryRouter>
    );
}

let TestResultsPage: React.ComponentType;

describe('TestResultsPage coverage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockUseApp.tests = [mockTest];
        mockUseApp.studentTests = [makeStudentTest()];
        mockUseApp.students = [mockStudent];
        mockUseApp.gradeScales = [mockGradeScale];
        const mod = await import('../TestResultsPage');
        TestResultsPage = mod.default;
    });

    it('renders every response-formatting edge arm', () => {
        renderPage();
        // Multiple-response: empty selection and invalid JSON both → no_response.
        expect(screen.getAllByText('tests.results.no_response').length).toBeGreaterThanOrEqual(4);
        // True-false renders the localized label.
        expect(screen.getByText('tests.true_false_true')).toBeInTheDocument();
        // Cloze: bad JSON renders blanks; plain prompt → no_response.
        expect(screen.getAllByText('___').length).toBeGreaterThan(0);
        // Wrong cloze answer renders in red (and the dropdown wrong answer too).
        expect(screen.getAllByText('slow').length).toBeGreaterThan(0);
        expect(screen.getAllByText('two').length).toBeGreaterThan(0);
        // Matching: unknown chosen id renders a blank.
        expect(screen.getAllByText('A').length).toBeGreaterThan(0);
        // Ordering: wrong order renders red and unknown/empty fallbacks appear.
        expect(screen.getByText('1. Second')).toBeInTheDocument();
        // Categorize: unknown category renders a blank label.
        expect(screen.getAllByText('X').length).toBeGreaterThan(0);
        // Hot-text: bad JSON renders all fragments unselected.
        expect(screen.getAllByText('quick').length).toBeGreaterThan(0);
        // Audio: invalid code falls through to no_response (counted above).
        // Wrong MC answer shows the red X and full points lost.
        expect(screen.getAllByText(/tests.results.auto_scored/).length).toBeGreaterThan(0);
    });

    it('shows no grade when the scale is none or missing', () => {
        mockUseApp.tests = [{ ...mockTest, gradeScaleId: 'none' }];
        renderPage();
        expect(screen.queryByText('tests.results.grade')).not.toBeInTheDocument();

        mockUseApp.tests = [{ ...mockTest, gradeScaleId: 'missing-scale' }];
        mockUseApp.gradeScales = [];
        renderPage();
        expect(screen.queryByText('tests.results.grade')).not.toBeInTheDocument();
    });

    it('renders the student id when the student is unknown and the back buttons navigate', () => {
        mockUseApp.students = [];
        renderPage();
        expect(screen.getByText(/s1/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.back_to_list'));
        expect(screen.getByText('TESTS-ROUTE')).toBeInTheDocument();
    });

    it('navigates back from the not-found state', () => {
        renderPage('/tests/missing/results/nope');
        expect(screen.getByText('tests.results.not_found')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.back_to_list'));
        expect(screen.getByText('TESTS-ROUTE')).toBeInTheDocument();
    });

    it('shows a negative adjustment without a plus sign', () => {
        mockUseApp.studentTests = [makeStudentTest({ adjustmentPoints: -2, events: undefined })];
        renderPage();
        expect(screen.getByText(/tests.results.raw_points/)).toBeInTheDocument();
        expect(screen.queryByText(/\+-2/)).toBeNull();
    });

    it('appends a new answer and keeps the status when saving an un-answered open question', () => {
        renderPage();
        const openCard = screen.getByText('Open question').closest('.card') as HTMLElement;
        const pointsInput = openCard.querySelector('input[type="number"]') as HTMLInputElement;
        fireEvent.change(pointsInput, { target: { value: '1' } });
        fireEvent.click(within(openCard).getByText('tests.results.save_score'));
        expect(mockSaveStudentTest).toHaveBeenCalledTimes(1);
        const saved = mockSaveStudentTest.mock.calls[0][0] as StudentTest;
        const openAnswer = saved.answers.find((a) => a.questionId === 'e-open');
        expect(openAnswer).toEqual(expect.objectContaining({ questionId: 'e-open', pointsEarned: 1, feedback: '' }));
        // Status is 'submitted' → flips to 'graded' in the submitted arm.
        expect(saved.status).toBe('graded');
    });

    it('keeps a non-submitted status and clamps an empty manual score to zero', () => {
        mockUseApp.studentTests = [
            makeStudentTest({
                status: 'graded',
                answers: [{ questionId: 'e-mc-wrong', response: 'a' }],
            }),
        ];
        renderPage();
        const wrongCard = screen.getByText('Wrong pick').closest('.card') as HTMLElement;
        fireEvent.click(within(wrongCard).getByText('tests.results.save_score'));
        const saved = mockSaveStudentTest.mock.calls[0][0] as StudentTest;
        expect(saved.status).toBe('graded');
        expect(saved.answers[0].pointsEarned).toBe(0);
    });

    it('renders staged path steps with a fallback title and no level suffix', () => {
        const stagedTest: RmTest = {
            ...mockTest,
            mode: 'placement',
            placementEngine: 'mst',
            sections: [
                {
                    id: 'sec1',
                    title: 'Reading',
                    routing: { thresholdPct: 70, passSectionId: 'sec2', failSectionId: 'sec2' },
                },
            ],
            questions: edgeQuestions.map((qq) => ({ ...qq, sectionId: 'sec1' })),
        };
        mockUseApp.tests = [stagedTest];
        mockUseApp.studentTests = [makeStudentTest({ sectionPath: ['sec1', 'unknown-sec'], events: undefined })];
        renderPage();
        // Known section renders its title; unknown section falls back to its id.
        expect(screen.getByText(/Reading/)).toBeInTheDocument();
        expect(screen.getByText(/unknown-sec/)).toBeInTheDocument();
    });

    it('renders staircase steps with a missing question, down-override, and prompt fallbacks', () => {
        const staircaseTest: RmTest = { ...mockTest, mode: 'placement', placementEngine: 'staircase' };
        mockUseApp.tests = [staircaseTest];
        mockUseApp.studentTests = [
            makeStudentTest({
                levelPath: [
                    { sectionId: 'sec1', level: 'A2', questionId: 'e-mc-wrong', correct: false, overridden: 'down' },
                    { sectionId: 'sec2', level: 'B1', questionId: 'missing-q', correct: true },
                ],
                events: undefined,
            }),
        ];
        renderPage();
        expect(screen.getByText('▼ tests.results.placement_overridden_label')).toBeInTheDocument();
        // The missing question renders no prompt suffix.
        expect(screen.getAllByText(/placement_path_step/).length).toBe(2);
    });

    it('saves a manual score on a staged submission, filtering off-path answers', () => {
        const stagedTest: RmTest = {
            ...mockTest,
            mode: 'placement',
            placementEngine: 'mst',
            sections: [
                {
                    id: 'sec1',
                    title: 'Reading',
                    routing: { thresholdPct: 70, passSectionId: 'sec2', failSectionId: 'sec2' },
                },
            ],
            questions: edgeQuestions.map((qq) => ({ ...qq, sectionId: 'sec1' })),
        };
        mockUseApp.tests = [stagedTest];
        // Include an off-path answer so the path filter's non-match arm runs.
        mockUseApp.studentTests = [
            makeStudentTest({
                sectionPath: ['sec1'],
                answers: [...edgeAnswers, { questionId: 'off-path', response: 'x' }],
            }),
        ];
        renderPage();
        const firstCard = screen.getAllByText(/tests.results.manual_points_label/)[0].closest('.card') as HTMLElement;
        fireEvent.click(within(firstCard).getByText('tests.results.save_score'));
        expect(mockSaveStudentTest).toHaveBeenCalledTimes(1);
    });

    it('falls back to the description for a standard without a notation', () => {
        const noNotationTest: RmTest = {
            ...mockTest,
            questions: [
                q({
                    id: 'e-std',
                    prompt: 'Standard question',
                    type: 'open',
                    points: 2,
                    linkedStandards: [
                        {
                            guid: 'g-no-not',
                            description: 'Standard description only',
                            standardSetTitle: 'S',
                            jurisdictionTitle: 'J',
                        },
                    ],
                }),
            ],
        };
        mockUseApp.tests = [noNotationTest];
        mockUseApp.studentTests = [makeStudentTest({ answers: [{ questionId: 'e-std', response: 'answer' }] })];
        renderPage();
        expect(screen.getByText('Standard description only')).toBeInTheDocument();
    });
});
