import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { EventData, Step } from 'react-joyride';
import PageTour from './PageTour';
import { TourProvider, usePageTourRegistry } from '../../context/TourContext';

const joyride = vi.hoisted(() => ({
    props: null as null | { steps: Step[]; run: boolean; onEvent: (d: EventData) => void },
}));

vi.mock('react-joyride', () => ({
    Joyride: (props: { steps: Step[]; run: boolean; onEvent: (d: EventData) => void }) => {
        joyride.props = props;
        return <div data-testid="joyride" data-run={String(props.run)} data-steps={props.steps.length} />;
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

const steps: Step[] = [
    { target: '[data-tour="present"]', content: 'a', placement: 'right' },
    { target: '[data-tour="missing"]', content: 'b', placement: 'top' },
    { target: 'body', content: 'c', placement: 'center' },
];

function stubViewport(mobile: boolean) {
    window.matchMedia = ((q: string) => ({
        matches: mobile && q.includes('768px'),
        media: q,
    })) as typeof window.matchMedia;
}

describe('PageTour', () => {
    beforeEach(() => {
        joyride.props = null;
        document.body.insertAdjacentHTML('beforeend', '<div data-tour="present"></div>');
        stubViewport(false);
    });
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('drops steps whose target is not in the DOM when the tour starts', () => {
        render(<PageTour steps={steps} run onFinish={() => {}} />);
        expect(screen.getByTestId('joyride')).toHaveAttribute('data-steps', '2');
    });

    it('uses auto placement for page tours (except center) and honours autoPlacement={false} on desktop', () => {
        const { unmount } = render(<PageTour steps={steps} run onFinish={() => {}} />);
        expect(joyride.props!.steps.map((s) => s.placement)).toEqual(['auto', 'center']);
        unmount();
        render(<PageTour steps={steps} run onFinish={() => {}} autoPlacement={false} />);
        expect(joyride.props!.steps.map((s) => s.placement)).toEqual(['right', 'center']);
    });

    it('forces auto placement on mobile even when autoPlacement is false', () => {
        stubViewport(true);
        render(<PageTour steps={steps} run onFinish={() => {}} autoPlacement={false} />);
        expect(joyride.props!.steps.map((s) => s.placement)).toEqual(['auto', 'center']);
    });

    it('calls onFinish for finished and skipped, not for other statuses', () => {
        const onFinish = vi.fn();
        render(<PageTour steps={steps} run onFinish={onFinish} />);
        act(() => joyride.props!.onEvent({ status: 'running' } as EventData));
        expect(onFinish).not.toHaveBeenCalled();
        act(() => joyride.props!.onEvent({ status: 'finished' } as EventData));
        act(() => joyride.props!.onEvent({ status: 'skipped' } as EventData));
        expect(onFinish).toHaveBeenCalledTimes(2);
    });

    it('registers a start request that the sidebar can trigger via the tour context', () => {
        const onStart = vi.fn();
        function Trigger() {
            const { hasPageTour, startPageTour } = usePageTourRegistry();
            return (
                <button onClick={startPageTour} data-has={String(hasPageTour)}>
                    go
                </button>
            );
        }
        const { unmount } = render(
            <TourProvider>
                <PageTour steps={steps} run={false} onFinish={() => {}} onStartRequest={onStart} />
                <Trigger />
            </TourProvider>
        );
        const btn = screen.getByText('go');
        expect(btn).toHaveAttribute('data-has', 'true');
        act(() => btn.click());
        expect(onStart).toHaveBeenCalledTimes(1);
        unmount();
    });

    it('does not register when no onStartRequest is given', () => {
        render(
            <TourProvider>
                <PageTour steps={steps} run={false} onFinish={() => {}} />
            </TourProvider>
        );
        expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'false');
    });
});
