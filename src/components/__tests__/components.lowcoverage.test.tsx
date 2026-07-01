import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric } from '../../types';

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

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({
            children,
        }: {
            children: React.ReactElement<{ width?: number; height?: number }>;
        }) => React.cloneElement(children, { width: 600, height: 260 }),
    };
});

// ─── ClassCoverageGapPanel ────────────────────────────────────────────────────

import ClassCoverageGapPanel from '../Standards/ClassCoverageGapPanel';
import type { StandardCoverageEntry } from '../../utils/standardsCoverageAggregator';

const mockEntry: StandardCoverageEntry = {
    guid: 'g1',
    statementNotation: 'CCSS.ELA-L1',
    description: 'Read closely to determine what the text says',
    standardSetTitle: 'Common Core ELA',
    jurisdictionTitle: 'Common Core',
    assessed: true,
    rubricCount: 3,
    averagePercentage: 82,
};

const mockGapEntry: StandardCoverageEntry = {
    guid: 'g2',
    statementNotation: 'CCSS.ELA-L2',
    description: 'Determine central ideas of a text',
    standardSetTitle: 'Common Core ELA',
    jurisdictionTitle: 'Common Core',
    assessed: false,
    rubricCount: 0,
    averagePercentage: 0,
};

describe('ClassCoverageGapPanel', () => {
    it('shows empty state when no entries', () => {
        render(<ClassCoverageGapPanel covered={[]} gap={[]} />);
        expect(screen.getByText('activityDashboard.coverage_empty')).toBeInTheDocument();
    });

    it('renders covered and gap sections', () => {
        render(<ClassCoverageGapPanel covered={[mockEntry]} gap={[mockGapEntry]} />);
        expect(screen.getByText('activityDashboard.coverage_gap_title')).toBeInTheDocument();
        expect(screen.getByText('activityDashboard.coverage_covered_title')).toBeInTheDocument();
        expect(screen.getByText('Read closely to determine what the text says')).toBeInTheDocument();
        expect(screen.getByText('Determine central ideas of a text')).toBeInTheDocument();
    });

    it('shows "no gap" message when gap list is empty', () => {
        render(<ClassCoverageGapPanel covered={[mockEntry]} gap={[]} />);
        expect(screen.getByText('activityDashboard.coverage_no_gap')).toBeInTheDocument();
    });

    it('renders badge with percentage for assessed covered entry', () => {
        render(<ClassCoverageGapPanel covered={[mockEntry]} gap={[]} />);
        // Badge shows rounded avg percentage and rubric count interpolation
        expect(screen.getByText(/82%/)).toBeInTheDocument();
    });
});

// ─── LiveDraftPanel ───────────────────────────────────────────────────────────

import LiveDraftPanel from '../Monitor/LiveDraftPanel';

vi.mock('../Monitor/PresenceBadge', () => ({
    default: () => React.createElement('span', { 'data-testid': 'presence-badge' }),
}));

describe('LiveDraftPanel', () => {
    it('renders the student display name', () => {
        render(<LiveDraftPanel displayName="Alice" presence="active" />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByTestId('presence-badge')).toBeInTheDocument();
    });

    it('shows word count when provided', () => {
        render(<LiveDraftPanel displayName="Bob" presence="active" wordCount={42} />);
        expect(screen.getByText(/tests.monitor.draft.word_count/)).toBeInTheDocument();
    });

    it('shows last activity time when provided', () => {
        render(
            <LiveDraftPanel
                displayName="Carol"
                presence="active"
                lastActivityAt="2024-01-15T10:30:00Z"
            />
        );
        expect(screen.getByText(/tests.monitor.draft.last_activity/)).toBeInTheDocument();
    });

    it('shows toggle button when draftText is provided', () => {
        render(<LiveDraftPanel displayName="Dave" presence="active" draftText="Some draft..." />);
        expect(screen.getByLabelText('tests.monitor.draft.toggle_preview')).toBeInTheDocument();
    });

    it('expands to show draft text on toggle click', () => {
        render(<LiveDraftPanel displayName="Eve" presence="active" draftText="Hello world" />);
        fireEvent.click(screen.getByLabelText('tests.monitor.draft.toggle_preview'));
        expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('shows empty draft message when draftText is empty string', () => {
        render(<LiveDraftPanel displayName="Frank" presence="active" draftText="" />);
        fireEvent.click(screen.getByLabelText('tests.monitor.draft.toggle_preview'));
        expect(screen.getByText('tests.monitor.draft.empty')).toBeInTheDocument();
    });
});

// ─── MultiClassTrendChart ─────────────────────────────────────────────────────

import MultiClassTrendChart from '../Statistics/MultiClassTrendChart';
import type { MultiTrendPoint } from '../../utils/classComparisonAggregator';

const trendData: MultiTrendPoint[] = [
    { rubricName: 'Essay 1', date: '2024-01-01', c1: 75, c2: 80 },
    { rubricName: 'Essay 2', date: '2024-02-01', c1: 82, c2: 78 },
];

describe('MultiClassTrendChart', () => {
    it('returns null when data has fewer than 2 points', () => {
        const { container } = render(
            <MultiClassTrendChart
                data={[{ rubricName: 'Essay 1', date: '2024-01-01', c1: 75 }]}
                classIds={['c1']}
                classNames={{ c1: 'Class A' }}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders the chart with 2+ data points', () => {
        const { container } = render(
            <MultiClassTrendChart
                data={trendData}
                classIds={['c1', 'c2']}
                classNames={{ c1: 'Class A', c2: 'Class B' }}
            />
        );
        expect(container.firstChild).not.toBeNull();
    });
});

// ─── RubricVersionDiffModal ───────────────────────────────────────────────────

import RubricVersionDiffModal from '../Modals/RubricVersionDiffModal';

const baseRubric: Omit<Rubric, 'versions'> = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'Base description',
    criteria: [
        {
            id: 'c1',
            title: 'Content',
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

const changedRubric: Omit<Rubric, 'versions'> = {
    ...baseRubric,
    name: 'Essay Rubric v2',
    criteria: [
        { ...baseRubric.criteria[0], title: 'Updated Content' },
        {
            id: 'c2',
            title: 'New Criterion',
            description: '',
            weight: 50,
            levels: [],
        },
    ],
};

describe('RubricVersionDiffModal', () => {
    it('shows no-diff message when rubrics are identical', () => {
        render(<RubricVersionDiffModal from={baseRubric} to={baseRubric} onClose={() => {}} />);
        expect(screen.getByText('rubricBuilder.no_diff_changes')).toBeInTheDocument();
    });

    it('renders diffs when rubrics differ', () => {
        render(<RubricVersionDiffModal from={baseRubric} to={changedRubric} onClose={() => {}} />);
        expect(screen.getByText('rubricBuilder.version_diff')).toBeInTheDocument();
        // 'added' status shown for new criterion
        expect(screen.getByText(/rubricBuilder.diff_added/)).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
        const onClose = vi.fn();
        render(<RubricVersionDiffModal from={baseRubric} to={baseRubric} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
