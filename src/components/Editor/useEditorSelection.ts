import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { TextRange } from '../../utils/proofRail';

function currentRange(editor: Editor | null): TextRange | null {
    const selection = editor?.state.selection;
    if (!selection || selection.empty || selection.from >= selection.to) return null;
    return { from: selection.from, to: selection.to };
}

function sameRange(a: TextRange | null, b: TextRange | null): boolean {
    if (a === null || b === null) return a === b;
    return a.from === b.from && a.to === b.to;
}

/**
 * The range a mark can be moved to, read from `editor.state.selection`.
 *
 * That selection is live on this surface even though the review document is read-only:
 * ProseMirror's DOM observer listens for `selectionchange` regardless of `editable`
 * (`hasFocusAndSelection` is just `hasSelection` for a non-editable view), and a selection-only
 * change is dispatched as `tr.setSelection` — `readDOMChange` has no editable gate — which TipTap
 * surfaces as `selectionUpdate`. It is the same selection the PM-08 palette places marks with, so
 * reading the browser selection separately would only duplicate it.
 */
export function useEditorSelection(editor: Editor | null): TextRange | null {
    const [range, setRange] = useState<TextRange | null>(() => currentRange(editor));

    useEffect(() => {
        // A drag selection fires `selectionUpdate` on every mouse move; re-rendering on an unchanged
        // range would re-render the whole document view for nothing.
        const apply = (next: TextRange | null) => setRange((previous) => (sameRange(previous, next) ? previous : next));

        apply(currentRange(editor));
        const update = () => apply(currentRange(editor));
        editor?.on('selectionUpdate', update);
        return () => {
            editor?.off('selectionUpdate', update);
        };
    }, [editor]);

    return range;
}
