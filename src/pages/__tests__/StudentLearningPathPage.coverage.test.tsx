import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings } from '../../types';

const { aggr, mockNavigate, routeParams, langState } = vi.hoisted(() => ({
    aggr: {
        overview: null as unknown,
        recommendations: [] as unknown[],
        criterionFlags: [] as unknown[],
        cefrSkillFlags: [] as unknown[],
        grammarRecommendations: [] as unknown[],
    },
    mockNavigate: vi.fn(),
    routeParams: { id: 's1' },
    langState: { value: 'en' },
}));

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'light',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    showCambridgeLabels: true,
};

const mockState = vi.hoisted(() => ({
    students: [{ id: 's1', name: 'Alice', classId: 'c1' }],
    classes: [{ id: 'c1', name: 'Class A' }],
    rubrics: [] as unknown[],
    studentRubrics: [] as unknown[],
    selfAssessments: [],
    analysisResults: [],
    tests: [] as unknown[],
    studentTests: [],
    flashcardDecks: [] as unknown[],
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate, useParams: () => routeParams };
});

vi.mock('../../context/AppContext', () => ({
    useRoster: () => ({}),
    useStudents: () => ({ students: mockState.students }),
    useClasses: () => ({ classes: mockState.classes }),
    useGrading: () => ({ studentRubrics: mockState.studentRubrics }),
    useAuthoring: () => ({ rubrics: mockState.rubrics }),
    useAssessment: () => ({
        selfAssessments: mockState.selfAssessments,
        analysisResults: mockState.analysisResults,
        tests: mockState.tests,
        studentTests: mockState.studentTests,
        peerReviews: [],
    }),
    useEssays: () => ({ messages: [], notificationDismissals: [] }),
    useFlashcards: () => ({ flashcardDecks: mockState.flashcardDecks }),
    useSettings: () => ({ settings: mockSettings }),
    usePlatform: () => ({}),
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) =>
        selector({
            students: mockState.students,
            classes: mockState.classes,
            rubrics: mockState.rubrics,
            studentRubrics: mockState.studentRubrics,
            selfAssessments: mockState.selfAssessments,
            analysisResults: mockState.analysisResults,
            tests: mockState.tests,
            studentTests: mockState.studentTests,
            flashcardDecks: mockState.flashcardDecks,
            settings: mockSettings,
        }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: langState.value },
    }),
}));

vi.mock('../../utils/cefrStudentAggregator', () => ({
    getCefrStudentOverview: () => aggr.overview,
}));

vi.mock('../../utils/learningPathAggregator', () => ({
    getLearningPathRecommendations: () => aggr.recommendations,
    buildCohortAverages: () => new Map(),
    getCriterionInterventionFlags: () => aggr.criterionFlags,
    getCefrSkillInterventionFlags: () => aggr.cefrSkillFlags,
    getGrammarRecommendations: () => aggr.grammarRecommendations,
}));

const overviewWithPlacement = {
    cells: [],
    cellMap: new Map(),
    standardSets: [],
    skillsWithRubricData: 0,
    overallConfidenceRate: 0,
    standardsCovered: 0,
    practiceCefrProgress: [],
    placement: { level: 'B1', testId: 'pt1', testName: 'Placement Test', assessedAt: '2026-01-05T10:00:00Z', path: [] },
};

describe('StudentLearningPathPage coverage', () => {
    beforeEach(() => {
        routeParams.id = 's1';
        langState.value = 'en';
        mockNavigate.mockClear();
        aggr.overview = null;
        aggr.recommendations = [];
        aggr.criterionFlags = [];
        aggr.cefrSkillFlags = [];
        aggr.grammarRecommendations = [];
        mockState.rubrics = [
            {
                id: 'r1',
                name: 'Essay Rubric',
                subject: 'Writing',
                description: '',
                criteria: [{ id: 'crit1', title: 'Grammar & Accuracy' }],
                gradeScaleId: 'gs1',
                format: 'analytic',
                attachmentIds: [],
                createdAt: '2026-01-01',
                updatedAt: '2026-01-01',
                totalMaxPoints: 100,
                scoringMode: 'weighted-percentage',
            },
            {
                id: 'r2',
                name: 'Reading Task',
                subject: 'Reading',
                description: '',
                criteria: [],
                gradeScaleId: 'gs1',
                format: 'analytic',
                attachmentIds: [],
                createdAt: '2026-01-01',
                updatedAt: '2026-01-01',
                totalMaxPoints: 100,
                scoringMode: 'weighted-percentage',
            },
        ];
        mockState.studentRubrics = [];
        mockState.tests = [{ id: 't1', name: 'Grammar Test' }];
        mockState.flashcardDecks = [{ id: 'd1', name: 'Grammar Deck' }];
    });

    it('navigates back from the not-found state', async () => {
        routeParams.id = 'missing';
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        fireEvent.click(screen.getByText('learningPath.back_to_profile'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
    });

    it('renders the placement card when the overview has a placement', async () => {
        aggr.overview = overviewWithPlacement;
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('cefrOverview.placement_badge')).toBeInTheDocument();
        expect(
            screen.getByText(
                (content) => content.startsWith('cefrOverview.placement_from:') && content.includes('Placement Test')
            )
        ).toBeInTheDocument();
    });

    it('renders a recommendation row with the English skill label and no suggested rubrics', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.recommendations = [
            {
                studentId: 's1',
                skill: 'reading',
                level: 'A2',
                studentScore: 40,
                cohortAverage: 70,
                gap: -30,
                suggestedRubricIds: [],
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(
            screen.getByText('learningPath.gap_summary:{"studentScore":"40","cohortAverage":"70"}')
        ).toBeInTheDocument();
        expect(screen.getByText('learningPath.no_suggested_rubrics')).toBeInTheDocument();
    });

    it('renders suggested rubric buttons and falls back for unknown skills/rubrics', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.recommendations = [
            {
                studentId: 's1',
                skill: 'bogus',
                level: 'A1',
                studentScore: 50,
                cohortAverage: 80,
                gap: -30,
                suggestedRubricIds: ['r2', 'rMissing'],
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('bogus')).toBeInTheDocument();
        const rubricBtn = screen.getByText('Reading Task');
        expect(rubricBtn).toBeInTheDocument();
        fireEvent.click(rubricBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r2');
    });

    it('renders grammar recommendations with deck/test links and navigates', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.grammarRecommendations = [
            {
                studentId: 's1',
                grammarItemId: 'gr-present-simple-affirmative',
                streakLength: 3,
                scores: [40, 50, 45],
                triggeredAt: '2026-02-01T10:00:00Z',
                suggestedGrammarDeckIds: ['d1', 'dMissing'],
                suggestedGrammarTestIds: ['t1', 'tMissing'],
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('grammar.suggested_decks:')).toBeInTheDocument();
        const deckBtn = screen.getByText('Grammar Deck');
        fireEvent.click(deckBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/flashcards/d1');
        const testBtn = screen.getByText('Grammar Test');
        fireEvent.click(testBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/tests/t1');
    });

    it('falls back to the raw id when the grammar item is unknown', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.grammarRecommendations = [
            {
                studentId: 's1',
                grammarItemId: 'bogus-item',
                streakLength: 2,
                scores: [30],
                triggeredAt: '2026-02-01T10:00:00Z',
                suggestedGrammarDeckIds: [],
                suggestedGrammarTestIds: [],
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('grammar.recommend_streak:{"count":2,"label":"bogus-item"}')).toBeInTheDocument();
    });

    it('uses Dutch labels for skills and grammar items when the language is Dutch', async () => {
        langState.value = 'nl-NL';
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.recommendations = [
            {
                studentId: 's1',
                skill: 'reading',
                level: 'A2',
                studentScore: 40,
                cohortAverage: 70,
                gap: -30,
                suggestedRubricIds: [],
            },
        ];
        aggr.grammarRecommendations = [
            {
                studentId: 's1',
                grammarItemId: 'gr-present-simple-affirmative',
                streakLength: 2,
                scores: [50],
                triggeredAt: '2026-02-01T10:00:00Z',
                suggestedGrammarDeckIds: [],
                suggestedGrammarTestIds: [],
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('Lezen')).toBeInTheDocument();
        expect(
            screen.getByText('grammar.recommend_streak:{"count":2,"label":"Bevestigend (I work, she works)"}')
        ).toBeInTheDocument();
    });

    it('renders criterion and cefrSkill intervention flags with labels and sorted scores', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.criterionFlags = [
            {
                kind: 'criterion',
                targetId: 'crit1',
                streakLength: 3,
                scores: [50, 55, 40],
                triggeredAt: '2026-03-01T10:00:00Z',
            },
        ];
        aggr.cefrSkillFlags = [
            {
                kind: 'cefrSkill',
                targetId: 'reading',
                streakLength: 2,
                scores: [45, 30],
                triggeredAt: '2026-03-05T10:00:00Z',
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('learningPath.flag_kind_criterion')).toBeInTheDocument();
        expect(screen.getByText('learningPath.flag_kind_cefr_skill')).toBeInTheDocument();
        expect(screen.getByText('Grammar & Accuracy')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.getByText('learningPath.flag_scores:{"scores":"50, 55, 40"}')).toBeInTheDocument();
        expect(screen.getByText('learningPath.flag_scores:{"scores":"45, 30"}')).toBeInTheDocument();
    });

    it('falls back to the raw target id for unknown flag targets', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        aggr.cefrSkillFlags = [
            {
                kind: 'cefrSkill',
                targetId: 'bogus-skill',
                streakLength: 2,
                scores: [40],
                triggeredAt: '2026-03-05T10:00:00Z',
            },
        ];
        aggr.criterionFlags = [
            {
                kind: 'criterion',
                targetId: 'no-such-criterion',
                streakLength: 2,
                scores: [40],
                triggeredAt: '2026-03-01T10:00:00Z',
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('bogus-skill')).toBeInTheDocument();
        expect(screen.getByText('no-such-criterion')).toBeInTheDocument();
    });

    it('computes achieved rubric ids from graded student rubrics', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        mockState.studentRubrics = [
            {
                id: 'sr1',
                studentId: 's1',
                rubricId: 'r1',
                entries: [],
                overallComment: '',
                isPeerReview: false,
                gradedAt: '2026-01-01T10:00:00Z',
            },
            {
                id: 'sr2',
                studentId: 'other',
                rubricId: 'r1',
                entries: [],
                overallComment: '',
                isPeerReview: false,
                gradedAt: '2026-01-02T10:00:00Z',
            },
        ];
        aggr.recommendations = [
            {
                studentId: 's1',
                skill: 'writing',
                level: 'A1',
                studentScore: 55,
                cohortAverage: 75,
                gap: -20,
                suggestedRubricIds: [],
            },
        ];
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        expect(screen.getByText('Writing')).toBeInTheDocument();
    });

    it('navigates to the profile, CEFR overview, and vocabulary pages', async () => {
        aggr.overview = { ...overviewWithPlacement, placement: undefined };
        const { default: StudentLearningPathPage } = await import('../StudentLearningPathPage');
        renderWithRouter(<StudentLearningPathPage />);
        fireEvent.click(screen.getByText('learningPath.back_to_profile'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1');
        fireEvent.click(screen.getByText('cefrOverview.view_button'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/cefr-overview');
        fireEvent.click(screen.getByText('navigation.vocabulary'));
        expect(mockNavigate).toHaveBeenCalledWith('/vocabulary');
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
    });
});
