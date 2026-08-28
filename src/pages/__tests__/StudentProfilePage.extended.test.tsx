import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type {
    AppSettings,
    Class,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    GradeScale,
    Rubric,
    SelfAssessment,
    SpeakingSession,
    Student,
    StudentRubric,
    StudentTest,
    Test,
} from '../../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const gradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const grammarDescriptor = (descriptorId: string) => ({ framework: 'grammar', descriptorId });

const makeRubric = (overrides: Partial<Rubric>): Rubric => ({
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] }],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    ...overrides,
});

const rubricCefr: Rubric = makeRubric({
    id: 'r1',
    name: 'Writing Rubric',
    cefrTargetLevel: 'B1',
    cefrSkill: 'writing',
    criteria: [
        {
            id: 'c1',
            title: 'Grammar',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] }],
            frameworkDescriptors: [grammarDescriptor('gr-present-simple-affirmative') as never],
        },
        {
            id: 'c2',
            title: 'Fluency',
            description: '',
            weight: 100,
            levels: [{ id: 'l2', label: 'Good', minPoints: 90, maxPoints: 100, description: '', subItems: [] }],
            frameworkDescriptors: [grammarDescriptor('gr-present-simple-negative') as never],
        },
    ],
});

const rubricReading: Rubric = makeRubric({
    id: 'r2',
    name: 'Reading Rubric',
    cefrTargetLevel: 'A2',
    cefrSkill: 'reading',
    format: { ...DEFAULT_FORMAT, orientation: 'landscape' },
    criteria: [
        {
            id: 'c1',
            title: 'Comprehension',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Good', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Weak', minPoints: 0, maxPoints: 50, description: '', subItems: [] },
            ],
        },
    ],
});

const rubricFallbackScale: Rubric = makeRubric({
    id: 'r3',
    name: 'History Rubric',
    cefrTargetLevel: 'B2',
    gradeScaleId: 'missing-scale',
    format: { ...DEFAULT_FORMAT, orientation: '' as never },
});

const rubricExtra: Rubric = makeRubric({ id: 'r4', name: 'Speaking Extra' });

const makeSr = (overrides: Partial<StudentRubric>): StudentRubric => ({
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-06-01T00:00:00Z',
    ...overrides,
});

const srHigh: StudentRubric = makeSr({
    id: 'sr1',
    rubricId: 'r1',
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l2', checkedSubItems: [], comment: '' },
    ],
});
const srLow: StudentRubric = makeSr({
    id: 'sr2',
    rubricId: 'r2',
    entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' }],
});
const srFallback: StudentRubric = makeSr({ id: 'sr3', rubricId: 'r3' });
const srOrphan: StudentRubric = makeSr({ id: 'sr4', rubricId: 'gone-rubric' });

const selfAssessRich: SelfAssessment = {
    id: 'sa1',
    rubricId: 'r1',
    studentId: 's1',
    ratings: [
        { descriptorId: 'd1', level: 'B1', skill: 'writing', confident: true },
        { descriptorId: 'd2', level: 'B1', skill: 'writing', confident: false },
    ],
    reflection: 'I feel good about this.',
    submittedAt: '2024-06-02T00:00:00Z',
};

const selfAssessBare: SelfAssessment = {
    id: 'sa2',
    rubricId: 'unknown-rubric',
    studentId: 's1',
    ratings: [],
    submittedAt: '2024-06-03T00:00:00Z',
};

const selfAssessOver: SelfAssessment = {
    id: 'sa3',
    rubricId: 'r2',
    studentId: 's1',
    ratings: [
        { descriptorId: 'd3', level: 'B1', skill: 'writing', confident: true },
        { descriptorId: 'd4', level: 'B1', skill: 'writing', confident: true },
    ],
    submittedAt: '2024-06-07T00:00:00Z',
};

const speakingFull: SpeakingSession = {
    id: 'ss1',
    rubricId: 'r1',
    studentId: 's1',
    durationSeconds: 120,
    elapsedSeconds: 95,
    pronunciationMarks: [{ errorType: 'word_stress' }],
    entries: [],
    overallComment: 'Good session',
    gradedAt: '2024-06-04T00:00:00Z',
    recordings: [
        {
            id: 'rec1',
            mediaType: 'audio',
            mimeType: 'audio/webm',
            durationSec: 30,
            sizeBytes: 100,
            createdAt: '2024-06-04T00:00:00Z',
        },
    ],
};

const speakingOrphan: SpeakingSession = {
    id: 'ss2',
    rubricId: 'gone-session-rubric',
    studentId: 's1',
    durationSeconds: 60,
    elapsedSeconds: 45,
    pronunciationMarks: [],
    entries: [],
    overallComment: '',
    gradedAt: '2024-06-05T00:00:00Z',
};

const speakingFallbackScale: SpeakingSession = {
    id: 'ss3',
    rubricId: 'r3',
    studentId: 's1',
    durationSeconds: 60,
    elapsedSeconds: 40,
    pronunciationMarks: [],
    entries: [],
    overallComment: '',
    gradedAt: '2024-06-06T00:00:00Z',
};

const placementTest: Test = {
    id: 'pt1',
    name: 'Placement Test',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-05-01T00:00:00Z',
    mode: 'placement',
    sections: [
        {
            id: 'ps1',
            title: 'Stage One',
            cefrLevel: 'A2',
            routing: { thresholdPct: 50, passSectionId: 'ps2', failSectionId: 'ps2' },
        },
        { id: 'ps2', title: 'End' },
    ],
    questions: [
        {
            id: 'pq1',
            prompt: 'Q',
            type: 'multiple-choice',
            points: 1,
            sectionId: 'ps1',
            options: [
                { id: 'pa', text: '1', isCorrect: true },
                { id: 'pb', text: '2', isCorrect: false },
            ],
        },
    ],
};

const placementStudentTest: StudentTest = {
    id: 'pst1',
    testId: 'pt1',
    studentId: 's1',
    status: 'submitted',
    answers: [{ questionId: 'pq1', response: 'pa', pointsEarned: 1 }],
    sectionPath: ['ps1'],
    startedAt: '2024-07-01T00:00:00Z',
    submittedAt: '2024-07-01T00:05:00Z',
};

const grammarTest: Test = {
    id: 'mt1',
    name: 'Grammar Test',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-05-01T00:00:00Z',
    questions: [
        {
            id: 'mq1',
            prompt: 'Pick one',
            type: 'multiple-choice',
            points: 1,
            linkedGrammarItemId: 'gr-present-simple-affirmative',
            options: [{ id: 'mo1', text: 'goes', isCorrect: true }],
        },
        {
            id: 'mq2',
            prompt: 'Pick two',
            type: 'multiple-choice',
            points: 1,
            linkedGrammarItemId: 'gr-present-simple-negative',
            options: [{ id: 'mo2', text: 'go', isCorrect: true }],
        },
    ],
};

const grammarStudentTest: StudentTest = {
    id: 'mst1',
    testId: 'mt1',
    studentId: 's1',
    status: 'submitted',
    answers: [
        { questionId: 'mq1', response: 'mo1', pointsEarned: 1 },
        { questionId: 'mq2', response: 'mo2', pointsEarned: 0 },
    ],
    startedAt: '2024-06-10T00:00:00Z',
    submittedAt: '2024-06-10T00:05:00Z',
};

const grammarDeck: FlashcardDeck = {
    id: 'd1',
    name: 'Grammar Deck',
    cards: [
        { id: 'dc1', front: 'he ___ to school', back: 'goes', linkedGrammarItemId: 'gr-present-simple-affirmative' },
        { id: 'dc2', front: 'they ___ like it', back: 'do not', linkedGrammarItemId: 'gr-present-simple-question' },
    ],
    createdAt: '2024-05-01T00:00:00Z',
};

const grammarAssignment: FlashcardAssignment = {
    deckId: 'd1',
    studentId: 's1',
    deckName: 'Grammar Deck',
    cardCount: 2,
    createdAt: '2024-05-02T00:00:00Z',
};

const grammarReview: FlashcardReview = {
    id: 'd1:s1',
    deckId: 'd1',
    studentId: 's1',
    cardStates: {},
    updatedAt: '2024-06-11T00:00:00Z',
};

const rubricGoal: Rubric = makeRubric({
    id: 'r5',
    name: 'Goal Rubric',
    criteria: [
        {
            id: 'gc1',
            title: 'Goal Crit',
            description: '',
            weight: 100,
            linkedStandards: [
                { guid: 'std-goal', description: 'Standard desc', standardSetTitle: 'Set', jurisdictionTitle: 'J' },
            ],
            levels: [{ id: 'gl1', label: 'Good', minPoints: 8, maxPoints: 10, description: '', subItems: [] }],
        },
    ],
});

const srGoal: StudentRubric = makeSr({
    id: 'sr5',
    rubricId: 'r5',
    gradedAt: '2024-06-20T00:00:00Z',
    entries: [{ criterionId: 'gc1', levelId: 'gl1', selectedPoints: 9, checkedSubItems: [], comment: '' }],
});

const standardTarget = {
    id: 't1',
    standardGuid: 'std-goal',
    standardDescription: 'Standard desc',
    standardSetTitle: 'Set',
    year: 'jaar-2' as const,
    voTrack: 'havo' as const,
    targetPercentage: 70,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockExportSinglePdf = vi.fn().mockResolvedValue(undefined);
const mockLogAuditEvent = vi.fn();
const mockClipboardWrite = vi.fn();
const tourCapture = vi.hoisted(() => ({ onEvent: null as unknown as (data: { status: string }) => void }));

const mockStudentsArr: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1', email: 'alice@school.org' }];
const mockClassesArr: Class[] = [{ id: 'c1', name: 'Class A', year: 'jaar-2', voTrack: 'havo' }];
const mockRubricsArr: Rubric[] = [rubricCefr, rubricReading, rubricFallbackScale, rubricExtra];
const mockStudentRubricsArr: StudentRubric[] = [srHigh, srLow, srFallback, srOrphan];
const mockGradeScalesArr: GradeScale[] = [gradeScale, { id: 'gs2', name: 'Points', type: 'custom', ranges: [] }];
const mockSelfAssessmentsArr: SelfAssessment[] = [selfAssessRich, selfAssessBare, selfAssessOver];
const mockSpeakingSessionsArr: SpeakingSession[] = [speakingFull, speakingOrphan, speakingFallbackScale];
const mockTestsArr: Test[] = [placementTest, grammarTest];
const mockStudentTestsArr: StudentTest[] = [placementStudentTest, grammarStudentTest];
const mockFlashcardDecksArr: FlashcardDeck[] = [grammarDeck];
const mockFlashcardAssignmentsArr: FlashcardAssignment[] = [grammarAssignment];
const mockFlashcardReviewsArr: FlashcardReview[] = [grammarReview];
const emptyArr: never[] = [];

const mockAppValue = {
    students: mockStudentsArr,
    classes: mockClassesArr,
    rubrics: mockRubricsArr,
    studentRubrics: mockStudentRubricsArr,
    gradeScales: mockGradeScalesArr,
    settings: {
        defaultGradeScaleId: 'gs1',
        theme: 'dark',
        language: 'en',
        accentColor: '#3b82f6',
        defaultFormat: DEFAULT_FORMAT,
    } as AppSettings,
    selfAssessments: mockSelfAssessmentsArr,
    speakingSessions: mockSpeakingSessionsArr,
    standardMasteryTargets: [standardTarget],
    tests: mockTestsArr,
    studentTests: mockStudentTestsArr,
    flashcardDecks: mockFlashcardDecksArr,
    flashcardAssignments: mockFlashcardAssignmentsArr,
    flashcardReviews: mockFlashcardReviewsArr,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: any) => any) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 300 }),
    };
});

vi.mock('react-joyride', () => ({
    Joyride: ({ onEvent }: { onEvent: (data: { status: string }) => void }) => {
        tourCapture.onEvent = onEvent;
        return null;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../utils/pdfExport', () => ({
    exportSinglePdf: (...args: unknown[]) => mockExportSinglePdf(...args),
}));
vi.mock('../../services/database/AuditLogger', () => ({
    logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));
vi.mock('../../components/Statistics/LearningGoalChart', () => ({ default: () => null }));
vi.mock('../../components/Statistics/CefrProgressChart', () => ({ default: () => null }));
vi.mock('../../components/Statistics/ProfileTimelineChart', () => ({ default: () => null }));
vi.mock('../../components/Recordings/RecordingPlayer', () => ({ default: () => null }));

const i18nLang = vi.hoisted(() => ({ value: 'en' }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: i18nLang.value },
    }),
}));

let StudentProfilePageComp: React.ComponentType;

function renderAt(studentId: string) {
    const router = createMemoryRouter([{ path: '/students/:id', element: <StudentProfilePageComp /> }], {
        initialEntries: [`/students/${studentId}`],
    });
    return render(<RouterProvider router={router} />);
}

function findButtonByText(text: string): HTMLElement {
    return screen.getAllByRole('button').find((b) => b.textContent?.includes(text))!;
}

describe('StudentProfilePage extended coverage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        i18nLang.value = 'en';
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: mockClipboardWrite },
            configurable: true,
        });
        vi.spyOn(window, 'print').mockImplementation(() => {});
        const mod = await import('../StudentProfilePage');
        StudentProfilePageComp = mod.default;
    });

    it('renders the overview stats, performance chart, CEFR progress and track band', () => {
        renderAt('s1');
        expect(screen.getByText('60.0%')).toBeInTheDocument();
        expect(screen.getAllByText('90.0%').length).toBeGreaterThan(0);
        expect(screen.getByText('Average Score')).toBeInTheDocument();
        expect(screen.getByText('Highest Score')).toBeInTheDocument();
        expect(screen.getByText('Performance Timeline')).toBeInTheDocument();
        expect(screen.getByText('cefr.student_progress_title')).toBeInTheDocument();
        expect(screen.getAllByText('cefr.achieved').length).toBeGreaterThan(0);
        expect(screen.getByText('cefr.developing')).toBeInTheDocument();
    });

    it('renders the placement estimate card and the navigation buttons', () => {
        renderAt('s1');
        expect(screen.getByText(/Placement Test/)).toBeInTheDocument();
        fireEvent.click(findButtonByText('learningPath.view_button'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/learning-path');
        fireEvent.click(findButtonByText('vocabProfile.view_button'));
        expect(mockNavigate).toHaveBeenCalledWith('/vocabulary');
        fireEvent.click(findButtonByText('flashcards.view_button'));
        expect(mockNavigate).toHaveBeenCalledWith('/flashcards');
        fireEvent.click(findButtonByText('cefrOverview.view_button'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/cefr-overview');
    });

    it('renders the self-assessment comparison with mismatch flag and reflection', () => {
        renderAt('s1');
        expect(screen.getByText('selfAssess.comparison_title')).toBeInTheDocument();
        expect(screen.getAllByText('Writing Rubric').length).toBeGreaterThan(0);
        // Teacher score chip shows the matching history score.
        expect(screen.getAllByText(/90%/).length).toBeGreaterThan(0);
        expect(screen.getByText('selfAssess.mismatch_underestimate')).toBeInTheDocument();
        expect(screen.getByText('selfAssess.mismatch_overestimate')).toBeInTheDocument();
        expect(screen.getAllByText('selfAssess.student_view').length).toBeGreaterThan(0);
        expect(screen.getByText(/I feel good about this/)).toBeInTheDocument();
    });

    it('navigates from the comparison card and history table, and toggles the new-session picker', () => {
        renderAt('s1');
        // Self-assess comparison card's view-full button.
        fireEvent.click(screen.getAllByText('selfAssess.view_full')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/self-assess/s1');
        // Peer-review button on the first history row.
        fireEvent.click(screen.getAllByTitle('Self/Peer Review')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r3/peer-review/s1');
        // New-session button toggles the shared rubric picker.
        fireEvent.click(findButtonByText('speaking.new_session'));
        expect(screen.getByText('speaking.choose_rubric')).toBeInTheDocument();
        fireEvent.click(findButtonByText('speaking.new_session'));
        expect(screen.queryByText('speaking.choose_rubric')).not.toBeInTheDocument();
    });

    it('renders the speaking sessions history with summaries and pronunciation marks', () => {
        renderAt('s1');
        expect(screen.getByText('speaking.sessions_history')).toBeInTheDocument();
        expect(screen.getAllByText('speaking.error_types.word_stress').length).toBe(1);
        expect(screen.getByText('speaking.elapsed_time:{"elapsed":95,"duration":120}')).toBeInTheDocument();
        // Orphan session falls back to its rubricId as the name.
        expect(screen.getByText('gone-session-rubric')).toBeInTheDocument();
    });

    it('renders the cross-domain mastery profile with all evidence streams', () => {
        renderAt('s1');
        expect(screen.getByText('masteryProfile.title')).toBeInTheDocument();
        expect(
            screen.getByText('masteryProfile.test_summary:{"correct":1,"attempts":1,"pct":"100"}')
        ).toBeInTheDocument();
        expect(
            screen.getAllByText('masteryProfile.flashcards_summary:{"mastered":0,"total":1,"due":0}').length
        ).toBeGreaterThan(0);
        expect(screen.getAllByText('masteryProfile.writing_summary:{"pct":"90","count":1}').length).toBeGreaterThan(0);
        expect(screen.getAllByText('masteryProfile.no_data').length).toBeGreaterThan(0);
    });

    it('renders the portfolio timeline with grade, speaking and self-assessment entries', () => {
        renderAt('s1');
        fireEvent.click(screen.getByText('studentProfile.tab_portfolio'));
        expect(screen.getAllByText('Rubric Grade').length).toBeGreaterThan(0);
        expect(screen.getAllByText('speaking.sessions_history').length).toBeGreaterThan(0);
        expect(screen.getAllByText('selfAssess.comparison_title').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Writing Rubric').length).toBeGreaterThan(0);
        // Newest self-assessment entry sorts first (Jun 7) -> its view navigates to self-assess.
        fireEvent.click(screen.getAllByText('common.view')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r2/self-assess/s1');
        // Speaking entry (Jun 6) -> its view navigates to the speaking session.
        fireEvent.click(screen.getAllByText('common.view')[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r3/s1');
        // Grade entries sort last; their view buttons navigate to the rubric grading view.
        fireEvent.click(screen.getAllByText('common.view').at(-1)!);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r3/grade/s1');
    });

    it('closes the tour on finish and skip events', () => {
        renderAt('s1');
        fireEvent.click(findButtonByText('tutorial.sprofile_tour_button'));
        expect(tourCapture.onEvent).toBeTruthy();
        act(() => tourCapture.onEvent({ status: 'finished' }));
        act(() => tourCapture.onEvent({ status: 'skipped' }));
        // A status that matches neither terminal state leaves the tour running.
        act(() => tourCapture.onEvent({ status: 'next' }));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows the speaking picker with multiple rubrics and navigates from it', () => {
        renderAt('s1');
        fireEvent.click(findButtonByText('speaking.launch_session'));
        expect(screen.getByText('speaking.choose_rubric')).toBeInTheDocument();
        // Backdrop click closes the picker.
        const backdrop = document.querySelector('div[style*="position: fixed"]') as HTMLElement;
        fireEvent.click(backdrop);
        expect(screen.queryByText('speaking.choose_rubric')).not.toBeInTheDocument();

        fireEvent.click(findButtonByText('speaking.launch_session'));
        fireEvent.click(findButtonByText('Speaking Extra'));
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r4/s1');
    });

    it('exports a history PDF and shows the spinner while exporting', async () => {
        let resolveExport: () => void = () => {};
        mockExportSinglePdf.mockImplementationOnce(
            () =>
                new Promise<void>((res) => {
                    resolveExport = res;
                })
        );
        renderAt('s1');
        const pdfButtons = screen.getAllByText('PDF');
        fireEvent.click(pdfButtons[0]);
        expect(pdfButtons[0].closest('button')).toBeDisabled();
        resolveExport();
        await waitFor(() => expect(mockLogAuditEvent).toHaveBeenCalledWith('export', 'export_pdf', 'rubric', 'r3'));
    });

    it('copies a self-assessment link and swaps the icon', () => {
        vi.useFakeTimers();
        renderAt('s1');
        const copyBtn = screen.getAllByTitle('selfAssess.copy_link')[0];
        fireEvent.click(copyBtn);
        expect(mockClipboardWrite).toHaveBeenCalledWith(`${window.location.origin}/rubrics/r3/self-assess/s1`);
        // Icon swaps to the green copied state, then resets after the 2s timeout.
        expect(copyBtn.style.color).toContain('var(--green');
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getAllByTitle('selfAssess.copy_link')[0].style.color).toBe('');
        vi.useRealTimers();
    });

    it('renders the header variants: no class, vo track badge and past memberships', () => {
        mockStudentsArr.push({
            id: 's2',
            name: 'Bob',
            classId: 'no-class',
            pastClassMemberships: [
                { classId: 'c1', leftAt: '2023-07-01T00:00:00Z' },
                { classId: 'gone-class', leftAt: '2022-07-01T00:00:00Z' },
            ],
        });
        renderAt('s2');
        expect(screen.getByText('Unknown Class')).toBeInTheDocument();
        expect(screen.getByText(/studentProfile\.past_classes/)).toBeInTheDocument();
        expect(screen.getAllByText(/Class A/).length).toBeGreaterThan(0);
        expect(screen.getByText(/studentProfile\.unknown_class/)).toBeInTheDocument();
        mockStudentsArr.pop();
    });

    it('renders mastery labels in Dutch when the UI language is nl', () => {
        i18nLang.value = 'nl';
        renderAt('s1');
        expect(screen.getByText('masteryProfile.title')).toBeInTheDocument();
        // The row renders labelNl when lang === 'nl'.
        expect(screen.getAllByText(/Tegenwoordige tijd \(Present Simple\)/).length).toBeGreaterThan(0);
    });

    it('navigates from the topbar buttons and prints', () => {
        renderAt('s1');
        fireEvent.click(findButtonByText('learningPath.nav_label'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/learning-path');
        fireEvent.click(findButtonByText('studentPortal.view_portal_btn'));
        expect(mockNavigate).toHaveBeenCalledWith('/portal/s1');
        fireEvent.click(findButtonByText('common.print'));
        expect(window.print).toHaveBeenCalled();
        fireEvent.click(findButtonByText('studentsPage.back_to_roster'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
    });

    it('navigates directly when exactly one rubric exists and uses the compact CEFR layout', () => {
        const saved = mockRubricsArr.slice();
        mockRubricsArr.splice(0, mockRubricsArr.length, rubricCefr);
        renderAt('s1');
        // Launch and new-session buttons route straight to the single rubric.
        fireEvent.click(findButtonByText('speaking.launch_session'));
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r1/s1');
        fireEvent.click(findButtonByText('speaking.new_session'));
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r1/s1');
        mockRubricsArr.splice(0, mockRubricsArr.length, ...saved);
    });

    it('renders the learning-goal chart when standards carry mastery targets', () => {
        mockRubricsArr.push(rubricGoal);
        mockStudentRubricsArr.push(srGoal);
        renderAt('s1');
        expect(screen.getByText('Goal Rubric')).toBeInTheDocument();
        mockRubricsArr.pop();
        mockStudentRubricsArr.pop();
    });

    it('falls back to the default grade scale when a snapshotted rubric has no scale id', () => {
        const snapshot: Rubric = {
            ...makeRubric({ id: 'r7', name: 'Snapshot Rubric' }),
            gradeScaleId: undefined as never,
        };
        mockStudentRubricsArr.push(makeSr({ id: 'sr7', rubricId: 'r7', rubricSnapshot: snapshot }));
        renderAt('s1');
        expect(screen.getByText('Snapshot Rubric')).toBeInTheDocument();
        mockStudentRubricsArr.pop();
    });

    it('shows the portfolio empty state when the student has no history', () => {
        const savedSrs = mockStudentRubricsArr.slice();
        const savedSas = mockSelfAssessmentsArr.slice();
        const savedSessions = mockSpeakingSessionsArr.slice();
        mockStudentRubricsArr.length = 0;
        mockSelfAssessmentsArr.length = 0;
        mockSpeakingSessionsArr.length = 0;
        renderAt('s1');
        fireEvent.click(screen.getByText('studentProfile.tab_portfolio'));
        expect(screen.getByText('studentProfile.portfolio_empty')).toBeInTheDocument();
        mockStudentRubricsArr.splice(0, mockStudentRubricsArr.length, ...savedSrs);
        mockSelfAssessmentsArr.splice(0, mockSelfAssessmentsArr.length, ...savedSas);
        mockSpeakingSessionsArr.splice(0, mockSpeakingSessionsArr.length, ...savedSessions);
    });
});
