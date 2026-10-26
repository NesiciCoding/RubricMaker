import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PortalGradeHistoryChart from '../PortalGradeHistoryChart';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

// Tooltips only render on real pointer hover, which jsdom can't produce — invoke
// the formatter directly so the component's own formatting code is exercised.
vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 400 }),
        Tooltip: ({ formatter }: { formatter?: (v: unknown) => unknown }) => (
            <div data-testid="tooltip">{formatter ? String(formatter(80)) : ''}</div>
        ),
    };
});

describe('PortalGradeHistoryChart', () => {
    it('renders the line chart when history is provided', () => {
        const history = [
            { dateStr: '2024-01-01', score: 70 },
            { dateStr: '2024-02-01', score: 85 },
        ];
        const { container } = render(<PortalGradeHistoryChart history={history} />);
        expect(container.querySelector('.recharts-wrapper') ?? container.firstChild).toBeTruthy();
    });

    it('formats tooltip values as percentages with the score label', () => {
        const history = [{ dateStr: '2024-01-01', score: 70 }];
        render(<PortalGradeHistoryChart history={history} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('80.0%');
        expect(out).toContain('studentPortal.score');
    });

    it('formats the tooltip percentage with the viewer locale decimal separator', async () => {
        vi.resetModules();
        vi.doMock('react-i18next', () => ({
            useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'nl' } }),
        }));
        const { default: LocalizedChart } = await import('../PortalGradeHistoryChart');
        render(<LocalizedChart history={[{ dateStr: '2024-01-01', score: 70 }]} />);
        const out = screen.getByTestId('tooltip').textContent ?? '';
        expect(out).toContain('80,0%');
        vi.doUnmock('react-i18next');
        vi.resetModules();
    });

    it('exposes a visually-hidden data table as a text alternative to the chart', () => {
        const history = [
            { dateStr: '2024-01-01', score: 70 },
            { dateStr: '2024-02-01', score: 85.5 },
        ];
        const { container } = render(<PortalGradeHistoryChart history={history} />);
        expect(container.querySelector('div[role="img"]')).toBeTruthy();
        const table = container.querySelector('table.sr-only');
        expect(table).toBeTruthy();
        expect(table?.textContent).toContain('2024-01-01');
        expect(table?.textContent).toContain('85.5%');
    });
});
