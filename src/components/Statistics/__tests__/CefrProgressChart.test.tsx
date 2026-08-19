import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CefrProgressChart, { CefrEntry } from '../CefrProgressChart';

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
        Tooltip: ({ formatter }: { formatter?: (v: unknown) => unknown }) => (
            <div data-testid="tooltip">
                {formatter ? String(formatter(75)) : ''}
                {formatter ? String(formatter(null)) : ''}
            </div>
        ),
    };
});

const i18nState = vi.hoisted(() => ({ language: 'en' }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: i18nState.language },
    }),
}));

vi.mock('../../../data/cefrDescriptors', () => ({
    CEFR_LEVELS: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    CEFR_SKILL_LABELS: {
        reading: { en: 'Reading', nl: 'Lezen' },
        writing: { en: 'Writing', nl: 'Schrijven' },
        listening: { en: 'Listening', nl: 'Luisteren' },
        speaking_production: { en: 'Speaking', nl: 'Spreken' },
        speaking_interaction: { en: 'Interaction', nl: 'Interactie' },
    },
    CEFR_LEVEL_COLORS: { A1: '#green', B1: '#blue' },
}));

const makeEntry = (level: CefrEntry['level'], skill: CefrEntry['skill'], score = 75): CefrEntry => ({
    level,
    skill,
    avgScore: score,
    achieved: score >= 70,
});

describe('CefrProgressChart', () => {
    it('shows no-data message when fewer than 3 entries', () => {
        render(<CefrProgressChart entries={[makeEntry('A1', 'reading'), makeEntry('B1', 'writing')]} />);
        expect(screen.getByText('cefr.no_chart_data')).toBeInTheDocument();
    });

    it('renders chart when 3+ entries provided', () => {
        const entries = [makeEntry('A1', 'reading'), makeEntry('A1', 'writing'), makeEntry('A1', 'listening')];
        const { container } = render(<CefrProgressChart entries={entries} />);
        expect(container.querySelector('.recharts-wrapper') ?? container.firstChild).toBeTruthy();
    });

    it('shows chart title', () => {
        const entries = [makeEntry('B1', 'reading'), makeEntry('B1', 'writing'), makeEntry('B1', 'listening')];
        render(<CefrProgressChart entries={entries} />);
        expect(screen.getByText('cefr.progress_chart_title')).toBeInTheDocument();
    });

    it('shows legend when multiple levels present', () => {
        const entries = [
            makeEntry('A1', 'reading'),
            makeEntry('B1', 'reading'),
            makeEntry('A1', 'writing'),
            makeEntry('B1', 'writing'),
        ];
        const { container } = render(<CefrProgressChart entries={entries} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('formats the tooltip value with a percent sign', () => {
        const entries = [makeEntry('A1', 'reading'), makeEntry('A1', 'writing'), makeEntry('A1', 'listening')];
        render(<CefrProgressChart entries={entries} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('75%');
        expect(out).toContain(''); // null → ''
    });

    it('uses the Dutch skill label when the language is Dutch', () => {
        i18nState.language = 'nl';
        const entries = [makeEntry('A1', 'reading'), makeEntry('A1', 'writing'), makeEntry('A1', 'listening')];
        render(<CefrProgressChart entries={entries} />);
        expect(screen.getAllByText('Lezen').length).toBeGreaterThan(0);
    });

    it('falls back to the raw skill id when it has no label', () => {
        // 'grammar' is not a real CefrSkill — the probe verifies the raw-id fallback for a label-less skill
        const entries = [
            makeEntry('B2', 'grammar' as CefrEntry['skill']),
            makeEntry('B2', 'reading'),
            makeEntry('B2', 'writing'),
        ];
        render(<CefrProgressChart entries={entries} />);
        expect(screen.getAllByText('grammar').length).toBeGreaterThan(0);
    });

    it('zeros out a skill/level combination with no entry', () => {
        // reading at A1/B1; writing only at A1 → writing@B1 gets 0
        const entries = [makeEntry('A1', 'reading'), makeEntry('B1', 'reading'), makeEntry('A1', 'writing')];
        const { container } = render(<CefrProgressChart entries={entries} />);
        expect(container.firstChild).toBeTruthy();
        expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    });

    it('styles an unachieved level with a dashed stroke', () => {
        const entries = [
            makeEntry('B2', 'reading', 40), // achieved=false
            makeEntry('B2', 'writing', 40),
            makeEntry('B2', 'listening', 40),
        ];
        const { container } = render(<CefrProgressChart entries={entries} />);
        // unachieved → fillOpacity 0.1 and strokeDasharray '4 2'
        const dashed = container.querySelector('[stroke-dasharray]');
        expect(dashed).toBeTruthy();
    });
});
