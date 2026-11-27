import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentMark } from '../../types';
import { useAssessment } from '../../context/AppContext';
import { useToast } from '../../hooks/useToast';
import { getSymbol } from '../../data/proofMarks';
import { editMark, markSnapshotPatch, moveMark, type MarkEditInput } from '../../utils/proofMarkEdit';
import { popMarkUndo, pushMarkUndo, type MarkUndoEntry } from '../../utils/markUndo';
import type { TextRange } from '../../utils/proofRail';

export interface MarkMutations {
    update: (mark: DocumentMark, input: MarkEditInput) => void;
    move: (mark: DocumentMark, selection: TextRange | null, text: string) => void;
    /** Deletes immediately and offers the undo in a toast — no confirmation dialog. */
    remove: (mark: DocumentMark) => void;
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
    const { updateDocumentMark, deleteDocumentMark, restoreDocumentMark } = useAssessment();
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

    return { update, move, remove, undo, canUndo: undoDepth > 0 };
}
