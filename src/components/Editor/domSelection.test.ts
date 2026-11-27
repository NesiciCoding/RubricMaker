import { describe, it, expect, vi } from 'vitest';
import { domSelectionRange, type DomSelectionLike } from './domSelection';

function setup() {
    const root = document.createElement('div');
    const first = document.createElement('span');
    const second = document.createElement('span');
    root.append(first, second);
    const outside = document.createElement('p');
    const positions = new Map<Node, number>([
        [first, 10],
        [second, 20],
        [outside, 40],
    ]);
    const posAtDom = vi.fn((node: Node, offset: number) => (positions.get(node) ?? 0) + offset);
    return { root, first, second, outside, posAtDom };
}

const selection = (overrides: Partial<DomSelectionLike> = {}): DomSelectionLike => ({
    rangeCount: 1,
    isCollapsed: false,
    anchorNode: null,
    anchorOffset: 0,
    focusNode: null,
    focusOffset: 0,
    ...overrides,
});

describe('domSelectionRange', () => {
    it('maps a selection inside the editor onto ordered ProseMirror positions', () => {
        const { root, first, second, posAtDom } = setup();
        const range = domSelectionRange(
            selection({ anchorNode: second, anchorOffset: 2, focusNode: first, focusOffset: 1 }),
            root,
            posAtDom
        );
        expect(range).toEqual({ from: 11, to: 22 });
    });

    it('ignores a missing, collapsed or empty selection', () => {
        const { root, posAtDom } = setup();
        expect(domSelectionRange(null, root, posAtDom)).toBeNull();
        expect(domSelectionRange(selection({ rangeCount: 0 }), root, posAtDom)).toBeNull();
        expect(domSelectionRange(selection({ isCollapsed: true }), root, posAtDom)).toBeNull();
    });

    it('ignores a selection that reaches outside the editor', () => {
        const { root, first, outside, posAtDom } = setup();
        expect(domSelectionRange(selection({ anchorNode: first, focusNode: outside }), root, posAtDom)).toBeNull();
        expect(domSelectionRange(selection({ anchorNode: outside, focusNode: first }), root, posAtDom)).toBeNull();
    });

    it('ignores endpoints the document cannot address', () => {
        const { root, posAtDom } = setup();
        expect(domSelectionRange(selection(), root, posAtDom)).toBeNull();

        const throwing = vi.fn(() => {
            throw new Error('unaddressable');
        });
        expect(
            domSelectionRange(
                selection({ anchorNode: root, focusNode: root, anchorOffset: 0, focusOffset: 1 }),
                root,
                throwing
            )
        ).toBeNull();
    });

    it('returns null when both endpoints land on the same position', () => {
        const { root, first, posAtDom } = setup();
        expect(
            domSelectionRange(
                selection({ anchorNode: first, anchorOffset: 3, focusNode: first, focusOffset: 3 }),
                root,
                posAtDom
            )
        ).toBeNull();
    });
});
