import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import type { DocumentMark } from '../../types';
import { useMarkMutations } from './useMarkMutations';
import { TextTransform } from './tiptapExtensions';
import { hashSnippet } from '../../utils/proofRail';

const mocks = vi.hoisted(() => ({
    updateDocumentMark: vi.fn(),
    deleteDocumentMark: vi.fn(),
    restoreDocumentMark: vi.fn(),
    setDocumentMarkStatus: vi.fn(),
    showToast: vi.fn(
        (_message?: string, _type?: string, _options?: { action?: { label: string; onClick: () => void } }) => 1
    ),
}));

vi.mock('../../context/AppContext', () => ({
    useAssessment: () => ({
        updateDocumentMark: mocks.updateDocumentMark,
        deleteDocumentMark: mocks.deleteDocumentMark,
        restoreDocumentMark: mocks.restoreDocumentMark,
        setDocumentMarkStatus: mocks.setDocumentMarkStatus,
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

const editors: Editor[] = [];

function makeEditor(content = '<p>Hello world again</p>'): Editor {
    const editor = new Editor({
        extensions: [
            StarterKit.configure({ link: false, underline: false, undoRedo: {} }),
            Underline,
            TextStyle,
            TextTransform,
        ],
        content,
    });
    editors.push(editor);
    return editor;
}

afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy();
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

    it('applies a formatting mark and records the acceptance', () => {
        const editor = makeEditor();
        const formatting = mark({ symbolId: 'ital', anchor: { from: 7, to: 12 }, snippetHash: hashSnippet('world') });
        const { result } = renderHook(() => useMarkMutations());

        let applied!: boolean;
        act(() => {
            applied = result.current.accept(editor, formatting);
        });

        expect(applied).toBe(true);
        expect(editor.getHTML()).toContain('<em>world</em>');
        expect(mocks.setDocumentMarkStatus).toHaveBeenCalledWith('m1', 'accepted');
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.accepted', 'success');
    });

    it('refuses to apply a formatting mark whose text changed', () => {
        const editor = makeEditor();
        const original = editor.getHTML();
        const stale = mark({ symbolId: 'bf', anchor: { from: 7, to: 12 }, snippetHash: hashSnippet('gone') });
        const { result } = renderHook(() => useMarkMutations());

        let applied!: boolean;
        act(() => {
            applied = result.current.accept(editor, stale);
        });

        expect(applied).toBe(false);
        expect(editor.getHTML()).toBe(original);
        expect(mocks.setDocumentMarkStatus).not.toHaveBeenCalled();
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.refused.stale-anchor', 'warning');
    });

    it('applies nothing without an editor', () => {
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.accept(null, mark({ symbolId: 'ital' })));

        expect(result.current.accept(null, mark({ symbolId: 'ital' }))).toBe(false);
        expect(mocks.setDocumentMarkStatus).not.toHaveBeenCalled();
        expect(mocks.showToast).not.toHaveBeenCalled();
    });

    it('rejects a mark without touching the document', () => {
        const editor = makeEditor();
        const original = editor.getHTML();
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.reject(mark({ symbolId: 'ital' })));

        expect(editor.getHTML()).toBe(original);
        expect(mocks.setDocumentMarkStatus).toHaveBeenCalledWith('m1', 'rejected');
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.rejected', 'info');
    });

    it('writes nothing when the mark is already rejected', () => {
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.reject(mark({ symbolId: 'ital', status: 'rejected' })));

        expect(mocks.setDocumentMarkStatus).not.toHaveBeenCalled();
        expect(mocks.showToast).not.toHaveBeenCalled();
    });

    it('accepts every formatting mark on the page in one action', () => {
        const editor = makeEditor();
        const italic = mark({ symbolId: 'ital', anchor: { from: 7, to: 12 }, snippetHash: hashSnippet('world') });
        const bold = mark({
            id: 'm2',
            symbolId: 'bf',
            anchor: { from: 13, to: 18 },
            snippetHash: hashSnippet('again'),
        });
        const { result } = renderHook(() => useMarkMutations());

        let applied!: number;
        act(() => {
            applied = result.current.acceptAllFormatting(editor, [italic, bold]);
        });

        expect(applied).toBe(2);
        expect(editor.getHTML()).toContain('<em>world</em>');
        expect(editor.getHTML()).toContain('<strong>again</strong>');
        expect(mocks.setDocumentMarkStatus).toHaveBeenCalledWith('m1', 'accepted');
        expect(mocks.setDocumentMarkStatus).toHaveBeenCalledWith('m2', 'accepted');
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.acceptedAll', 'success');
    });

    it('keeps the applicable marks when one in the batch is stale', () => {
        const editor = makeEditor();
        const italic = mark({ symbolId: 'ital', anchor: { from: 7, to: 12 }, snippetHash: hashSnippet('world') });
        const stale = mark({ id: 'm2', symbolId: 'bf', anchor: { from: 7, to: 12 }, snippetHash: hashSnippet('gone') });
        const { result } = renderHook(() => useMarkMutations());

        let applied!: number;
        act(() => {
            applied = result.current.acceptAllFormatting(editor, [italic, stale]);
        });

        expect(applied).toBe(1);
        expect(mocks.setDocumentMarkStatus).toHaveBeenCalledTimes(1);
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.acceptedAll', 'success');
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.refused.stale-anchor', 'warning');
    });

    it('reports when the page had nothing it could apply', () => {
        const editor = makeEditor();
        const { result } = renderHook(() => useMarkMutations());

        let applied!: number;
        act(() => {
            applied = result.current.acceptAllFormatting(editor, [mark({ symbolId: 'sp' })]);
        });

        expect(applied).toBe(0);
        expect(mocks.setDocumentMarkStatus).not.toHaveBeenCalled();
        expect(mocks.showToast).toHaveBeenCalledWith('proofMarks.apply.noneApplied', 'warning');
    });

    it('does nothing when there is no history', () => {
        const { result } = renderHook(() => useMarkMutations());

        act(() => result.current.undo());

        expect(mocks.updateDocumentMark).not.toHaveBeenCalled();
        expect(mocks.restoreDocumentMark).not.toHaveBeenCalled();
        expect(mocks.showToast).not.toHaveBeenCalled();
    });
});
