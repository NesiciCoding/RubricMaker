import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student } from '../../types';

const mockClassA: Class = { id: 'c1', name: 'Class A', year: 'jaar-3', voTrack: 'vwo' };
const mockClassB: Class = { id: 'c2', name: 'Class B' };
const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentB: Student = { id: 's2', name: 'Zoe', classId: 'c2' };
const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

function makeCell(skill: string, level: string, opts: Partial<Record<string, unknown>> = {}) {
    return {
        skill,
        level,
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
        ...opts,
    };
}

const richCells = [
    makeCell('reading', 'A2', { totalDescriptors: 2, state: 'not-started' }),
    makeCell('reading', 'B1', {
        rubricCount: 3,
        avgScore: 82,
        threshold: 70,
        rubricAchieved: true,
        state: 'achieved',
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
    }),
    makeCell('listening', 'A2', {
        rubricCount: 1,
        avgScore: 55,
        threshold: 70,
        state: 'developing',
    }),
    makeCell('writing', 'B2', { rubricCount: 2, avgScore: 91, threshold: 80, state: 'achieved' }),
    makeCell('speaking_production', 'B1', { totalDescriptors: 4, confidentCount: 1, state: 'not-started' }),
];

const richOverview = {
    cells: richCells,
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
    cells: [makeCell('reading', 'B1')],
    cellMap: new Map(),
    standardSets: [],
    skillsWithRubricData: 0,
    overallConfidenceRate: 0,
    standardsCovered: 0,
    practiceCefrProgress: [],
};

const mockNavigate = vi.fn();
const mockGetOverview = vi.fn();

const mockI18n: Record<string, unknown> = { language: 'en' };

const gridProps: Record<string, unknown> = {};

const mockState: Record<string, unknown> = {
    students: [mockStudentA, mockStudentB],
    classes: [mockClassA, mockClassB],
    studentRubrics: [],
    rubrics: [],
    selfAssessments: [],
    analysisResults: [],
    tests: [],
    studentTests: [],
    settings: mockSettings,
};

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

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../utils/cefrStudentAggregator', async () => {
    const actual = await vi.importActual('../../utils/cefrStudentAggregator');
    return { ...actual, getCefrStudentOverview: mockGetOverview };
});

vi.mock('react-joyride', () => ({
    Joyride: (props: { onEvent: (data: { status: string }) => void }) => {
        joyride.onEvent = props.onEvent;
        return null;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

const { joyride } = vi.hoisted(() => ({
    joyride: { onEvent: null as null | ((data: { status: string }) => void) },
}));

vi.mock('../../components/CEFR/CefrOverviewGrid', () => ({
    default: (props: Record<string, unknown>) => {
        gridProps.cells = props.cells;
        gridProps.targetLevel = props.targetLevel;
        gridProps.lang = props.lang;
        return React.createElement('div', { 'data-testid': 'cefr-grid' });
    },
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

function loadPage() {
    return render(
        <MemoryRouter>
            <PageComp />
        </MemoryRouter>
    );
}

describe('CefrOverviewPage coverage', () => {
    beforeEach(async () => {
        mockNavigate.mockClear();
        joyride.onEvent = null;
        mockI18n.language = 'en';
        mockState.students = [mockStudentA, mockStudentB];
        mockState.classes = [mockClassA, mockClassB];
        gridProps.cells = undefined;
        gridProps.targetLevel = undefined;
        gridProps.lang = undefined;
        mockGetOverview.mockReset();
        mockGetOverview.mockImplementation((studentId: string) => (studentId === 's1' ? richOverview : emptyOverview));
        const mod = await import('../CefrOverviewPage');
        PageComp = mod.default;
    });

    it('renders the class view with skill cards, table, track badges, and navigation', () => {
        loadPage();
        expect(screen.getByText('cefrOverview.class_levels_title')).toBeInTheDocument();
        // Skill cards — the four skills with data get badges, speaking_interaction has none.
        expect(screen.getByText('cefr.skills.reading')).toBeInTheDocument();
        expect(screen.getAllByText('—').length).toBeGreaterThan(0); // speaking_interaction no-data card
        // Table rows with student names and class/track info.
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Zoe')).toBeInTheDocument();
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
        expect(screen.getByText('VWO')).toBeInTheDocument();
        // Overall level badge (A2 = weakest of Alice's skills) and progress status.
        expect(screen.getAllByText('A2').length).toBeGreaterThan(0);
        expect(screen.getByText('cefr.progress_status_on_track')).toBeInTheDocument();
        // Legend labels.
        expect(screen.getByText('cefr.legend_achieved')).toBeInTheDocument();
        expect(screen.getByText('cefr.legend_developing')).toBeInTheDocument();
        expect(screen.getByText('cefr.legend_not_started')).toBeInTheDocument();
        expect(screen.getByText('cefr.legend_target_level')).toBeInTheDocument();
        // Detail button navigates to the student's CEFR overview.
        fireEvent.click(screen.getByLabelText('cefrOverview.open_student_detail:{"name":"Alice"}'));
        expect(mockNavigate).toHaveBeenCalledWith('/students/s1/cefr-overview');
    });

    it('filters the class view by class, handles nameless students, and shows the no-students state', () => {
        // A nameless student (undefined name) exercises the name ?? '' fallbacks in the sort.
        mockState.students = [
            mockStudentA,
            { id: 's3', name: undefined as unknown as string, classId: 'c2' },
            mockStudentB,
        ];
        loadPage();
        // Filter to Class B → Zoe (and the nameless student) remain.
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'c2' } });
        expect(screen.getByText('Zoe')).toBeInTheDocument();
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
        // A class with no students → empty state.
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'all' } });
        mockState.students = [];
        // Re-render with no students at all.
        const { unmount } = render(
            <MemoryRouter>
                <PageComp />
            </MemoryRouter>
        );
        expect(screen.getAllByText('cefr.empty_no_students').length).toBeGreaterThan(0);
        unmount();
    });

    it('shows the student view with the header, stats, radar, grid, and panels', () => {
        loadPage();
        fireEvent.click(screen.getByText('cefr.view_student'));
        // Placeholder prompt before a student is selected.
        expect(screen.getByText('cefrOverview.select_student_prompt')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's1' } });
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Class A').length).toBeGreaterThan(0);
        expect(screen.getByText('VWO')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.target_level_label:')).toBeInTheDocument();
        expect(screen.getAllByText('B2').length).toBeGreaterThan(0); // vwo target level
        // Stat cards.
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('67%')).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        // Radar (3 rubric cells), grid with target + lang, practice + standards panels.
        expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
        expect(screen.getByTestId('cefr-grid')).toBeInTheDocument();
        expect((gridProps.cells as unknown[]).length).toBe(5);
        expect(gridProps.targetLevel).toBe('B2');
        expect(gridProps.lang).toBe('en');
        expect(screen.getByTestId('practice-panel')).toBeInTheDocument();
        expect(screen.getByTestId('standards-panel')).toBeInTheDocument();
        // Switching back to class view re-renders the table.
        fireEvent.click(screen.getByText('cefr.view_class'));
        expect(screen.getByText('cefrOverview.class_levels_title')).toBeInTheDocument();
    });

    it('shows the empty grid for a student with no CEFR data', () => {
        loadPage();
        fireEvent.click(screen.getByText('cefr.view_student'));
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's2' } });
        expect(screen.getByText('cefrOverview.empty_no_cefr')).toBeInTheDocument();
        expect(screen.queryByTestId('cefr-grid')).not.toBeInTheDocument();
        expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
        expect(screen.queryByTestId('standards-panel')).not.toBeInTheDocument();
        // The practice panel still renders for any selected student.
        expect(screen.getByTestId('practice-panel')).toBeInTheDocument();
    });

    it('closes the tour on finish and skip and ignores other statuses', () => {
        loadPage();
        fireEvent.click(screen.getByText('tutorial.cefr_tour_button'));
        expect(joyride.onEvent).not.toBeNull();
        act(() => {
            joyride.onEvent!({ status: 'finished' });
        });
        act(() => {
            joyride.onEvent!({ status: 'skipped' });
        });
        act(() => {
            joyride.onEvent!({ status: 'tooltip:close' });
        });
        expect(screen.getByText('tutorial.cefr_tour_button')).toBeInTheDocument();
    });

    it('uses Dutch labels and grid language when the interface is nl', () => {
        mockI18n.language = 'nl';
        loadPage();
        fireEvent.click(screen.getByText('cefr.view_student'));
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's1' } });
        expect(gridProps.lang).toBe('nl');
    });
});
