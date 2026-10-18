import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData, Locale, Step } from 'react-joyride';
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
    const { t } = useTranslation();
    const available = usePageTour(steps, run, autoPlacement);
    const { registerPageTour } = usePageTourRegistry();
    // Joyride fills {current} and {total} itself; i18next leaves single braces alone.
    const locale = useMemo<Locale>(
        () => ({
            back: t('tour.back'),
            close: t('tour.close'),
            last: t('tour.last'),
            next: t('tour.next'),
            nextWithProgress: t('tour.next_with_progress'),
            open: t('tour.open'),
            skip: t('tour.skip'),
        }),
        [t]
    );

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
            locale={locale}
            styles={{ tooltipContainer: { textAlign: 'left' } }}
        />
    );
}
