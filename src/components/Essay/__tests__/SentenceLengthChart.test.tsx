import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SentenceLengthChart from '../SentenceLengthChart';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('recharts', async (importOriginal) => {
    const mod = await importOriginal<typeof import('recharts')>();
    return {
        ...mod,
        ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) =>
            React.cloneElement(children, { width: 600, height: 120 }),
    };
});

describe('SentenceLengthChart', () => {
    it('renders nothing without sentences', () => {
        const { container } = render(<SentenceLengthChart lengths={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('labels the chart with the lengths for assistive tech', () => {
        render(<SentenceLengthChart lengths={[4, 9, 2]} />);
        expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'writingStats.sentenceLengths: 4, 9, 2');
    });

    it.each(['bar', 'line', 'area'] as const)('renders the %s shape', (shape) => {
        const { container } = render(<SentenceLengthChart lengths={[4, 9, 2]} shape={shape} />);
        expect(container.querySelector('.recharts-wrapper')).not.toBeNull();
        expect(container.querySelector(`.recharts-${shape}`) ?? container.querySelector('svg')).not.toBeNull();
    });
});
