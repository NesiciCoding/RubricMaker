import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import type { DocumentMark } from '../../types';
import { useAssessment } from '../../context/AppContext';
import { useToast } from '../../hooks/useToast';
import { getSymbol } from '../../data/proofMarks';
import { editMark, markSnapshotPatch, moveMark, type MarkEditInput } from '../../utils/proofMarkEdit';
import {
    applyFormattingMark,
    applyFormattingMarks,
    FORMATTING_REFUSAL_KEYS,
    markStatusAfter,
} from '../../utils/markOperations';
import { popMarkUndo, pushMarkUndo, type MarkUndoEntry } from '../../utils/markUndo';
import type { TextRange } from '../../utils/proofRail';

export interface MarkMutations {
    update: (mark: DocumentMark, input: MarkEditInput) => void;
    move: (mark: DocumentMark, selection: TextRange | null, text: string) => void;
    /** Deletes immediately and offers the undo in a toast — no confirmation dialog. */
    remove: (mark: DocumentMark) => void;
    /** Applies a formatting mark to the document as one transaction and records the decision. */
    accept: (editor: Editor | null, mark: DocumentMark) => void;
    reject: (mark: DocumentMark) => void;
    /** The only batch action: every formatting mark on the page, one transaction each. */
    acceptAllFormatting: (editor: Editor | null, marks: readonly DocumentMark[]) => void;
    undo: () => void;
    canUndo: boolean;
}

/**
 * Every mark mutation a teacher can make after placing one, plus the undo that reverses it. The
 * stack lives in a ref (nothing needs to render its contents) with a depth counter so the undo
 * button can enable itself.
 */
export function useMarkMutations(): MarkMutations {
    const { t } = useTranslation();
    const { updateDocumentMark, deleteDocumentMark, restoreDocumentMark, setDocumentMarkStatus } = useAssessment();
    const { showToast } = useToast();

    const undoStack = useRef<MarkUndoEntry[]>([]);
    const [undoDepth, setUndoDepth] = useState(0);

    const remember = useCallback((entry: MarkUndoEntry) => {
        undoStack.current = pushMarkUndo(undoStack.current, entry);
        setUndoDepth(undoStack.current.length);
    }, []);

    const undo = useCallback(() => {
        const { entry, stack } = popMarkUndo(undoStack.current);
        undoStack.current = stack;
        setUndoDepth(stack.length);
        if (!entry) return;

        if (entry.kind === 'delete') restoreDocumentMark(entry.mark);
        else updateDocumentMark(entry.mark.id, markSnapshotPatch(entry.mark));
        showToast(t('proofMarks.edit.undone'), 'info');
    }, [restoreDocumentMark, updateDocumentMark, showToast, t]);

    const update = useCallback(
        (mark: DocumentMark, input: MarkEditInput) => {
            const result = editMark(mark, input);
            if (!result.ok) return;
            updateDocumentMark(mark.id, result.patch);
            remember({ kind: 'update', mark });
        },
        [remember, updateDocumentMark]
    );

    const move = useCallback(
        (mark: DocumentMark, selection: TextRange | null, text: string) => {
            const result = moveMark(mark, selection, text);
            if (!result.ok) return;
            updateDocumentMark(mark.id, result.patch);
            remember({ kind: 'update', mark });
        },
        [remember, updateDocumentMark]
    );

    const remove = useCallback(
        (mark: DocumentMark) => {
            deleteDocumentMark(mark.id);
            remember({ kind: 'delete', mark });
            showToast(t('proofMarks.edit.deleted', { symbol: t(getSymbol(mark.symbolId).labelKey) }), 'info', {
                action: { label: t('proofMarks.edit.undo'), onClick: undo },
            });
        },
        [deleteDocumentMark, remember, showToast, t, undo]
    );

    /*
     * Accept/reject write the record's decision but deliberately not the mark undo stack: the essay
     * change is the editor's own transaction, so Ctrl+Z is what reverses it. A stack entry here could
     * only restore the status and would leave the text formatted — the mixed undo model to avoid.
     */
    const accept = useCallback(
        (editor: Editor | null, mark: DocumentMark) => {
            if (!editor) return;
            const result = applyFormattingMark(editor, mark);
            if (!result.ok) {
                showToast(t(FORMATTING_REFUSAL_KEYS[result.reason]), 'warning');
                return;
            }
            const status = markStatusAfter(mark.status, 'accept');
            if (status) setDocumentMarkStatus(mark.id, status);
            showToast(t('proofMarks.apply.accepted', { symbol: t(getSymbol(mark.symbolId).labelKey) }), 'success');
        },
        [setDocumentMarkStatus, showToast, t]
    );

    const reject = useCallback(
        (mark: DocumentMark) => {
            const status = markStatusAfter(mark.status, 'reject');
            if (!status) return;
            setDocumentMarkStatus(mark.id, status);
            showToast(t('proofMarks.apply.rejected', { symbol: t(getSymbol(mark.symbolId).labelKey) }), 'info');
        },
        [setDocumentMarkStatus, showToast, t]
    );

    const acceptAllFormatting = useCallback(
        (editor: Editor | null, marks: readonly DocumentMark[]) => {
            if (!editor) return;
            const { applied, refused } = applyFormattingMarks(editor, marks);
            for (const mark of applied) {
                const status = markStatusAfter(mark.status, 'accept');
                if (status) setDocumentMarkStatus(mark.id, status);
            }
            if (applied.length === 0) {
                showToast(t('proofMarks.apply.noneApplied'), 'warning');
            } else {
                showToast(t('proofMarks.apply.acceptedAll', { total: applied.length }), 'success');
            }
            if (refused.length > 0) showToast(t(FORMATTING_REFUSAL_KEYS[refused[0]!.reason]), 'warning');
        },
        [setDocumentMarkStatus, showToast, t]
    );

    return { update, move, remove, accept, reject, acceptAllFormatting, undo, canUndo: undoDepth > 0 };
}
