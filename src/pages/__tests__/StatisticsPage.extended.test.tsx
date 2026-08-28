import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_FORMAT } from '../../types';
import type { Class, GradeScale, Rubric, Student, StudentRubric, AppSettings } from '../../types';

const h = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        version: 0,
        subscribe: (l: () => void) => {
            listeners.add(l);
            return () => {
                listeners.delete(l);
            };
        },
        notify: () => {
            h.version++;
            listeners.forEach((l) => l());
        },
        saveAs: vi.fn(),
        i18n: { language: 'en' },
        t: vi.fn((key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        }),
    };
});

const gradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [
        { min: 90, max: 100, label: 'A', color: '#22c55e' },
        { min: 70, max: 89, label: 'B', color: '#84cc16' },
        { min: 0, max: 69, label: 'F', color: '#ef4444' },
    ],
};

const mkLevel = (id: string, label: string, min: number, max: number) => ({
    id,
    label,
    minPoints: min,
    maxPoints: max,
    description: '',
    subItems: [],
});

const l1 = mkLevel('l1', 'Excellent', 90, 100);
const l2 = mkLevel('l2', 'Good', 70, 89);

const bloomsDesc = {
    descriptorId: 'remember',
    framework: 'blooms' as const,
    categoryId: 'remember',
    categoryLabelEn: 'Remember',
    categoryLabelNl: 'Onthouden',
    categoryColor: '#22c55e',
    descriptionEn: 'Recall facts',
    descriptionNl: 'Feiten herinneren',
};
const ibDesc = {
    descriptorId: 'thinkers',
    framework: 'ib' as const,
    categoryId: 'thinkers',
    categoryLabelEn: 'Thinkers',
    categoryLabelNl: 'Denkers',
    categoryColor: '#a855f7',
    descriptionEn: 'Think critically',
    descriptionNl: 'Kritisch denken',
};

const linkedStandard = {
    guid: 'g1',
    description: 'Can express ideas clearly',
    standardSetTitle: 'CEFR Can-Do',
    jurisdictionTitle: 'Nederland',
};
const c1 = {
    id: 'c1',
    title: 'Content',
    description: '',
    weight: 60,
    levels: [l1, l2],
    frameworkDescriptors: [bloomsDesc],
    linkedStandards: [linkedStandard],
};
const c2 = { id: 'c2', title: 'Voice', description: '', weight: 40, levels: [l1, l2], frameworkDescriptors: [ibDesc] };
const c3r = { id: 'c3', title: 'Organisation', description: '', weight: 50, levels: [l1, l2] };
const c4r = { id: 'c4', title: 'Language', description: '', weight: 50, levels: [l1, l2] };

const mkRubric = (over: Partial<Rubric>): Rubric => ({
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [c1, c2],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    ...over,
});

const r1 = mkRubric({});
const r2 = mkRubric({ id: 'r2', name: 'Presentation Rubric', createdAt: '2024-02-01T00:00:00Z' });
const r3 = mkRubric({ id: 'r3', name: 'Multi-Criteria', criteria: [c3r, c4r, c2] });
const r4 = mkRubric({ id: 'r4', name: 'Checklist', gradeScaleId: 'none', criteria: [] });
const r5 = mkRubric({ id: 'r5', name: 'Unused Rubric', criteria: [] });
const r6 = mkRubric({ id: 'r6', name: 'Legacy Scale', gradeScaleId: 'gs-missing', criteria: [] });
const r7 = mkRubric({
    id: 'r7',
    name: 'No Scale Id',
    gradeScaleId: undefined as unknown as string,
    subject: undefined as unknown as string,
    criteria: [],
});

const cA: Class = { id: 'c1', name: 'Class A' };
const cB: Class = { id: 'c2', name: 'Class B' };
const cC: Class = { id: 'c3', name: 'Class C', voTrack: 'havo' };
const cD: Class = { id: 'c4', name: 'Class D', year: 'jaar-1' };
const cE: Class = { id: 'c5', name: 'Class E' };

const s1: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const s2: Student = { id: 's2', name: 'Bob', classId: 'c2' };
const s3: Student = { id: 's3', name: 'Carol', classId: 'c1' };
const s4: Student = { id: 's4', name: 'Archived', classId: 'c1', archivedAt: '2024-06-01T00:00:00Z' };
const s5: Student = { id: 's5', name: 'Dave', classId: 'c3' };

const mkEntry = (levelId: string) => ({
    criterionId: levelId.startsWith('l') ? 'c1' : 'c1',
    levelId,
    checkedSubItems: [],
    comment: '',
});

const mkSr = (id: string, studentId: string, rubricId: string, over: Partial<StudentRubric> = {}): StudentRubric => ({
    id,
    rubricId,
    studentId,
    entries: [],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-15T00:00:00Z',
    ...over,
});

const sr1 = mkSr('sr1', 's1', 'r1', {
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', checkedSubItems: [], comment: '' },
    ],
});
const sr2 = mkSr('sr2', 's2', 'r1', {
    entries: [
        { criterionId: 'c1', levelId: null, overridePoints: 0, checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: null, overridePoints: 0, checkedSubItems: [], comment: '' },
    ],
});
const sr3 = mkSr('sr3', 's3', 'r1', {
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', checkedSubItems: [], comment: '' },
    ],
});
const srNHI = mkSr('srNHI', 's3', 'r1', { notHandedIn: true, gradedAt: undefined, rubricSnapshot: r1 });
const sr4 = mkSr('sr4', 's1', 'r2', {
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', checkedSubItems: [], comment: '' },
    ],
});
const sr5 = mkSr('sr5', 's2', 'r2', {
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', checkedSubItems: [], comment: '' },
    ],
});
const sr6 = mkSr('sr6', 's2', 'r2', {
    entries: [
        { criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', checkedSubItems: [], comment: '' },
    ],
});
const sr7 = mkSr('sr7', 's1', 'r3', {
    entries: [
        { criterionId: 'c3', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c4', levelId: 'l1', checkedSubItems: [], comment: '' },
        { criterionId: 'c2', levelId: 'l1', checkedSubItems: [], comment: '' },
    ],
});
const sr8 = mkSr('sr8', 's1', 'r4');
const sr9 = mkSr('sr9', 's1', 'r7');
const sr10 = mkSr('sr10', 's1', 'r6');
const sr11 = mkSr('sr11', 's1', 'r-missing');
const sr12 = mkSr('sr12', 's1', 'r2', { gradedAt: undefined });

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const t1 = {
    id: 't1',
    name: 'Grammar Test',
    questions: [{ id: 'q1', prompt: 'Q1', type: 'multiple-choice', points: 10 }],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};
const t2 = {
    id: 't2',
    name: 'Vocabulary Test',
    questions: [{ id: 'q1', prompt: 'Q1', type: 'multiple-choice', points: 5 }],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-02T00:00:00Z',
};

const st1 = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'graded',
    startedAt: '2024-01-10T00:00:00Z',
    submittedAt: '2024-01-11T00:00:00Z',
    gradedAt: '2024-01-12T00:00:00Z',
    rawTotalPoints: 8,
};
const st2 = {
    id: 'st2',
    testId: 't1',
    studentId: 's1',
    answers: [{ questionId: 'q1', response: 'A' }],
    status: 'submitted',
    startedAt: '2024-02-10T00:00:00Z',
    submittedAt: '2024-02-11T00:00:00Z',
    adjustmentPoints: 1,
};
const st3 = {
    id: 'st3',
    testId: 't1',
    studentId: 's2',
    answers: [],
    status: 'graded',
    startedAt: '2024-01-10T00:00:00Z',
    submittedAt: '2024-01-11T00:00:00Z',
    gradedAt: '2024-01-12T00:00:00Z',
    rawTotalPoints: 5,
};
const stMissing = {
    id: 'st4',
    testId: 't-missing',
    studentId: 's1',
    answers: [],
    status: 'graded',
    startedAt: '2024-01-10T00:00:00Z',
    gradedAt: '2024-01-12T00:00:00Z',
};
const st5 = {
    id: 'st5',
    testId: 't1',
    studentId: 's1',
    answers: [],
    status: 'graded',
    startedAt: '2024-04-01T00:00:00Z',
};
const placementTest = {
    id: 'tp1',
    name: 'Placement Test',
    mode: 'placement',
    placementEngine: 'staircase',
    questions: [{ id: 'qp1', prompt: 'P', type: 'multiple-choice', points: 10 }],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-03T00:00:00Z',
};
const stPlacement = {
    id: 'stp1',
    testId: 'tp1',
    studentId: 's1',
    answers: [],
    status: 'graded',
    startedAt: '2024-03-01T00:00:00Z',
    submittedAt: '2024-03-02T00:00:00Z',
    gradedAt: '2024-03-03T00:00:00Z',
    levelPath: [{ sectionId: 'sec', level: 'B1', questionId: 'qp1', correct: true }],
};

const classesArr = [cA, cB, cC, cD, cE];
const studentsArr = [s1, s2, s3, s4, s5];
const studentRubricsArr = [sr1, sr2, srNHI, sr3, sr4, sr5, sr6, sr7, sr8, sr9, sr10, sr11, sr12];
const rubricsArr = [r1, r2, r3, r4, r5, r6, r7];
const masteryTargetsArr = [
    {
        id: 'mt1',
        standardGuid: 'g1',
        standardDescription: 'Can express ideas clearly',
        standardSetTitle: 'CEFR Can-Do',
        year: 'jaar-1',
        targetPercentage: 70,
    },
];
const gradeScalesArr = [gradeScale];
const testsArr: unknown[] = [t1, t2, placementTest];
const studentTestsArr: unknown[] = [st1, st2, st3, stMissing, st5, stPlacement];

const mockUpdateSettings = vi.fn((patch: Partial<AppSettings>) => {
    Object.assign(mockSettings, patch);
    h.notify();
});

const mockAppValue: Record<string, unknown> = {
    rubrics: rubricsArr,
    students: studentsArr,
    classes: classesArr,
    studentRubrics: studentRubricsArr,
    gradeScales: gradeScalesArr,
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    tests: testsArr,
    studentTests: studentTestsArr,
    standardMasteryTargets: masteryTargetsArr,
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

vi.mock('../../context/useStore', async () => {
    const React = await import('react');
    let cacheVersion = -1;
    let cached: unknown;
    return {
        useStoreSelector: (selector: (state: any) => any) => {
            const getSnapshot = () => {
                if (h.version !== cacheVersion) {
                    cached = selector({
                        standardMasteryTargets: [],
                        ...mockAppValue,
                    });
                    cacheVersion = h.version;
                }
                return cached;
            };
            return React.useSyncExternalStore(h.subscribe, getSnapshot, getSnapshot);
        },
    };
});

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
    };
});

vi.mock('file-saver', () => ({
    saveAs: (...args: unknown[]) => h.saveAs(...args),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: h.t,
        i18n: h.i18n,
    }),
}));

let StatisticsPageComp: React.ComponentType;

function renderPage() {
    return render(
        <RouterProvider
            router={createMemoryRouter([{ path: '*', element: <StatisticsPageComp /> }], { initialEntries: ['/'] })}
        />
    );
}

function comboboxWithOption(value: string) {
    return screen
        .getAllByRole('combobox')
        .find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === value))!;
}

async function waitForCharts() {
    await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
}

const fakeCanvasCtx = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
};

describe('StatisticsPage extended', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        Object.assign(mockSettings, {
            defaultGradeScaleId: 'gs1',
            theme: 'dark',
            language: 'en',
            accentColor: '#3b82f6',
            defaultFormat: DEFAULT_FORMAT,
            statisticsCriterionChartType: undefined,
            statisticsDistributionMode: undefined,
            statisticsExcludeNotHandedIn: undefined,
            statsVisiblePresetIds: undefined,
            statsPresetColors: undefined,
            activeClassId: undefined,
        });
        h.notify(); // force the selector-store cache to rebuild with the reset settings
        // PNG export plumbing
        vi.stubGlobal(
            'Image',
            class {
                onload: (() => void) | null = null;
                clientWidth = 120;
                clientHeight = 80;
                set src(_v: string) {
                    this.onload?.();
                }
            }
        );
        HTMLCanvasElement.prototype.getContext = vi.fn(
            () => fakeCanvasCtx as unknown as CanvasRenderingContext2D
        ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.toBlob = vi.fn(
            (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/png' })) as unknown as void
        );
        URL.createObjectURL = vi.fn(() => 'blob:chart') as unknown as typeof URL.createObjectURL;
        URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

        const mod = await import('../StatisticsPage');
        StatisticsPageComp = mod.default;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        mockAppValue.rubrics = rubricsArr;
        h.i18n.language = 'en';
        h.notify();
    });

    it('selects a class to show class goals, trend, and test averages', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'c1' } });
        await waitForCharts();
        // Class trend chart (multiple rubrics graded in c1), class goals and test averages render.
        expect(screen.getByText('statistics.class_trend')).toBeInTheDocument();
        expect(screen.getByText('statistics.class_test_averages')).toBeInTheDocument();
        expect(screen.getAllByText('Grammar Test').length).toBeGreaterThan(0);
        expect(screen.getByText('statistics.lg_title')).toBeInTheDocument();
    });

    it('downloads the roster CSV and exports the criterion chart as PNG', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.download_csv'));
        expect(h.saveAs).toHaveBeenCalledWith(expect.any(Blob), expect.stringContaining('.csv'));
        fireEvent.click(screen.getByTitle('statistics.action_export_chart'));
        await waitForCharts();
        expect(h.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'criterion-chart.png');
        // A null blob (canvas failure) skips the download entirely.
        HTMLCanvasElement.prototype.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null) as unknown as void);
        const before = h.saveAs.mock.calls.length;
        fireEvent.click(screen.getByTitle('statistics.action_export_chart'));
        await waitForCharts();
        expect(h.saveAs.mock.calls.length).toBe(before);
    });

    it('opens and closes the fullscreen criterion chart via button, Escape and overlay', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByTitle('statistics.action_fullscreen'));
        expect(screen.getByText('statistics.action_close_fullscreen')).toBeInTheDocument();
        // A non-Escape key keeps the overlay open (handler runs, branch falls through).
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(screen.getByText('statistics.action_close_fullscreen')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByText('statistics.action_close_fullscreen')).not.toBeInTheDocument();
        // Re-open and close via the button, then the overlay click.
        fireEvent.click(screen.getByTitle('statistics.action_fullscreen'));
        fireEvent.click(screen.getByText('statistics.action_close_fullscreen'));
        expect(screen.queryByText('statistics.action_close_fullscreen')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTitle('statistics.action_fullscreen'));
        // The fixed backdrop closes the overlay on click.
        const overlay = document.querySelector('[style*="position: fixed"]') as HTMLElement;
        fireEvent.click(overlay);
        expect(screen.queryByText('statistics.action_close_fullscreen')).not.toBeInTheDocument();
    });

    it('renders blooms and ib framework charts, including the Dutch language path', async () => {
        h.i18n.language = 'nl';
        renderPage();
        await waitForCharts();
        expect(screen.getByText('statistics.blooms_title')).toBeInTheDocument();
        expect(screen.getByText('statistics.ib_title')).toBeInTheDocument();
        // Dutch labels render when the language is nl.
        expect(screen.getAllByText(/Onthouden/).length).toBeGreaterThan(0);
        h.i18n.language = 'en';
    });

    it('shows the not-handed-in banner and excludes those records when toggled', async () => {
        renderPage();
        await waitForCharts();
        expect(screen.getByText('statistics.not_handed_in')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('statistics.excl_nhi'));
        await waitForCharts();
        expect(screen.getByText('statistics.not_handed_in_excl')).toBeInTheDocument();
    });

    it('switches the distribution to percentage buckets', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.distribution_percentage'));
        await waitForCharts();
        // ScoreHistogram renders (≥2 summaries).
        expect(screen.getByText('statistics.grade_distribution')).toBeInTheDocument();
    });

    it('renders the radar criterion chart type', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.chart_radar'));
        await waitForCharts();
        expect(screen.getByText('statistics.criterion_avg')).toBeInTheDocument();
    });

    it('shows the no-grade-scale empty state for a scale-less rubric', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_rubric'), { target: { value: 'r4' } });
        await waitForCharts();
        expect(screen.getByText('statistics.no_grade_scale')).toBeInTheDocument();
        // A rubric whose grade scale id is missing falls back to the first scale.
        fireEvent.change(screen.getByLabelText('statistics.label_rubric'), { target: { value: 'r6' } });
        await waitForCharts();
        expect(screen.getByText('statistics.stat_average')).toBeInTheDocument();
    });

    it('shows the no-students empty state for an ungraded rubric', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_rubric'), { target: { value: 'r5' } });
        await waitForCharts();
        expect(screen.getByText('statistics.no_students')).toBeInTheDocument();
    });

    it('filters classes by track and year, syncing the class selection', async () => {
        renderPage();
        await waitForCharts();
        // Track filter (c3 has voTrack 'havo').
        const trackSelect = comboboxWithOption('havo');
        fireEvent.change(trackSelect, { target: { value: 'havo' } });
        await waitForCharts();
        // Class filter now only offers c3; select it (kept by the sync effect).
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'c3' } });
        await waitForCharts();
        fireEvent.change(comboboxWithOption('havo'), { target: { value: 'all' } });
        await waitForCharts();
        // Year filter (c4 has year 'jaar-1').
        const yearSelect = comboboxWithOption('jaar-1');
        fireEvent.change(yearSelect, { target: { value: 'jaar-1' } });
        await waitForCharts();
        expect(yearSelect).toHaveValue('jaar-1');
    });

    it('shows compare results, criterion gap, multi-class trend, and insights', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // c1
        fireEvent.click(checkboxes[1]); // c2
        await waitForCharts();
        expect(screen.queryByText('statistics.compare.prompt')).not.toBeInTheDocument();
        expect(screen.getByText('statistics.compare.avg_title')).toBeInTheDocument();
        expect(screen.getByText('statistics.compare.criterion_gap')).toBeInTheDocument();
        expect(screen.getByText('statistics.compare.trend_title')).toBeInTheDocument();
        // Insights toggle.
        fireEvent.click(screen.getByText(/statistics\.insights\.title/));
        expect(screen.getAllByText(/statistics\.insights\./).length).toBeGreaterThan(0);
        // Change the compared rubric.
        fireEvent.change(screen.getByLabelText('statistics.label_rubric'), { target: { value: 'r2' } });
        await waitForCharts();
        // A scale-less compared rubric and a missing-scale one exercise the scale fallbacks.
        fireEvent.change(screen.getByLabelText('statistics.label_rubric'), { target: { value: 'r4' } });
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_rubric'), { target: { value: 'r6' } });
        await waitForCharts();
        // Uncheck c1 to remove it from the comparison (filter path).
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
        await waitForCharts();
    });

    it('shows the compare no-data empty state when classes lack grades', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[2]); // c3 has no graded students
        fireEvent.click(checkboxes[3]); // c4 has no graded students
        await waitForCharts();
        expect(screen.getByText('statistics.compare.no_data')).toBeInTheDocument();
    });

    it('shows student view details, test results, and peer comparison', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        await waitForCharts();
        expect(screen.getByText('statistics.select_student_prompt')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's1' } });
        await waitForCharts();
        // Graded rubrics + test results tables.
        expect(screen.getByText('statistics.graded_rubrics')).toBeInTheDocument();
        expect(screen.getByText('statistics.test_results')).toBeInTheDocument();
        expect(screen.getAllByText('Grammar Test').length).toBeGreaterThan(0);
        // Choose the r1 submission → peer chip for Bob appears.
        fireEvent.change(screen.getByLabelText('statistics.label_rubric_comparison'), { target: { value: 'sr1' } });
        await waitForCharts();
        expect(screen.getByText('statistics.compare_with')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
        await waitForCharts();
        // Deselect the peer again (filter path).
        fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
        await waitForCharts();
        fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
        await waitForCharts();
        // Choose the 3-criterion submission → radar chart (>= 3 criteria).
        fireEvent.change(screen.getByLabelText('statistics.label_rubric_comparison'), { target: { value: 'sr7' } });
        await waitForCharts();
        expect(screen.getByText('statistics.criterion_comparison')).toBeInTheDocument();
    });

    it('shows the student not-graded empty state', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        await waitForCharts();
        // s5 has no student rubrics at all → no graded tables.
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's5' } });
        await waitForCharts();
        expect(screen.getByText('statistics.student_not_graded')).toBeInTheDocument();
    });

    it('filters the student dropdown by class', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'c2' } });
        const select = screen.getByLabelText('statistics.label_student') as HTMLSelectElement;
        const options = Array.from(select.options).map((o) => o.value);
        expect(options).toContain('s2');
        expect(options).not.toContain('s1');
    });

    it('toggles preset visibility and recolors a preset', async () => {
        renderPage();
        await waitForCharts();
        // Each visible preset appears twice: the checkbox label and the grid header.
        const firstCheckbox = screen.getAllByRole('checkbox')[0];
        const presetTitle = firstCheckbox.closest('label')!.textContent!.trim();
        expect(screen.getAllByText(presetTitle).length).toBeGreaterThan(1);
        fireEvent.click(firstCheckbox);
        // Only the checkbox label remains (grid header removed).
        expect(screen.getAllByText(presetTitle).length).toBe(1);
        // Re-check it → header is back.
        fireEvent.click(firstCheckbox);
        expect(screen.getAllByText(presetTitle).length).toBeGreaterThan(1);
        // Change a preset color (rendered when the preset has data).
        const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
        fireEvent.change(colorInput, { target: { value: '#ff0000' } });
        expect(mockSettings.statsPresetColors).toBeDefined();
    });

    it('shows the no-grade-scale empty state in percentage mode with a single summary', async () => {
        renderPage();
        await waitForCharts();
        // Class c2 has exactly one graded submission on r1.
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'c2' } });
        fireEvent.click(screen.getByText('statistics.distribution_percentage'));
        await waitForCharts();
        expect(screen.getByText('statistics.no_grade_scale')).toBeInTheDocument();
        // Switching back to letter mode updates settings.
        fireEvent.click(screen.getByText('statistics.distribution_letter'));
        expect(mockUpdateSettings).toHaveBeenCalledWith({ statisticsDistributionMode: 'letter' });
    });

    it('exports a preset chart as PNG', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_class_filter'), { target: { value: 'c1' } });
        await waitForCharts();
        const exportButtons = screen.getAllByTitle('statistics.export_chart');
        expect(exportButtons.length).toBeGreaterThan(0);
        fireEvent.click(exportButtons[0]);
        await waitForCharts();
        expect(h.saveAs).toHaveBeenCalledWith(expect.any(Blob), expect.stringContaining('.png'));
    });

    it('shows the elo progression chart for a student with placement attempts', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's1' } });
        await waitForCharts();
        expect(screen.getByText('statistics.elo_chart_title')).toBeInTheDocument();
    });

    it('expands a heatmap row to show score, raw and grade details', async () => {
        renderPage();
        await waitForCharts();
        // Student names in the heatmap are toggle buttons.
        const aliceCell = screen.getByRole('button', { name: 'Alice' });
        fireEvent.click(aliceCell);
        expect(screen.getByText(/statistics\.table_score/)).toBeInTheDocument();
        expect(screen.getByText(/statistics\.table_raw/)).toBeInTheDocument();
        // Carol's second row (the not-handed-in submission) includes the NHI marker.
        const carolCells = screen.getAllByRole('button', { name: 'Carol' });
        fireEvent.click(carolCells[1]);
        expect(screen.getAllByText('(NHI)').length).toBeGreaterThan(0);
        // Clicking Carol again collapses the detail.
        fireEvent.click(carolCells[1]);
        expect(screen.queryByText(/statistics\.table_score/)).not.toBeInTheDocument();
    });

    it('prints via the toolbar button and returns to the rubric view', async () => {
        const printSpy = vi.fn();
        vi.stubGlobal('print', printSpy);
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('common.print'));
        expect(printSpy).toHaveBeenCalled();
        // Clicking the rubric view button while already there is a no-op that covers the handler.
        fireEvent.click(screen.getByText('statistics.view_by_rubric'));
        // Switch back to the bar chart type.
        fireEvent.click(screen.getByText('statistics.chart_bar'));
        expect(mockUpdateSettings).toHaveBeenCalledWith({ statisticsCriterionChartType: 'bar' });
    });

    it('renders with no rubrics at all (empty fallbacks)', async () => {
        mockAppValue.rubrics = [];
        renderPage();
        await waitForCharts();
        expect(screen.getByText('statistics.title')).toBeInTheDocument();
        // Compare mode still renders its prompt.
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        expect(screen.getByText('statistics.compare.prompt')).toBeInTheDocument();
    });

    it('disables the class checkbox when four classes are already compared', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        const checkboxes = screen.getAllByRole('checkbox');
        // Select the first four; the fifth becomes disabled.
        for (let i = 0; i < 4; i++) fireEvent.click(checkboxes[i]);
        await waitForCharts();
        const fifth = screen.getAllByRole('checkbox')[4];
        expect(fifth).toBeDisabled();
    });

    it('renders charts with the default accent color when unset', async () => {
        mockSettings.accentColor = undefined as unknown as string;
        h.notify();
        renderPage();
        await waitForCharts();
        expect(screen.getByText('statistics.criterion_avg')).toBeInTheDocument();
        // The radar chart also falls back to the default accent.
        fireEvent.click(screen.getByText('statistics.chart_radar'));
        await waitForCharts();
        expect(screen.getByText('statistics.criterion_avg')).toBeInTheDocument();
        // Student radar also uses the accent color fallback.
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        await waitForCharts();
        fireEvent.change(screen.getByLabelText('statistics.label_student'), { target: { value: 's1' } });
        fireEvent.change(screen.getByLabelText('statistics.label_rubric_comparison'), { target: { value: 'sr7' } });
        await waitForCharts();
        expect(screen.getByText('statistics.criterion_comparison')).toBeInTheDocument();
    });

    it('clears the active class when switching the filter back to all', async () => {
        renderPage();
        await waitForCharts();
        const classSelect = screen.getByLabelText('statistics.label_class_filter');
        fireEvent.change(classSelect, { target: { value: 'c1' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ activeClassId: 'c1' });
        fireEvent.change(classSelect, { target: { value: 'all' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ activeClassId: undefined });
    });

    it('filters compare selections when the track filter hides a class', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // c1
        fireEvent.click(checkboxes[2]); // c3 (havo)
        await waitForCharts();
        // Restricting to havo removes c1 from the comparison but keeps c3.
        fireEvent.change(comboboxWithOption('havo'), { target: { value: 'havo' } });
        await waitForCharts();
        const remaining = screen.getAllByRole('checkbox');
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toBeChecked();
    });
});
