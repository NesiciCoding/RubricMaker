import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { BUILDER_HISTORY_LIMIT, useBuilderHistory } from '../useBuilderHistory';

interface Form {
    text: string;
    /** Stands in for the builder's signature: question ids and types, plus section ids. */
    shape: string;
}

function useHarness(initial: Form, limit?: number) {
    const [form, setForm] = useState(initial);
    const history = useBuilderHistory({ snapshot: form, signature: form.shape, onRestore: setForm, limit });
    const edit = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
    return { form, edit, ...history };
}

describe('useBuilderHistory', () => {
    it('merges a typing burst in one field into a single step', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }));

        act(() => result.current.edit({ text: 'H' }));
        act(() => result.current.edit({ text: 'He' }));
        act(() => result.current.edit({ text: 'Hey' }));
        expect(result.current.canUndo).toBe(true);

        act(() => result.current.undo());
        expect(result.current.form.text).toBe('');
        expect(result.current.canUndo).toBe(false);
        expect(result.current.canRedo).toBe(true);
    });

    it('gives a type change, a reorder or a delete its own step', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }));

        act(() => result.current.edit({ text: 'first draft' }));
        act(() => result.current.edit({ shape: 'q1:true-false' }));
        act(() => result.current.edit({ text: 'second draft' }));

        // The typing after the retype is its own step, the retype the step before it.
        act(() => result.current.undo());
        expect(result.current.form).toEqual({ text: 'first draft', shape: 'q1:true-false' });

        act(() => result.current.undo());
        expect(result.current.form).toEqual({ text: 'first draft', shape: 'q1' });

        act(() => result.current.undo());
        expect(result.current.form).toEqual({ text: '', shape: 'q1' });
        expect(result.current.canUndo).toBe(false);
    });

    it('redoes what an undo took away, in order', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }));

        act(() => result.current.edit({ text: 'one' }));
        act(() => result.current.edit({ shape: 'q2' }));
        act(() => result.current.undo());
        expect(result.current.form.text).toBe('one');

        act(() => result.current.redo());
        expect(result.current.form).toEqual({ text: 'one', shape: 'q2' });
        expect(result.current.canRedo).toBe(false);
    });

    it('drops the redo stack as soon as the teacher edits again', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }));

        act(() => result.current.edit({ text: 'one' }));
        act(() => result.current.undo());
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.edit({ shape: 'q3' }));
        expect(result.current.canRedo).toBe(false);
    });

    it('keeps only the newest steps up to the limit', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }, 3));

        for (const shape of ['q2', 'q3', 'q4', 'q5']) act(() => result.current.edit({ shape }));
        act(() => result.current.undo());
        act(() => result.current.undo());
        act(() => result.current.undo());
        expect(result.current.form.shape).toBe('q2');
        expect(result.current.canUndo).toBe(false);
    });

    it('does not record the render that shows a restored snapshot', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }));

        act(() => result.current.edit({ text: 'typed' }));
        act(() => result.current.undo());
        expect(result.current.canUndo).toBe(false);
        expect(result.current.form.text).toBe('');

        act(() => result.current.redo());
        expect(result.current.form.text).toBe('typed');
        expect(result.current.canRedo).toBe(false);
    });

    it('makes the first edit after a restore its own step', () => {
        const { result } = renderHook(() => useHarness({ text: '', shape: 'q1' }));

        act(() => result.current.edit({ text: 'typed' }));
        act(() => result.current.undo());
        act(() => result.current.edit({ text: 'other' }));

        act(() => result.current.undo());
        expect(result.current.form.text).toBe('');
    });

    it('defaults to a 50-step history', () => {
        expect(BUILDER_HISTORY_LIMIT).toBe(50);
    });
});
