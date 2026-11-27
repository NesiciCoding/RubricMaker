import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Editor } from '@tiptap/core';
import { useDocumentSelection } from './useDocumentSelection';

function fakeEditor(overrides: {
    selection?: { from: number; to: number; empty: boolean };
    root?: Node | null;
    posAtDOM?: (node: Node, offset: number) => number;
}): Editor {
    return {
        state: { selection: { from: 0, to: 0, empty: true, ...overrides.selection } },
        view: overrides.root === null ? undefined : { dom: overrides.root, posAtDOM: overrides.posAtDOM },
    } as unknown as Editor;
}

function stubSelection(value: unknown) {
    return vi.spyOn(document, 'getSelection').mockReturnValue(value as Selection | null);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useDocumentSelection', () => {
    it('is null without an editor', () => {
        const { result } = renderHook(() => useDocumentSelection(null));
        expect(result.current).toBeNull();
    });

    it('trusts a non-empty editor selection', () => {
        const getSelection = stubSelection(null);
        const editor = fakeEditor({ selection: { from: 3, to: 8, empty: false } });

        const { result } = renderHook(() => useDocumentSelection(editor));

        expect(result.current).toEqual({ from: 3, to: 8 });
        expect(getSelection).not.toHaveBeenCalled();
    });

    it('maps the browser selection when the editor has none', () => {
        const root = document.createElement('div');
        const text = document.createTextNode('hello');
        root.appendChild(text);
        const posAtDom = vi.fn((_node: Node, offset: number) => 10 + offset);
        stubSelection({
            rangeCount: 1,
            isCollapsed: false,
            anchorNode: text,
            anchorOffset: 0,
            focusNode: text,
            focusOffset: 5,
        });
        const editor = fakeEditor({ root, posAtDOM: posAtDom });

        const { result } = renderHook(() => useDocumentSelection(editor));

        expect(result.current).toEqual({ from: 10, to: 15 });
        expect(posAtDom).toHaveBeenCalled();
    });

    it('follows the selection while the surface is open', () => {
        const root = document.createElement('div');
        const text = document.createTextNode('hello');
        root.appendChild(text);
        const getSelection = stubSelection({
            rangeCount: 1,
            isCollapsed: false,
            anchorNode: text,
            anchorOffset: 1,
            focusNode: text,
            focusOffset: 3,
        });
        const editor = fakeEditor({ root, posAtDOM: (_node, offset) => offset });

        const { result } = renderHook(() => useDocumentSelection(editor));
        expect(result.current).toEqual({ from: 1, to: 3 });

        getSelection.mockReturnValue({
            rangeCount: 1,
            isCollapsed: false,
            anchorNode: text,
            anchorOffset: 2,
            focusNode: text,
            focusOffset: 5,
        } as unknown as Selection);
        act(() => {
            document.dispatchEvent(new Event('selectionchange'));
        });
        expect(result.current).toEqual({ from: 2, to: 5 });
    });

    it('stays null when the editor exposes no view', () => {
        stubSelection(null);
        const editor = fakeEditor({ root: null });

        const { result } = renderHook(() => useDocumentSelection(editor));

        expect(result.current).toBeNull();
    });
});
