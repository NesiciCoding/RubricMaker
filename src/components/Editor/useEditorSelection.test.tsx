import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { useEditorSelection } from './useEditorSelection';

type Listener = () => void;

function fakeEditor(selection: { from: number; to: number; empty: boolean }) {
    const listeners = new Set<Listener>();
    const editor = {
        state: { selection },
        on: vi.fn((_event: string, listener: Listener) => listeners.add(listener)),
        off: vi.fn((_event: string, listener: Listener) => listeners.delete(listener)),
    };
    return {
        editor: editor as unknown as Editor,
        emit: () =>
            act(() => {
                for (const listener of [...listeners]) listener();
            }),
        editorRef: editor,
        listeners,
    };
}

describe('useEditorSelection', () => {
    it('is null without an editor', () => {
        const { result } = renderHook(() => useEditorSelection(null));
        expect(result.current).toBeNull();
    });

    it('reads the editor selection', () => {
        const { editor } = fakeEditor({ from: 3, to: 8, empty: false });

        const { result } = renderHook(() => useEditorSelection(editor));

        expect(result.current).toEqual({ from: 3, to: 8 });
    });

    it('is null for an empty selection', () => {
        const { editor } = fakeEditor({ from: 4, to: 4, empty: true });

        const { result } = renderHook(() => useEditorSelection(editor));

        expect(result.current).toBeNull();
    });

    it('follows selection updates', () => {
        const { editor, emit, editorRef } = fakeEditor({ from: 0, to: 0, empty: true });

        const { result } = renderHook(() => useEditorSelection(editor));
        expect(result.current).toBeNull();

        editorRef.state.selection = { from: 2, to: 6, empty: false };
        emit();
        expect(result.current).toEqual({ from: 2, to: 6 });

        editorRef.state.selection = { from: 6, to: 6, empty: true };
        emit();
        expect(result.current).toBeNull();
    });

    it('keeps the previous range value when the selection has not moved', () => {
        const { editor, emit } = fakeEditor({ from: 2, to: 6, empty: false });

        const { result } = renderHook(() => useEditorSelection(editor));
        const first = result.current;

        emit();
        expect(result.current).toBe(first);
    });

    it('unsubscribes on unmount', () => {
        const { editor, editorRef, listeners } = fakeEditor({ from: 2, to: 6, empty: false });

        const { unmount } = renderHook(() => useEditorSelection(editor));
        expect(listeners.size).toBe(1);

        unmount();
        expect(editorRef.off).toHaveBeenCalledWith('selectionUpdate', expect.any(Function));
        expect(listeners.size).toBe(0);
    });
});
