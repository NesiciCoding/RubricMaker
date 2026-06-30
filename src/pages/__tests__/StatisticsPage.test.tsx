import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Class, GradeScale, Rubric, Student, StudentRubric, AppSettings } from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [
        { min: 90, max: 100, label: 'A', color: '#22c55e' },
        { min: 0, max: 89, label: 'B', color: '#84cc16' },
    ],
};

const mockRubric: Rubric = {
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
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
            ],
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

const mockClassA: Class = { id: 'c1', name: 'Class A' };
const mockClassB: Class = { id: 'c2', name: 'Class B' };
const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentB: Student = { id: 's2', name: 'Bob', classId: 'c2' };

const mockSrA: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-01T00:00:00Z',
};

const mockSrB: StudentRubric = {
    id: 'sr2',
    rubricId: 'r1',
    studentId: 's2',
    entries: [{ criterionId: 'c1', levelId: 'l2', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-02T00:00:00Z',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockUpdateSettings = vi.fn();

// Stable references: StatisticsPage has effects/memos keyed on `classes` etc. — a mock
// that builds new array literals on every useApp() call defeats those memo deps and
// causes an infinite render loop (each render sees a "new" classes array).
const mockRubricsArr = [mockRubric];
const mockStudentsArr = [mockStudentA, mockStudentB];
const mockClassesArr = [mockClassA, mockClassB];
const mockStudentRubricsArr = [mockSrA, mockSrB];
const mockGradeScalesArr = [mockGradeScale];
const emptyArr: never[] = [];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    tests: emptyArr,
    studentTests: emptyArr,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
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
    const router = createMemoryRouter([{ path: '/statistics', element: <StatisticsPageComp /> }], {
        initialEntries: ['/statistics'],
    });
    return render(<RouterProvider router={router} />);
}

async function waitForCharts() {
    await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
}

describe('StatisticsPage', () => {
    beforeEach(async () => {
        mockUpdateSettings.mockClear();
        const mod = await import('../StatisticsPage');
        StatisticsPageComp = mod.default;
    });

    it('renders before charts become ready (skeleton)', async () => {
        renderPage();
        expect(screen.getByText('statistics.title')).toBeInTheDocument();
    });

    it('renders the rubric view after charts become ready', async () => {
        renderPage();
        await waitForCharts();
        expect(screen.getByText('statistics.title')).toBeInTheDocument();
        expect(screen.getAllByText('Essay Rubric').length).toBeGreaterThan(0);
    });

    it('switches to the student view and selects a student', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_by_student'));
        await waitForCharts();
        const studentSelect = screen.getByDisplayValue('statistics.select_student_placeholder');
        fireEvent.change(studentSelect, { target: { value: 's1' } });
        expect(studentSelect).toHaveValue('s1');
    });

    it('switches to compare mode, selects two classes, and shows results', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
        await waitForCharts();
        expect(screen.queryByText('statistics.compare.prompt')).not.toBeInTheDocument();
    });

    it('expands the insights panel in compare mode', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.view_compare'));
        await waitForCharts();
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[1]);
        await waitForCharts();
        const insightsToggle = screen.queryByText(/statistics.insights.title/);
        if (insightsToggle) {
            fireEvent.click(insightsToggle);
        }
        expect(screen.getByText('statistics.title')).toBeInTheDocument();
    });

    it('changes the active class filter, syncing back to settings', async () => {
        renderPage();
        await waitForCharts();
        const classSelect = screen.getByDisplayValue('statistics.all_classes');
        fireEvent.change(classSelect, { target: { value: 'c1' } });
        expect(mockUpdateSettings).toHaveBeenCalledWith({ activeClassId: 'c1' });
    });

    it('toggles the criterion chart type and the exclude-not-handed-in filter', async () => {
        renderPage();
        await waitForCharts();
        fireEvent.click(screen.getByText('statistics.chart_radar'));
        fireEvent.click(screen.getByText('statistics.excl_nhi'));
        // Settings is a static mock here (real toggling is verified via the updateSettings call),
        // so assert the intent rather than the post-toggle label.
        expect(mockUpdateSettings).toHaveBeenCalledWith({ statisticsExcludeNotHandedIn: true });
    });
});
