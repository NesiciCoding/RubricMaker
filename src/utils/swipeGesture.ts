const INTERACTIVE =
    'input, textarea, select, button, a, label, [contenteditable=""], [contenteditable="true"], [role="slider"], .touch-stepper, .ProseMirror';

/**
 * Whether a swipe that started on `target` may act as a page gesture. Gestures that begin on a control
 * (slider, stepper, text field, editor, button) or inside a horizontally scrollable region belong to that
 * element, so they must never trigger navigation.
 */
export function isSwipeSafeTarget(target: EventTarget | null, boundary: Element | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest(INTERACTIVE)) return false;
    for (let el: Element | null = target; el && el !== boundary; el = el.parentElement) {
        const { overflowX } = getComputedStyle(el);
        if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return false;
    }
    return true;
}

/** A deliberate leftward swipe: far enough horizontally and mostly horizontal. */
export function isLeftSwipe(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
    const dx = start.x - end.x;
    const dy = Math.abs(start.y - end.y);
    return dx > 80 && dy < 60;
}
