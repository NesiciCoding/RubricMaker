import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComparativeGradingDefault from '../ComparativeGrading';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Class, Rubric, Student, AppSettings } from '../../types';

// A colleague's rubric (shared, or used in a class we co-teach, migrations 095/096) — NOT in the
// signed-in teacher's own `rubrics` collection, only reachable via useSharedMaterials/
// useOwnOrSharedItem. Covers #1061's "Check that LiveMonitorPage ... "-adjacent proposal item and
// #1062's comparative-grading "Done when": a co-teacher can run comparative grading with the
// owner's rubric, and session settings that write the rubric (pairing, per-student limit) never
// hit a colleague's rubric they may not be able to edit.
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
    // No track, so resolveTier() (src/utils/tieredRubric.ts) resolves both ungraded students (who
    // have no voTrack) to the same tier via the class's `year` alone — otherwise neither resolves
    // to any tier, they fall into separate singleton groups, and the session reports itself
    // complete with zero valid pairs before either control under test ever renders.
    tiered: { tiers: [{ id: 't1', year: 'jaar-1', label: 'Tier 1' }], bands: [] } as unknown as Rubric['tiered'],
    comparativeMatchupLimit: 3,
};

const mockClassA: Class = { id: 'c1', name: 'Class A', year: 'jaar-1' };
const mockStudentA: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentB: Student = { id: 's2', name: 'Bob', classId: 'c1' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSaveStudentRubric = vi.fn();
const mockUpdateRubric = vi.fn();
const mockNavigate = vi.fn();

// The teacher owns no rubrics at all — colleagueRubric only ever arrives through sharing.
const mockAppValue = {
    rubrics: [] as Rubric[],
    students: [mockStudentA, mockStudentB],
    classes: [mockClassA],
    studentRubrics: [],
    attachments: [],
    comparativeMatchups: [],
    saveStudentRubric: mockSaveStudentRubric,
    deleteStudentRubric: vi.fn(),
    addComparativeMatchup: vi.fn(),
    updateRubric: mockUpdateRubric,
    gradeScales: [],
    settings: mockSettings,
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

// Stand in for the colleague's rubric arriving via sharing: `own` is always undefined here
// (mockAppValue.rubrics is empty), so useOwnOrSharedItem resolves straight to colleagueRubric.
vi.mock('../../hooks/useSharedMaterials', () => ({
    useOwnOrSharedItem: () => ({ item: colleagueRubric, entry: undefined, loading: false }),
    useSharedMaterials: () => ({ status: 'ready', items: [], folders: [], connected: true, refresh: vi.fn() }),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
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

function renderAt(path: string) {
    const router = createMemoryRouter(
        [{ path: '/grade-comparative/:classId/:rubricId', element: <ComparativeGradingDefault /> }],
        { initialEntries: [path] }
    );
    return render(<RouterProvider router={router} />);
}

describe('ComparativeGrading — a colleague’s shared/co-taught rubric', () => {
    beforeEach(() => {
        mockSaveStudentRubric.mockClear();
        mockUpdateRubric.mockClear();
        mockNavigate.mockClear();
        vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    it('runs a comparative-grading session with the colleague’s rubric', () => {
        renderAt('/grade-comparative/c1/colleague-r');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    });

    it('disables the pairing control — a session setting that writes the rubric — for a rubric we don’t own', () => {
        renderAt('/grade-comparative/c1/colleague-r');
        const pairingSelect = screen.getByDisplayValue('comparativeGrading.pairing_tier');
        expect(pairingSelect).toBeDisabled();
        fireEvent.change(pairingSelect, { target: { value: 'all' } });
        expect(mockUpdateRubric).not.toHaveBeenCalled();
    });

    it('never persists the per-student matchup limit back to a colleague’s rubric', () => {
        renderAt('/grade-comparative/c1/colleague-r');
        const limitInput = screen.getByTitle('comparativeGrading.per_student_limit_hint');
        fireEvent.change(limitInput, { target: { value: '5' } });
        fireEvent.blur(limitInput);
        expect(mockUpdateRubric).not.toHaveBeenCalled();
    });
});
