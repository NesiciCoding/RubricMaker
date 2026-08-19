import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric } from '../../types';

const mocks = vi.hoisted(() => ({
    aggregatePeerReviews: vi.fn(),
}));

vi.mock('../../utils/peerReviewAggregator', () => ({
    aggregatePeerReviews: mocks.aggregatePeerReviews,
}));

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'Assess the essay',
    criteria: [{ id: 'c1', title: 'Structure', description: '', weight: 100, levels: [] }],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '',
    updatedAt: '',
    totalMaxPoints: 10,
    scoringMode: 'weighted-percentage',
};

const baseAnalytics = {
    totalReviews: 4,
    totalComparisons: 3,
    totalMissingBaseline: 2,
    criteria: [
        { criterionId: 'c1', commentCount: 5 },
        { criterionId: 'c2', commentCount: 1 },
    ],
    reviewers: [
        { reviewerId: 's2', reviewCount: 3, consistency: 0.857, leniencyBias: 0.123 },
        { reviewerId: 'anon', reviewCount: 1, consistency: null, leniencyBias: null },
        { reviewerId: 'neg', reviewCount: 1, consistency: 0.5, leniencyBias: -0.2 },
    ],
    rounds: [
        { round: 1, consistency: 0.8, leniencyBias: -0.1 },
        { round: 2, consistency: null, leniencyBias: 0.2 },
        { round: 3, consistency: 0.5, leniencyBias: null },
    ],
};

const oneRoundAnalytics = {
    ...baseAnalytics,
    rounds: [{ round: 1, consistency: 0.7, leniencyBias: 0 }],
};

let mockUseApp: any;
const mockNavigate = vi.fn();

vi.mock('../../context/AppContext', () => ({
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

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && 'count' in opts) return `${key} (${opts.count})`;
            if (opts && 'n' in opts) return `${key} ${opts.n}`;
            if (opts && 'rubricName' in opts) return `${key}: ${opts.rubricName}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

function renderPage(initialEntries: string[] = ['/peer-analytics/r1']) {
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <Routes>
                <Route path="/peer-analytics/:rubricId" element={<PeerReviewAnalyticsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

let PeerReviewAnalyticsPage: React.ComponentType;

beforeEach(async () => {
    mockNavigate.mockClear();
    mocks.aggregatePeerReviews.mockReturnValue(baseAnalytics);
    mockUseApp = {
        settings: { theme: 'dark', overdueReminderThreshold: 7 },
        updateSettings: vi.fn(),
        rubrics: [mockRubric],
        students: [{ id: 's2', name: 'Bob', classId: 'c1' }],
        peerReviews: [
            { id: 'pr1', round: 1 },
            { id: 'pr2', round: 2 },
            { id: 'pr3' }, // no round field → defaults to 1
        ],
        studentRubrics: [],
    };
    PeerReviewAnalyticsPage = (await import('../PeerReviewAnalyticsPage')).default;
});

describe('PeerReviewAnalyticsPage coverage', () => {
    it('renders the full analytics with round filter, reviewer rows, and trend', () => {
        renderPage();
        expect(screen.getByText('peerAnalytics.title: Essay Rubric')).toBeInTheDocument();
        // missing baseline badge
        expect(screen.getByText('peerAnalytics.missing_baseline (2)')).toBeInTheDocument();
        // reviewer rows: resolved name, toFixed values, no-baseline fallbacks, positive bias sign
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('0.86')).toBeInTheDocument();
        expect(screen.getByText('+0.12')).toBeInTheDocument();
        expect(screen.getAllByText('peerAnalytics.no_baseline')).toHaveLength(2);
        // negative leniency renders with the minus sign already in toFixed
        expect(screen.getByText('-0.20')).toBeInTheDocument();
        // round buttons (round 3's null leniency exercises the trend `: 0` fallback)
        expect(screen.getByText('peerReview.round_n 1')).toBeInTheDocument();
        expect(screen.getByText('peerReview.round_n 2')).toBeInTheDocument();
        expect(screen.getByText('peerReview.round_n 3')).toBeInTheDocument();
        // two rounds → trend chart renders
        expect(screen.getByText('peerAnalytics.round_trend')).toBeInTheDocument();
    });

    it('filters by round via the selector buttons', () => {
        renderPage();
        fireEvent.click(screen.getByText('peerReview.round_n 1'));
        // the last aggregation ran on the round-filtered reviews (StrictMode may double-invoke earlier ones)
        const calls = mocks.aggregatePeerReviews.mock.calls;
        const last = calls[calls.length - 1];
        expect(last[1].some((pr: { round?: number }) => pr.round === 2)).toBe(false);
        // the all-rounds button re-selects everything (the memo short-circuits, no new call)
        const callsBefore = mocks.aggregatePeerReviews.mock.calls.length;
        fireEvent.click(screen.getByText('peerAnalytics.all_rounds'));
        expect(mocks.aggregatePeerReviews.mock.calls.length).toBe(callsBefore);
    });

    it('hides the trend chart for a single-round analytics', () => {
        mocks.aggregatePeerReviews.mockReturnValue(oneRoundAnalytics);
        renderPage();
        expect(screen.getByText('peerReview.round_n 1')).toBeInTheDocument();
        expect(screen.queryByText('peerAnalytics.round_trend')).not.toBeInTheDocument();
    });

    it('shows the empty state when analytics reports no reviews', () => {
        mocks.aggregatePeerReviews.mockReturnValue({ ...baseAnalytics, totalReviews: 0 });
        renderPage();
        expect(screen.getByText('peerAnalytics.empty_state')).toBeInTheDocument();
    });

    it('renders anonymous reviewer rows without a reviewer id', () => {
        mocks.aggregatePeerReviews.mockReturnValue({
            ...baseAnalytics,
            reviewers: [
                { reviewerId: undefined, reviewCount: 1, consistency: 0.5, leniencyBias: 0.1 },
                ...baseAnalytics.reviewers,
            ],
        });
        renderPage();
        expect(screen.getAllByText('peerAnalytics.anonymous_reviewer').length).toBeGreaterThan(0);
        expect(screen.getByText('peerAnalytics.missing_baseline (2)')).toBeInTheDocument();
    });

    it('shows the no-reviewers state and the not-found back button', () => {
        mocks.aggregatePeerReviews.mockReturnValueOnce({ ...baseAnalytics, reviewers: [] });
        renderPage();
        expect(screen.getByText('peerAnalytics.no_reviewers')).toBeInTheDocument();
        expect(screen.queryByText('Bob')).not.toBeInTheDocument();

        mockUseApp = { ...mockUseApp, rubrics: [] };
        renderPage(['/peer-analytics/unknown']);
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
});
