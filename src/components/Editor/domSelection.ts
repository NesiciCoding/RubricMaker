import type { TextRange } from '../../utils/proofRail';

/** The parts of a DOM `Selection` this mapping needs, so it can be tested without a real one. */
export interface DomSelectionLike {
    rangeCount: number;
    isCollapsed: boolean;
    anchorNode: Node | null;
    anchorOffset: number;
    focusNode: Node | null;
    focusOffset: number;
}

/**
 * Maps the browser's selection onto ProseMirror positions. A read-only document never runs the
 * editor's own selection handling, so moving a mark has to read the native selection and translate
 * it; anything that starts or ends outside the editor is not a range a mark can be moved to.
 */
export function domSelectionRange(
    selection: DomSelectionLike | null | undefined,
    root: Node,
    posAtDom: (node: Node, offset: number) => number
): TextRange | null {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const { anchorNode, focusNode } = selection;
    if (!anchorNode || !focusNode) return null;
    if (!root.contains(anchorNode) || !root.contains(focusNode)) return null;

    let from: number;
    let to: number;
    try {
        const anchor = posAtDom(anchorNode, selection.anchorOffset);
        const focus = posAtDom(focusNode, selection.focusOffset);
        from = Math.min(anchor, focus);
        to = Math.max(anchor, focus);
    } catch {
        // `posAtDOM` throws for a node the document cannot address (a widget wrapper, a removed node).
        return null;
    }

    return from < to ? { from, to } : null;
}
