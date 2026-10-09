import { describe, it, expect } from 'vitest';
import { isLeftSwipe, isSwipeSafeTarget } from './swipeGesture';

function mount(html: string) {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
}

describe('isSwipeSafeTarget', () => {
    it('rejects gestures that start on controls', () => {
        const root = mount(
            '<input type="range" id="r"><div class="touch-stepper"><span id="s">+</span></div><div contenteditable="true"><p id="p">x</p></div><button><svg id="i"></svg></button>'
        );
        for (const id of ['r', 's', 'p', 'i'])
            expect(isSwipeSafeTarget(root.querySelector(`#${id}`), root)).toBe(false);
        root.remove();
    });

    it('rejects gestures inside a horizontally scrollable region', () => {
        const root = mount('<div id="scroller" style="overflow-x:auto"><span id="t">cell</span></div>');
        const scroller = root.querySelector('#scroller') as HTMLElement;
        Object.defineProperty(scroller, 'scrollWidth', { value: 800 });
        Object.defineProperty(scroller, 'clientWidth', { value: 400 });
        expect(isSwipeSafeTarget(root.querySelector('#t'), root)).toBe(false);
        root.remove();
    });

    it('accepts plain content and rejects non-elements', () => {
        const root = mount('<div><p id="t">text</p></div>');
        expect(isSwipeSafeTarget(root.querySelector('#t'), root)).toBe(true);
        expect(isSwipeSafeTarget(null, root)).toBe(false);
        root.remove();
    });
});

describe('isLeftSwipe', () => {
    it('needs > 80px left and < 60px vertical drift', () => {
        expect(isLeftSwipe({ x: 200, y: 100 }, { x: 100, y: 120 })).toBe(true);
        expect(isLeftSwipe({ x: 200, y: 100 }, { x: 150, y: 100 })).toBe(false);
        expect(isLeftSwipe({ x: 100, y: 100 }, { x: 300, y: 100 })).toBe(false);
        expect(isLeftSwipe({ x: 200, y: 100 }, { x: 50, y: 200 })).toBe(false);
    });
});
