import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import CriterionHeatmap, { pctToColor } from '../CriterionHeatmap';

// ── pctToColor pure function tests ─────────────────────────────────────────────

describe('pctToColor', () => {
    it('returns a reddish colour for 0%', () => {
        const color = pctToColor(0);
        // red(239,68,68) at 0%
        expect(color).toBe('rgb(239,68,68)');
    });

    it('returns a yellowish colour for 50%', () => {
        const color = pctToColor(50);
        expect(color).toBe('rgb(234,179,8)');
    });

    it('returns a greenish colour for 100%', () => {
        const color = pctToColor(100);
        expect(color).toBe('rgb(34,197,94)');
    });

    it('clamps below 0 to 0% colour', () => {
        expect(pctToColor(-10)).toBe(pctToColor(0));
    });

    it('clamps above 100 to 100% colour', () => {
        expect(pctToColor(110)).toBe(pctToColor(100));
    });

    it('produces a different colour at 25% vs 75%', () => {
        expect(pctToColor(25)).not.toBe(pctToColor(75));
    });
});

// ── CriterionHeatmap component tests ──────────────────────────────────────────

const students = [
    { id: 's1', name: 'Alice' },
    { id: 's2', name: 'Bob' },
];
const criteria = [
    { id: 'c1', title: 'Writing' },
    { id: 'c2', title: 'Grammar' },
    { id: 'c3', title: 'Vocabulary' },
];
const scores: Record<string, Record<string, number>> = {
    s1: { c1: 90, c2: 60, c3: 30 },
    s2: { c1: 20, c2: 80, c3: 100 },
};

describe('CriterionHeatmap component', () => {
    it('renders a "No data" message when students array is empty', () => {
        render(<CriterionHeatmap students={[]} criteria={criteria} scores={{}} />);
        expect(screen.getByText(/no data/i)).toBeTruthy();
    });

    it('renders a "No data" message when criteria array is empty', () => {
        render(<CriterionHeatmap students={students} criteria={[]} scores={{}} />);
        expect(screen.getByText(/no data/i)).toBeTruthy();
    });

    it('renders a cell for each student', () => {
        render(<CriterionHeatmap students={students} criteria={criteria} scores={scores} />);
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('renders the criterion titles in the header', () => {
        render(<CriterionHeatmap students={students} criteria={criteria} scores={scores} />);
        expect(screen.getByText('Writing')).toBeTruthy();
        expect(screen.getByText('Grammar')).toBeTruthy();
        expect(screen.getByText('Vocabulary')).toBeTruthy();
    });

    it('renders score percentage text in each cell', () => {
        render(<CriterionHeatmap students={students} criteria={criteria} scores={scores} />);
        expect(screen.getByText('90%')).toBeTruthy();
        expect(screen.getByText('20%')).toBeTruthy();
    });

    it('truncates criterion title longer than 12 characters', () => {
        const longCriteria = [{ id: 'cx', title: 'AverylongtitleXYZ' }];
        render(<CriterionHeatmap students={students} criteria={longCriteria} scores={{}} />);
        // Should show truncated title with ellipsis, not the full string
        expect(screen.queryByText('AverylongtitleXYZ')).toBeNull();
        expect(screen.getByText('Averylongtitl…')).toBeTruthy();
    });

    it('uses greenish background for high-score cells', () => {
        render(
            <CriterionHeatmap
                students={[{ id: 's1', name: 'Alice' }]}
                criteria={[{ id: 'c1', title: 'A' }]}
                scores={{ s1: { c1: 100 } }}
            />
        );
        const cell = screen.getByTitle('Alice — A: 100%');
        // green tone: rgb(34,197,94) — jsdom normalizes to spaced form
        expect(cell.style.background).toBe('rgb(34, 197, 94)');
    });

    it('uses reddish background for low-score cells', () => {
        render(
            <CriterionHeatmap
                students={[{ id: 's1', name: 'Alice' }]}
                criteria={[{ id: 'c1', title: 'A' }]}
                scores={{ s1: { c1: 0 } }}
            />
        );
        const cell = screen.getByTitle('Alice — A: 0%');
        // jsdom normalizes rgb() to spaced form
        expect(cell.style.background).toBe('rgb(239, 68, 68)');
    });

    it('renders 0% when a score is missing from the scores map', () => {
        render(
            <CriterionHeatmap
                students={[{ id: 's1', name: 'Alice' }]}
                criteria={[{ id: 'c1', title: 'A' }]}
                scores={{}}
            />
        );
        expect(screen.getByText('0%')).toBeTruthy();
    });
});
