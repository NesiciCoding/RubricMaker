import { describe, it, expect, vi, afterEach } from 'vitest';
import { openPillPopover } from './pillPopover';

/** Places a pill at (left, top) with a fixed size, as the browser would report it. */
function placePill(pill: HTMLElement, left: number, top: number, width = 60, height = 20) {
    pill.getBoundingClientRect = () =>
        ({
            x: left,
            y: top,
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height,
            toJSON: () => ({}),
        }) as DOMRect;
}

describe('openPillPopover', () => {
    afterEach(() => {
        document.querySelectorAll('.pill-popover').forEach((popover) => popover.remove());
        document.querySelectorAll('.test-pill').forEach((pill) => pill.remove());
    });

    function pill(left = 100, top = 100): HTMLElement {
        const el = document.createElement('span');
        el.className = 'test-pill';
        document.body.appendChild(el);
        placePill(el, left, top);
        return el;
    }

    it('attaches the popover to the document before calling build(), so an input it creates can be focused', () => {
        const target = pill();

        let input: HTMLInputElement | null = null;
        openPillPopover(target, 'test-popover', (popover) => {
            input = document.createElement('input');
            popover.appendChild(input);
            // Only works if `popover` (and therefore `input`) is already connected to the document —
            // focus() on a detached element is a no-op per spec.
            input.focus();
        });

        expect(input).not.toBeNull();
        expect(document.body.contains(input)).toBe(true);
        expect(document.activeElement).toBe(input);
    });

    it('is a body-level .pill-popover, so no transformed ancestor can become its containing block', () => {
        const target = pill();
        openPillPopover(target, 'test-popover', () => {});
        const popover = document.querySelector('.test-popover') as HTMLElement;
        // The panel (including `position: fixed`) is owned by `.pill-popover` in index.css.
        expect(popover.className).toBe('pill-popover test-popover');
        expect(popover.parentElement).toBe(document.body);
        expect(popover.style.top).toBe('124px');
        expect(popover.style.left).toBe('100px');
    });

    it('never hangs off the right edge of the viewport', () => {
        const target = pill(window.innerWidth - 20);
        openPillPopover(target, 'test-popover', (popover) => {
            // jsdom has no layout, so offsetWidth is 0 unless the test says otherwise.
            Object.defineProperty(popover, 'offsetWidth', { value: 220, configurable: true });
        });
        const popover = document.querySelector('.test-popover') as HTMLElement;
        expect(parseFloat(popover.style.left)).toBe(window.innerWidth - 220 - 8);
    });

    it('re-anchors to the pill when the editor scrolls, since it no longer lives in the scroll box', () => {
        const target = pill(100, 100);
        openPillPopover(target, 'test-popover', () => {});
        const popover = document.querySelector('.test-popover') as HTMLElement;
        expect(popover.style.top).toBe('124px');

        // The editor's inner box scrolls the pill up by 60px; a once-positioned panel would stay put.
        placePill(target, 100, 40);
        document.dispatchEvent(new Event('scroll'));

        expect(popover.style.top).toBe('64px');
    });

    it('re-anchors on window resize', () => {
        const target = pill(100, 100);
        openPillPopover(target, 'test-popover', () => {});
        const popover = document.querySelector('.test-popover') as HTMLElement;

        placePill(target, 300, 100);
        window.dispatchEvent(new Event('resize'));

        expect(popover.style.left).toBe('300px');
    });

    it('closes when the pill leaves the document, so it cannot float over unrelated content', () => {
        const target = pill();
        openPillPopover(target, 'test-popover', () => {});
        expect(document.querySelector('.test-popover')).not.toBeNull();

        target.remove();
        document.dispatchEvent(new Event('scroll'));

        expect(document.querySelector('.test-popover')).toBeNull();
    });

    it('stops listening once closed', () => {
        const target = pill();
        const close = openPillPopover(target, 'test-popover', () => {});
        const removeSpy = vi.spyOn(document, 'removeEventListener');
        close();

        const removed = removeSpy.mock.calls.map(([type]) => type);
        expect(removed).toContain('mousedown');
        expect(removed).toContain('scroll');
        removeSpy.mockRestore();
    });

    it('closes the previously open popover when a new one opens', () => {
        const pillA = pill();
        openPillPopover(pillA, 'test-popover', () => {});
        expect(document.querySelectorAll('.test-popover').length).toBe(1);

        const pillB = pill(300, 300);
        openPillPopover(pillB, 'test-popover', () => {});
        expect(document.querySelectorAll('.test-popover').length).toBe(1);
    });

    it('closes on outside click and the returned close callback', () => {
        const target = pill();

        const close = openPillPopover(target, 'test-popover', () => {});
        expect(document.querySelector('.test-popover')).not.toBeNull();
        close();
        expect(document.querySelector('.test-popover')).toBeNull();

        openPillPopover(target, 'test-popover', () => {});
        expect(document.querySelector('.test-popover')).not.toBeNull();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.test-popover')).toBeNull();
    });
});
