import React from 'react';
import { screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { Class, GradeScale, Rubric, Student, StudentRubric, AppSettings } from '../../types';

// A co-teacher's statistics page must name/group grades given with the class owner's rubric too
// (#1062's "Done when": "Statistics ... list and filter by colleague rubrics used in co-taught
// classes") — the teacher owns no rubrics at all here; `colleagueRubric` only ever arrives via
// useSharedMaterials (shared, or used in a co-taught class, migrations 095/096).
const colleagueRubric: Rubric = {
    id: 'colleague-r',
    name: "Ann's Rubric",
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
};

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockClassA: Class = { id: 'c1', name: 'Class A' };
const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockSrA: StudentRubric = {
    id: 'sr1',
    rubricId: 'colleague-r',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-01T00:00:00Z',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const emptyArr: never[] = [];
const mockAppValue = {
    rubrics: [] as Rubric[],
    students: [mockStudentA],
    classes: [mockClassA],
    studentRubrics: [mockSrA],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    updateSettings: vi.fn(),
    tests: emptyArr,
    studentTests: emptyArr,
};

vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: unknown) => unknown) =>
        selector({ standardMasteryTargets: [], essayAssignments: [], ...mockAppValue }),
}));

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

vi.mock('../../hooks/useSharedMaterials', () => ({
    useSharedMaterials: (kind: 'rubric' | 'test') => ({
        status: 'ready',
        connected: true,
        items: kind === 'rubric' ? [{ item: colleagueRubric, ownerId: 'ann', ownerName: 'Ann', access: 'view' }] : [],
        folders: [],
        refresh: vi.fn(),
        save: vi.fn(),
    }),
}));

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let StatisticsPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<StatisticsPageComp />);
}

async function waitForCharts() {
    await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
}

describe('StatisticsPage — a colleague’s shared/co-taught rubric', () => {
    beforeEach(async () => {
        const mod = await import('../StatisticsPage');
        StatisticsPageComp = mod.default;
    });

    it('names and shows grades given with the class owner’s rubric, not just my own', async () => {
        renderPage();
        await waitForCharts();
        expect(screen.getAllByText("Ann's Rubric").length).toBeGreaterThan(0);
    });
});
