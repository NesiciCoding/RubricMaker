import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student } from '../../types';

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1', voTrack: 'vwo' };
const mockClass: Class = { id: 'c1', name: 'Class A', year: 'jaar-3', voTrack: 'vwo' };
const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    showCambridgeLabels: false,
};

// A rich overview: 3 rubric cells (radar renders), 1 descriptors-only cell, a track
// band, placement, practice progress, and a standard set.
const richOverview = {
    cells: [
        {
            skill: 'reading',
            level: 'B1',
            rubricCount: 3,
            avgScore: 82.4,
            threshold: 70,
            rubricAchieved: true,
            evidence: [
                {
                    sourceType: 'rubric',
                    sourceId: 'sr1',
                    sourceName: 'Essay Rubric',
                    gradedAt: '2024-01-02T00:00:00Z',
                    score: 82,
                    threshold: 70,
                },
            ],
            totalDescriptors: 5,
            confidentCount: 3,
            confidenceRate: 60,
            state: 'achieved',
            descriptors: [],
        },
        {
            skill: 'listening',
            level: 'A2',
            rubricCount: 1,
            avgScore: 55,
            threshold: 70,
            rubricAchieved: false,
            evidence: [
                {
                    sourceType: 'test',
                    sourceId: 'st1',
                    sourceName: 'Listening Test',
                    gradedAt: '2024-01-05T00:00:00Z',
                    score: 55,
                    threshold: 70,
                },
            ],
            totalDescriptors: 0,
            confidentCount: 0,
            confidenceRate: 0,
            state: 'developing',
            descriptors: [],
        },
        {
            skill: 'writing',
            level: 'B2',
            rubricCount: 2,
            avgScore: 91,
            threshold: 80,
            rubricAchieved: true,
            evidence: [],
            totalDescriptors: 2,
            confidentCount: 2,
            confidenceRate: 100,
            state: 'achieved',
            descriptors: [],
        },
        {
            skill: 'speaking_production',
            level: 'B1',
            rubricCount: 0,
            avgScore: 0,
            threshold: 70,
            rubricAchieved: false,
            evidence: [],
            totalDescriptors: 4,
            confidentCount: 1,
            confidenceRate: 25,
            state: 'not-started',
            descriptors: [],
        },
    ],
    cellMap: new Map(),
    standardSets: [{ setTitle: 'Kernwaarden', standards: [] }],
    skillsWithRubricData: 3,
    overallConfidenceRate: 66.6,
    standardsCovered: 4,
    trackYearProgress: { year: 'jaar-3', achievedLevel: 'B1', status: 'on-track' },
    practiceCefrProgress: [
        {
            skill: 'reading',
            level: 'A2',
            attemptCount: 2,
            avgScore: 70,
            bestScore: 80,
            lastAttemptAt: '2024-01-03T00:00:00Z',
        },
    ],
    placement: {
        level: 'A2',
        testId: 't1',
        testName: 'Placement Test',
        assessedAt: '2024-01-04T00:00:00Z',
        path: [],
    },
};

const emptyOverview = {
    cells: [
        {
            skill: 'reading',
            level: 'B1',
            rubricCount: 0,
            avgScore: 0,
            threshold: 70,
            rubricAchieved: false,
            evidence: [],
            totalDescriptors: 0,
            confidentCount: 0,
            confidenceRate: 0,
            state: 'not-started',
            descriptors: [],
        },
    ],
    cellMap: new Map(),
    standardSets: [],
    skillsWithRubricData: 0,
    overallConfidenceRate: 0,
    standardsCovered: 0,
    practiceCefrProgress: [],
};

const mockNavigate = vi.fn();
const mockWriteText = vi.fn();
const mockGetOverview = vi.fn();

// Language is mutated per test — the module-level mock reads the same object.
const mockI18n: Record<string, unknown> = { language: 'en' };

// Prop-capturing stub for the grid so we can assert cells/targetLevel/lang.
const gridProps: Record<string, unknown> = {};

vi.mock('../../context/AppContext', () => ({
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
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
    useStoreActions: () => mockState,
}));

const mockState: Record<string, unknown> = {
    students: [mockStudent],
    classes: [mockClass],
    studentRubrics: [],
    rubrics: [],
    selfAssessments: [],
    analysisResults: [],
    tests: [],
    studentTests: [],
    settings: mockSettings,
};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../utils/cefrStudentAggregator', () => ({
    getCefrStudentOverview: mockGetOverview,
}));

vi.mock('../../components/CEFR/CefrOverviewGrid', () => ({
    default: (props: Record<string, unknown>) => {
        gridProps.cells = props.cells;
        gridProps.targetLevel = props.targetLevel;
        gridProps.lang = props.lang;
        return React.createElement('div', { 'data-testid': 'cefr-grid' });
    },
}));

vi.mock('../../components/CEFR/CefrPlacementCard', () => ({
    default: () => React.createElement('div', { 'data-testid': 'placement-card' }),
}));

vi.mock('../../components/CEFR/CefrTrackYearBand', () => ({
    default: () => React.createElement('div', { 'data-testid': 'track-band' }),
}));

vi.mock('../../components/CEFR/PracticeCefrProgressPanel', () => ({
    default: () => React.createElement('div', { 'data-testid': 'practice-panel' }),
}));

vi.mock('../../components/Statistics/CefrProgressChart', () => ({
    default: () => React.createElement('div', { 'data-testid': 'radar-chart' }),
}));

vi.mock('../../components/Standards/StandardsCoveragePanel', () => ({
    default: () => React.createElement('div', { 'data-testid': 'standards-panel' }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: mockI18n,
    }),
}));

let PageComp: React.ComponentType;

function renderAt(studentId = 's1') {
    const router = createMemoryRouter([{ path: '/students/:id', element: <PageComp /> }], {
        initialEntries: [`/students/${studentId}`],
    });
    return render(<RouterProvider router={router} />);
}

describe('StudentCefrOverviewPage coverage', () => {
    beforeEach(async () => {
        mockNavigate.mockClear();
        mockGetOverview.mockReset();
        mockGetOverview.mockReturnValue(richOverview);
        mockI18n.language = 'en';
        mockState.students = [mockStudent];
        mockState.classes = [mockClass];
        gridProps.cells = undefined;
        gridProps.targetLevel = undefined;
        gridProps.lang = undefined;
        mockWriteText.mockReset();
        mockWriteText.mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: mockWriteText },
            configurable: true,
        });
        const mod = await import('../StudentCefrOverviewPage');
        PageComp = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows the not-found state and navigates back to the student list', () => {
        mockState.students = [];
        mockState.classes = [];
        renderAt('missing');
        expect(screen.getByText('cefrOverview.student_not_found')).toBeInTheDocument();
        // Topbar action and empty-state button both navigate back.
        fireEvent.click(screen.getAllByText('cefrOverview.back_to_profile')[0]);
        fireEvent.click(screen.getAllByText('cefrOverview.back_to_profile')[1]);
        expect(mockNavigate).toHaveBeenCalledTimes(2);
        expect(mockNavigate).toHaveBeenCalledWith('/students');
    });

    it('renders the full overview with track badge, stats, radar, evidence, and panels', () => {
        renderAt();
        // Header: name, class, track badge, target level.
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
        expect(screen.getByText('VWO')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.target_level_label:')).toBeInTheDocument();
        expect(screen.getAllByText('B2').length).toBeGreaterThan(0); // VO_TRACK_DEFAULT_CEFR['vwo']
        // Stat cards.
        expect(screen.getByText('3')).toBeInTheDocument(); // skillsWithRubricData
        expect(screen.getByText('67%')).toBeInTheDocument(); // Math.round(66.6)
        expect(screen.getByText('4')).toBeInTheDocument(); // standardsCovered
        // Radar (3 rubric cells), track band, placement, practice panel.
        expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
        expect(screen.getByTestId('track-band')).toBeInTheDocument();
        expect(screen.getByTestId('placement-card')).toBeInTheDocument();
        expect(screen.getByTestId('practice-panel')).toBeInTheDocument();
        // Grid receives cells, target level, and lang.
        expect(screen.getByTestId('cefr-grid')).toBeInTheDocument();
        expect((gridProps.cells as unknown[]).length).toBe(4);
        expect(gridProps.targetLevel).toBe('B2');
        expect(gridProps.lang).toBe('en');
        // Evidence section with skill labels and sources.
        expect(screen.getByText('cefrOverview.evidence_title')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.getByText('Listening Test')).toBeInTheDocument();
        expect(
            screen.getByText('cefrOverview.rationale_achieved:{"score":82,"count":3,"threshold":70}')
        ).toBeInTheDocument();
        expect(
            screen.getByText('cefrOverview.rationale_developing:{"score":55,"count":1,"threshold":70}')
        ).toBeInTheDocument();
        // Standards panel.
        expect(screen.getByTestId('standards-panel')).toBeInTheDocument();
    });

    it('copies the share link and reverts after 2 seconds', () => {
        vi.useFakeTimers();
        renderAt();
        const href = window.location.href;
        fireEvent.click(screen.getAllByText('cefrOverview.share_button')[0]);
        expect(mockWriteText).toHaveBeenCalledWith(href);
        expect(screen.getAllByText('cefrOverview.share_copied').length).toBe(2);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getAllByText('cefrOverview.share_button').length).toBe(2);
    });

    it('shows the empty grid when there is no CEFR data and hides radar/evidence/panels', () => {
        mockGetOverview.mockReturnValue(emptyOverview);
        mockState.classes = [{ id: 'c1', name: 'Class A' }]; // no voTrack → no target badge
        renderAt();
        expect(screen.getByText('cefrOverview.empty_no_cefr')).toBeInTheDocument();
        // hasAnyData false → the grid is replaced by the empty state.
        expect(screen.queryByTestId('cefr-grid')).not.toBeInTheDocument();
        expect(gridProps.cells).toBeUndefined();
        // No radar (1 cell), no track band, no placement, no evidence, no standards.
        expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
        expect(screen.queryByTestId('track-band')).not.toBeInTheDocument();
        expect(screen.queryByTestId('placement-card')).not.toBeInTheDocument();
        expect(screen.queryByTestId('standards-panel')).not.toBeInTheDocument();
        expect(screen.queryByText('cefrOverview.evidence_title')).not.toBeInTheDocument();
        // Class name without voTrack still renders.
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
        expect(screen.queryByText('VWO')).not.toBeInTheDocument();
    });

    it('uses Dutch skill labels and grid language when the interface is nl', () => {
        mockI18n.language = 'nl';
        renderAt();
        expect(gridProps.lang).toBe('nl');
        expect(screen.getByText('Lezen')).toBeInTheDocument();
    });

    it('navigates to the learning path, vocabulary, and back to the profile', () => {
        renderAt();
        fireEvent.click(screen.getByText('learningPath.view_button'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/learning-path');
        fireEvent.click(screen.getByText('navigation.vocabulary'));
        expect(mockNavigate).toHaveBeenCalledWith('/vocabulary');
        // Topbar back button and bottom back button both go to the profile.
        fireEvent.click(screen.getAllByText('cefrOverview.back_to_profile')[0]);
        fireEvent.click(screen.getAllByText('cefrOverview.back_to_profile')[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1');
        expect(mockNavigate).toHaveBeenCalledTimes(4);
    });
});
