import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Rubric, StudentRubric } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    schoolId: 'school-1',
};

const students = [{ id: 's1', name: 'Alice', classId: 'c1' }];

const mocks = vi.hoisted(() => ({
    getModerationQueue: vi.fn(),
    buildReconciledEntries: vi.fn(),
    fetchSchoolMembers: vi.fn(),
    saveStudentRubric: vi.fn(),
    deletePeerReview: vi.fn(),
}));

const state = vi.hoisted(() => ({
    isConnected: true,
    schoolId: 'school-1',
    rubrics: [] as Rubric[],
    studentRubrics: [] as StudentRubric[],
    peerReviews: [] as StudentRubric[],
}));

const makeAppContextMock = () => ({
    rubrics: state.rubrics,
    studentRubrics: state.studentRubrics,
    peerReviews: state.peerReviews,
    students,
    settings: { ...mockSettings, schoolId: state.schoolId },
    saveStudentRubric: mocks.saveStudentRubric,
    deletePeerReview: mocks.deletePeerReview,
    fetchSchoolMembers: mocks.fetchSchoolMembers,
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: Record<string, unknown>) => unknown) => selector(makeAppContextMock()),
    useStoreActions: () => makeAppContextMock(),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: state.isConnected }),
}));

vi.mock('../../utils/coGradingModerationQueue', () => ({
    getModerationQueue: mocks.getModerationQueue,
    buildReconciledEntries: mocks.buildReconciledEntries,
    DEFAULT_MODERATION_THRESHOLD_POINTS: 3,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const item = (id: string, secondMarkerId: string, gradedAt: string | undefined, studentId = 's1') => ({
    rubricId: 'r1',
    studentId,
    baseline: { id: 'b1', rubricId: 'r1', studentId, entries: [], overallComment: '', isPeerReview: false },
    secondMarkerEntry: {
        id,
        rubricId: 'r1',
        studentId,
        entries: [],
        overallComment: '',
        isPeerReview: true,
        gradedBy: secondMarkerId,
        ...(gradedAt ? { gradedAt } : {}),
    },
    secondMarkerId,
    criteria: [
        { criterionId: 'c1', title: 'Argument', baselinePoints: 1, secondMarkerPoints: 4, delta: 3 },
        { criterionId: 'c2', title: 'Style', baselinePoints: 2, secondMarkerPoints: 2, delta: 0 },
    ],
    totalAbsDelta: 3,
});

beforeEach(() => {
    state.isConnected = true;
    state.schoolId = 'school-1';
    state.rubrics = [];
    state.studentRubrics = [];
    state.peerReviews = [];
    mocks.saveStudentRubric.mockClear();
    mocks.deletePeerReview.mockClear();
    mocks.fetchSchoolMembers.mockResolvedValue([
        { id: 'col1', displayName: 'Dr. Doe', email: 'd@x' },
        { id: 'col2', displayName: '', email: 'e@x' },
        { id: 'col3', displayName: '', email: '' },
    ]);
    mocks.getModerationQueue.mockReturnValue([
        item('sm3', 'col3', daysAgo(0.04)), // ~1h ago → no badge color
        item('sm1', 'col1', daysAgo(10)), // oldest → sorts first, red
        item('sm2', 'col2', daysAgo(3)), // yellow
        item('sm4', 'col1', undefined, 's2'), // no gradedAt → no badge, student fallback
        item('sm5', 'col1', undefined, 's3'), // second no-gradedAt item → sort `?? ''` on both operands
    ]);
});

describe('ModerationQueuePage coverage', () => {
    it('loads colleagues, resolves names, sorts by pending age, and renders badges', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);

        expect(mocks.fetchSchoolMembers).toHaveBeenCalledWith('school-1');
        // wait for the colleague fetch to resolve and re-render
        await waitFor(() => {
            expect(mocks.getModerationQueue).toHaveBeenCalledWith([], [], [], students, 3, ['col1', 'col2', 'col3']);
        });
        // reviewer names: displayName, email fallback, id fallback
        expect(screen.getAllByText(/Dr\. Doe/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/e@x/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/col3/).length).toBeGreaterThan(0);
        // unknown student → id fallback
        expect(screen.getAllByText(/s2/).length).toBeGreaterThan(0);

        // queue sorted oldest-first: sm1 (10d) is the first card
        const names = screen.getAllByText(/Dr\. Doe|e@x|col3/);
        expect(names[0]).toHaveTextContent(/Dr\. Doe/);

        // pending-days badges for 10 and 3 days; the 1-hour item has no colored badge; no-gradedAt item has none
        expect(screen.getByText('coGrading.pending_days:{"count":10}')).toBeInTheDocument();
        expect(screen.getByText('coGrading.pending_days:{"count":3}')).toBeInTheDocument();
        expect(screen.getByText('coGrading.pending_days:{"count":0}')).toBeInTheDocument();
        expect(screen.getAllByText('coGrading.pending_days:{"count":0}')).toHaveLength(1);

        // delta badge + zero-delta criterion renders
        expect(screen.getAllByText('coGrading.delta_badge:{"delta":"3.0"}').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Style').length).toBeGreaterThan(0);
    });

    it('passes colleague ids to the queue and clears colleagues without a school id', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        const r1 = renderWithRouter(<ModerationQueuePage />);
        await waitFor(() => {
            expect(mocks.getModerationQueue).toHaveBeenCalledWith([], [], [], students, 3, ['col1', 'col2', 'col3']);
        });
        r1.unmount();

        // connected but no school id → colleagues cleared → colleagueIds undefined
        state.schoolId = '';
        mocks.getModerationQueue.mockReturnValue([item('sm5', 'solo', daysAgo(2))]);
        renderWithRouter(<ModerationQueuePage />);
        await waitFor(() => {
            expect(mocks.getModerationQueue).toHaveBeenCalledWith([], [], [], students, 3, undefined);
        });
        expect(screen.getAllByText(/solo/).length).toBeGreaterThan(0);
    });

    it('clamps an invalid threshold input to 0', async () => {
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        const input = screen.getByLabelText('coGrading.threshold_label');
        fireEvent.change(input, { target: { value: 'abc' } });
        expect(input).toHaveValue(0);
    });

    it('renders the rubric name, keeps the baseline, and navigates to the grade page', async () => {
        state.rubrics = [
            {
                id: 'r1',
                name: 'Essay Rubric',
                subject: 'writing',
                description: '',
                criteria: [],
                gradeScaleId: 'gs1',
                format: DEFAULT_FORMAT,
                attachmentIds: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                totalMaxPoints: 10,
                scoringMode: 'weighted-percentage',
            },
        ];
        mocks.getModerationQueue.mockReturnValue([item('sm1', 'col1', daysAgo(10))]);
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        const router = createMemoryRouter([{ path: '*', element: <ModerationQueuePage /> }], {
            initialEntries: ['/'],
        });
        render(<RouterProvider router={router} />);
        await waitFor(() => expect(mocks.getModerationQueue).toHaveBeenCalled());

        // rubric name renders (rubrics.find callback hits)
        expect(screen.getAllByText(/Essay Rubric/).length).toBeGreaterThan(0);

        // view baseline → navigate to the grade page
        fireEvent.click(screen.getByText('coGrading.action_view_baseline'));
        expect(router.state.location.pathname).toBe('/rubrics/r1/grade/s1');

        // keep baseline → delete the second-marker entry
        fireEvent.click(screen.getByText('coGrading.action_keep_baseline'));
        expect(mocks.deletePeerReview).toHaveBeenCalledWith('sm1');
    });

    it('accepts the second marker and saves the merged baseline', async () => {
        state.peerReviews = [
            {
                id: 'sm1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '', selectedPoints: 4 }],
                overallComment: 'Needs work',
                globalModifier: { type: 'points', value: -1, reason: '' },
                isPeerReview: true,
                gradedBy: 'col1',
                gradedAt: daysAgo(10),
            },
        ];
        state.studentRubrics = [
            {
                id: 'b1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '', selectedPoints: 1 }],
                overallComment: 'Baseline',
                isPeerReview: false,
            },
        ];
        mocks.getModerationQueue.mockReturnValue([item('sm1', 'col1', daysAgo(10))]);
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        await waitFor(() => expect(mocks.getModerationQueue).toHaveBeenCalled());

        fireEvent.click(screen.getByText('coGrading.action_accept_second_marker'));
        expect(mocks.saveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'b1',
                entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '', selectedPoints: 4 }],
                overallComment: 'Needs work',
                globalModifier: { type: 'points', value: -1, reason: '' },
            })
        );
        expect(mocks.deletePeerReview).toHaveBeenCalledWith('sm1');
    });

    it('reconciles the baseline via the modal and cancels', async () => {
        mocks.buildReconciledEntries.mockReturnValue([{ criterionId: 'c1', points: 3 }]);
        mocks.getModerationQueue.mockReturnValue([item('sm1', 'col1', daysAgo(10))]);
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        await waitFor(() => expect(mocks.getModerationQueue).toHaveBeenCalled());

        fireEvent.click(screen.getByText('coGrading.action_reconcile'));
        expect(screen.getByText('coGrading.reconcile_modal_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('coGrading.action_confirm_reconcile'));
        expect(mocks.saveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'b1', entries: [{ criterionId: 'c1', points: 3 }] })
        );
        expect(mocks.deletePeerReview).toHaveBeenCalledWith('sm1');
        expect(screen.queryByText('coGrading.reconcile_modal_title')).toBeNull();

        // cancel arm closes the modal without saving
        fireEvent.click(screen.getByText('coGrading.action_reconcile'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('coGrading.reconcile_modal_title')).toBeNull();
    });

    it('shows the empty state when the queue has no items', async () => {
        mocks.getModerationQueue.mockReturnValue([]);
        const { default: ModerationQueuePage } = await import('../ModerationQueuePage');
        renderWithRouter(<ModerationQueuePage />);
        expect(await screen.findByText('coGrading.moderation_empty')).toBeInTheDocument();
        expect(screen.getByText('coGrading.moderation_empty_desc')).toBeInTheDocument();
    });
});
