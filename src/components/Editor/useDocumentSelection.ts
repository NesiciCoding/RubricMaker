import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { TextRange } from '../../utils/proofRail';
import { domSelectionRange } from './domSelection';

/**
 * The range a mark can be moved to. TipTap's own selection is trusted first, since an editable
 * document keeps it current; the review surface is read-only, where the editor never updates its
 * selection, so the browser's selection is mapped instead.
 */
export function useDocumentSelection(editor: Editor | null): TextRange | null {
    const [range, setRange] = useState<TextRange | null>(null);

    useEffect(() => {
        if (!editor) {
            setRange(null);
            return;
        }

        // A new object for the same range would re-render the surface on every mouse move of a
        // drag selection, so an unchanged range keeps the previous value.
        const apply = (next: TextRange | null) =>
            setRange((previous) =>
                previous && next && previous.from === next.from && previous.to === next.to ? previous : next
            );

        const read = () => {
            const selected = editor.state.selection;
            if (!selected.empty && selected.from < selected.to) {
                apply({ from: selected.from, to: selected.to });
                return;
            }

            const view = editor.view;
            if (!view?.dom) {
                apply(null);
                return;
            }
            apply(domSelectionRange(document.getSelection(), view.dom, (node, offset) => view.posAtDOM(node, offset)));
        };

        read();
        document.addEventListener('selectionchange', read);
        return () => document.removeEventListener('selectionchange', read);
    }, [editor]);

    return range;
}
