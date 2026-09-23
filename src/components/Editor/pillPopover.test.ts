import { describe, it, expect } from 'vitest';
import { openPillPopover } from './pillPopover';

describe('openPillPopover', () => {
    it('attaches the popover to the document before calling build(), so an input it creates can be focused', () => {
        const pill = document.createElement('span');
        document.body.appendChild(pill);

        let input: HTMLInputElement | null = null;
        openPillPopover(pill, 'test-popover', (popover) => {
            input = document.createElement('input');
            popover.appendChild(input);
            // Only works if `popover` (and therefore `input`) is already connected to the document —
            // focus() on a detached element is a no-op per spec.
            input.focus();
        });

        expect(input).not.toBeNull();
        expect(document.body.contains(input)).toBe(true);
        expect(document.activeElement).toBe(input);
        pill.remove();
    });

    it('positions the popover fixed, anchored below the pill', () => {
        const pill = document.createElement('span');
        document.body.appendChild(pill);

        openPillPopover(pill, 'test-popover', () => {});
        const popover = document.querySelector('.test-popover') as HTMLElement;
        expect(popover.style.position).toBe('fixed');
        pill.remove();
        popover.remove();
    });

    it('closes the previously open popover when a new one opens', () => {
        const pillA = document.createElement('span');
        const pillB = document.createElement('span');
        document.body.append(pillA, pillB);

        openPillPopover(pillA, 'test-popover', () => {});
        expect(document.querySelectorAll('.test-popover').length).toBe(1);

        openPillPopover(pillB, 'test-popover', () => {});
        expect(document.querySelectorAll('.test-popover').length).toBe(1);

        pillA.remove();
        pillB.remove();
        document.querySelector('.test-popover')?.remove();
    });

    it('closes on outside click and the returned close callback', () => {
        const pill = document.createElement('span');
        document.body.appendChild(pill);

        const close = openPillPopover(pill, 'test-popover', () => {});
        expect(document.querySelector('.test-popover')).not.toBeNull();
        close();
        expect(document.querySelector('.test-popover')).toBeNull();

        openPillPopover(pill, 'test-popover', () => {});
        expect(document.querySelector('.test-popover')).not.toBeNull();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.test-popover')).toBeNull();

        pill.remove();
    });
});
