import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PracticeCefrProgressPanel from '../PracticeCefrProgressPanel';
import type { PracticeCefrCell } from '../../../utils/cefrStudentAggregator';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    }),
}));

const cells: PracticeCefrCell[] = [
    { skill: 'reading', level: 'A2', attemptCount: 3, avgScore: 74.2, bestScore: 88, lastAttemptAt: '2024-01-01' },
    { skill: 'writing', level: 'B1', attemptCount: 1, avgScore: 50, bestScore: 50, lastAttemptAt: '2024-01-02' },
];

describe('PracticeCefrProgressPanel', () => {
    it('renders nothing for an empty cell list', () => {
        const { container } = render(<PracticeCefrProgressPanel cells={[]} lang="en" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders a row per cell with level, skill label, and rounded stats', () => {
        render(<PracticeCefrProgressPanel cells={cells} lang="en" />);
        expect(screen.getByText('cefrOverview.practice_title')).toBeInTheDocument();
        expect(screen.getByText('A2')).toBeInTheDocument();
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.getByText('Writing')).toBeInTheDocument();
        expect(screen.getByText('cefrOverview.practice_stats:{"avg":74,"best":88,"count":3}')).toBeInTheDocument();
    });

    it('uses the Dutch skill label for lang="nl"', () => {
        render(<PracticeCefrProgressPanel cells={cells} lang="nl" />);
        expect(screen.getByText('Lezen')).toBeInTheDocument();
    });
});
