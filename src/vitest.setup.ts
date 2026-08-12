/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// Recharts' ResponsiveContainer uses ResizeObserver which doesn't exist in jsdom
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// ProseMirror's EditorView.scrollToSelection calls getClientRects after any
// transaction that sets scrollIntoView. In jsdom the geometry APIs don't exist on
// Range (which ProseMirror queries via textRange()) and text nodes, so the resulting
// TypeError escapes as an unhandled exception that fails the CI run even though
// every assertion passed. Provide the zeroed geometry jsdom can't compute, for all
// Tiptap tests.
const zeroRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
} as unknown as DOMRect;

const emptyRectList = () =>
    ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
    }) as unknown as DOMRectList;

Object.defineProperty(Range.prototype, 'getClientRects', {
    value: emptyRectList,
    configurable: true,
});
Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    value: () => zeroRect,
    configurable: true,
});
Object.defineProperty(Node.prototype, 'getClientRects', {
    value: emptyRectList,
    configurable: true,
});
Object.defineProperty(Node.prototype, 'getBoundingClientRect', {
    value: () => zeroRect,
    configurable: true,
});
