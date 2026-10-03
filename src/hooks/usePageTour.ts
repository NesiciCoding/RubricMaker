import { useMemo } from 'react';
import type { Step } from 'react-joyride';

const MOBILE_QUERY = '(max-width: 768px)';

export function isMobileViewport(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(MOBILE_QUERY).matches
        : false;
}

/** Targets that are conditionally rendered would stall the tour, so only steps present in the DOM when it starts are kept. */
export function selectAvailableSteps(steps: Step[], autoPlacement: boolean): Step[] {
    return steps
        .filter((s) => typeof s.target !== 'string' || document.querySelector(s.target) !== null)
        .map((s) => (autoPlacement && s.placement && s.placement !== 'center' ? { ...s, placement: 'auto' } : s));
}

export function usePageTour(steps: Step[], run: boolean, autoPlacement = true): Step[] {
    return useMemo(
        () => (run ? selectAvailableSteps(steps, autoPlacement || isMobileViewport()) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [run, steps]
    );
}
