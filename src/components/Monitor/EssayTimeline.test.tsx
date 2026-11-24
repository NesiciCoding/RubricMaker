import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EssayTimeline from './EssayTimeline';
import type { MonitorTimeline } from '../../utils/monitorTimeline';

const base: MonitorTimeline = { from: 0, to: 30 * 60_000, points: [], markers: [], longestFlatMinutes: 0 };

describe('EssayTimeline', () => {
    it('says there is nothing to draw yet when there are no samples and no events', () => {
        const { container } = render(<EssayTimeline timeline={base} />);

        expect(screen.getByText('tests.monitor.timeline.empty')).toBeInTheDocument();
        expect(container.querySelector('svg')).toBeNull();
    });

    it('still shows a recorded event when the curve has fewer than two samples', () => {
        const { container } = render(
            <EssayTimeline
                timeline={{
                    ...base,
                    points: [{ at: 60_000, words: 12 }],
                    markers: [{ at: 120_000, kind: 'paste' }],
                }}
            />
        );

        expect(screen.getByText('tests.monitor.timeline.empty')).toBeInTheDocument();
        expect(container.querySelector('svg line[stroke-width="1.5"]')).not.toBeNull();
        expect(container.querySelector('polyline')).toBeNull();
    });

    it('draws the curve once there are two samples', () => {
        const { container } = render(
            <EssayTimeline
                timeline={{
                    ...base,
                    points: [
                        { at: 60_000, words: 12 },
                        { at: 120_000, words: 30 },
                    ],
                }}
            />
        );

        expect(container.querySelector('polyline')).not.toBeNull();
        expect(screen.queryByText('tests.monitor.timeline.empty')).toBeNull();
    });
});
