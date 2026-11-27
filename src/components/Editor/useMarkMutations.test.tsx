import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentMark } from '../../types';
import { useMarkMutations } from './useMarkMutations';
import { hashSnippet } from '../../utils/proofRail';

const mocks = vi.hoisted(() => ({
    updateDocumentMark: vi.fn(),
    deleteDocumentMark: vi.fn(),
    restoreDocumentMark: vi.fn(),
    showToast: vi.fn(
        (_message?: string, _type?: string, _options?: { action?: { label: string; onClick: () => void } }) => 1
    ),
}));

vi.mock('../../context/AppContext', () => ({
    useAssessment: () => ({
        updateDocumentMark: mocks.updateDocumentMark,
        deleteDocumentMark: mocks.deleteDocumentMark,
        restoreDocumentMark: mocks.restoreDocumentMark,
    }),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mocks.showToast, dismissToast: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const mark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'sp',
    anchor: { from: 2, to: 6 },
    snippetHash: hashSnippet('hello'),
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
});

describe('useMarkMutations', () => {
    beforeEach(() => vi.clearAllMocks());

    it('writes an edit and undoes it from the stored snapshot', () => {
        const original = mark();
        const { result } = renderHook(() => useMarkMutations());

        expect(result.current.canUndo).toBe(false);
        act(() => result.current.update(original, { note: '  wrong tense ' }));

        expect(mocks.updateDocumentMark).toHaveBeenCalledWith('m1', { note: 'wrong tense' });
        expect(result.current.canUndo).toBe(true);

        act(() => result.current.undo());
        expect(mocks.updateDocumentMark).toHaveBeenLastCalledWith('m1', {
            symbolId: 'sp',
            anchor: { from: 2, to: 6 },
            snippetHash: original.snippetHash,
            note: undefined,
            payload: undefined,
        });
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.edit.undone', 'info');
        expect(result.current.canUndo).toBe(false);
    });

    it('writes nothing for an edit that changes nothing', () => {
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.update(mark({ note: 'same' }), { note: 'same' }));

        expect(mocks.updateDocumentMark).not.toHaveBeenCalled();
        expect(result.current.canUndo).toBe(false);
    });

    it('moves a mark to the selection and restores the old anchor on undo', () => {
        const original = mark();
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.move(original, { from: 10, to: 15 }, 'better'));

        expect(mocks.updateDocumentMark).toHaveBeenCalledWith('m1', {
            anchor: { from: 10, to: 15 },
            snippetHash: hashSnippet('better'),
        });

        act(() => result.current.undo());
        expect(mocks.updateDocumentMark).toHaveBeenLastCalledWith(
            'm1',
            expect.objectContaining({ anchor: { from: 2, to: 6 } })
        );
    });

    it('refuses to move without a usable selection', () => {
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.move(mark(), null, ''));

        expect(mocks.updateDocumentMark).not.toHaveBeenCalled();
        expect(result.current.canUndo).toBe(false);
    });

    it('deletes immediately and offers the restore in a toast', () => {
        const original = mark();
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.remove(original));
        expect(mocks.deleteDocumentMark).toHaveBeenCalledWith('m1');
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.edit.deleted', 'info', {
            action: { label: 'proofMarks.edit.undo', onClick: expect.any(Function) },
        });

        const action = mocks.showToast.mock.calls[0]![2]!.action!;
        act(() => action.onClick());
        expect(mocks.restoreDocumentMark).toHaveBeenCalledWith(original);
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.edit.undone', 'info');
    });

    it('undoes a deletion before an earlier edit, newest first', () => {
        const original = mark();
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.update(original, { note: 'first' }));
        act(() => result.current.update({ ...original, note: 'first' }, { note: 'second' }));
        act(() => result.current.remove(original));

        act(() => result.current.undo());
        expect(mocks.restoreDocumentMark).toHaveBeenCalledWith(original);

        act(() => result.current.undo());
        expect(mocks.updateDocumentMark).toHaveBeenLastCalledWith('m1', expect.objectContaining({ note: 'first' }));
    });

    it('does nothing when there is no history', () => {
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.undo());

        expect(mocks.updateDocumentMark).not.toHaveBeenCalled();
        expect(mocks.restoreDocumentMark).not.toHaveBeenCalled();
        expect(mocks.showToast).not.toHaveBeenCalled();
    });
});
