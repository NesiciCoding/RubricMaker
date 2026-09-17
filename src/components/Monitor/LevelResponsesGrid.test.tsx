import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LevelResponsesGrid from './LevelResponsesGrid';
import type { StaircaseStep } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && 'correct' in opts ? `${opts.correct}/${opts.attempted}` : key,
        i18n: { language: 'en' },
    }),
}));

const path = (specs: [string, boolean][]): StaircaseStep[] =>
    specs.map(([level, correct], i) => ({
        sectionId: level,
        level: level as StaircaseStep['level'],
        questionId: `q${i}`,
        correct,
    }));

describe('LevelResponsesGrid', () => {
    it('renders one column per CEFR level present, a per-level accuracy count, and the estimated level', () => {
        render(
            <LevelResponsesGrid
                rows={[
                    {
                        studentId: 's1',
                        displayName: 'Alice',
                        estimatedLevel: 'B1',
                        levelPath: path([
                            ['A2', true],
                            ['A2', false],
                            ['B1', true],
                        ]),
                    },
                ]}
            />
        );
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getAllByText('B1').length).toBeGreaterThanOrEqual(2); // estimated-level badge + column header
        expect(screen.getByText('1/2')).toBeInTheDocument(); // A2: 1 of 2 correct
        expect(screen.getByText('1/1')).toBeInTheDocument(); // B1: 1 of 1 correct
    });

    it('shows a dash when there is no estimated level yet', () => {
        render(
            <LevelResponsesGrid rows={[{ studentId: 's1', displayName: 'Alice', levelPath: path([['A1', true]]) }]} />
        );
        expect(screen.getByText('—')).toBeInTheDocument();
    });
});
