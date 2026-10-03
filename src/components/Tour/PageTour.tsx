import { useEffect, useMemo, useRef } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData, Step } from 'react-joyride';
import { usePageTour } from '../../hooks/usePageTour';
import { usePageTourRegistry } from '../../context/TourContext';

export const TOUR_OPTIONS = {
    showProgress: true,
    buttons: ['back', 'skip', 'primary'] as ('back' | 'skip' | 'primary')[],
    primaryColor: 'var(--accent)',
    backgroundColor: 'var(--bg-elevated)',
    textColor: 'var(--text)',
    arrowColor: 'var(--bg-elevated)',
    overlayColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 1000,
};

interface PageTourProps {
    steps: Step[];
    run: boolean;
    onFinish: () => void;
    onEvent?: (data: EventData) => void;
    onStartRequest?: () => void;
    /** Per-page steps use Joyride's auto placement; the main tour keeps explicit sidebar placements on desktop. */
    autoPlacement?: boolean;
}

export default function PageTour({
    steps,
    run,
    onFinish,
    onEvent,
    onStartRequest,
    autoPlacement = true,
}: PageTourProps) {
    const available = usePageTour(steps, run, autoPlacement);
    const { registerPageTour } = usePageTourRegistry();

    const startRef = useRef(onStartRequest);

    useEffect(() => {
        startRef.current = onStartRequest;
    });
    const registrable = onStartRequest !== undefined;

    useEffect(() => {
        if (!registrable) return;
        return registerPageTour(() => startRef.current?.());
    }, [registrable, registerPageTour]);

    const handleEvent = useMemo(
        () => (data: EventData) => {
            onEvent?.(data);
            if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) onFinish();
        },
        [onEvent, onFinish]
    );

    return (
        <Joyride
            steps={available}
            run={run}
            continuous
            onEvent={handleEvent}
            options={TOUR_OPTIONS}
            styles={{ tooltipContainer: { textAlign: 'left' } }}
        />
    );
}
