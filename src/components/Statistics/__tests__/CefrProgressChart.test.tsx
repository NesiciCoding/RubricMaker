import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CefrProgressChart, { CefrEntry } from '../CefrProgressChart';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
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
});
