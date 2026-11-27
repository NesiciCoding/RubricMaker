import type { DocumentComment, DocumentMark } from '../types';

/**
 * The subset of a ProseMirror `Mapping` these helpers need. Positions are mapped start-inclusive,
 * end-exclusive, so text inserted exactly at an anchor's boundary does not silently join it.
 */
export interface AnchorMapping {
    map(pos: number, assoc?: number): number;
}

export interface AnchorRange {
    from: number;
    to: number;
}

export interface MarkAnchorPatch {
    id: string;
    anchor: AnchorRange;
    extraAnchor?: AnchorRange;
}

export interface CommentAnchorPatch {
    id: string;
    anchor: AnchorRange;
}

type MarkAnchorSource = Pick<DocumentMark, 'id' | 'anchor' | 'extraAnchor'>;
type CommentAnchorSource = Pick<DocumentComment, 'id' | 'anchor'>;

function mapRange(range: AnchorRange, mappings: readonly AnchorMapping[]): AnchorRange {
    let { from, to } = range;
    for (const mapping of mappings) {
        from = mapping.map(from, 1);
        to = mapping.map(to, -1);
    }
    return { from, to: Math.max(from, to) };
}

function sameRange(a: AnchorRange, b: AnchorRange): boolean {
    return a.from === b.from && a.to === b.to;
}

/**
 * Moves stored mark anchors through one or more document changes. The mark's snippet hash is left
 * alone: it is what tells the rail when the text under an anchor changed, and recomputing it here
 * would turn a stale mark into a confident-looking one over the wrong words.
 */
export function remapMarkAnchors(
    marks: readonly MarkAnchorSource[],
    mappings: readonly AnchorMapping[]
): MarkAnchorPatch[] {
    if (mappings.length === 0) return [];

    const patches: MarkAnchorPatch[] = [];
    for (const mark of marks) {
        const anchor = mapRange(mark.anchor, mappings);
        const extraAnchor = mark.extraAnchor ? mapRange(mark.extraAnchor, mappings) : undefined;
        const extraChanged = extraAnchor !== undefined && !sameRange(extraAnchor, mark.extraAnchor!);
        if (!sameRange(anchor, mark.anchor) || extraChanged) {
            patches.push(extraAnchor ? { id: mark.id, anchor, extraAnchor } : { id: mark.id, anchor });
        }
    }
    return patches;
}

/**
 * Comments have no snippet hash, so a stale anchor is drawn verbatim. Moving them with the text is
 * the only thing that keeps the highlight honest; a comment whose range collapses keeps a
 * zero-length anchor and stays readable in the sidebar rather than being deleted.
 */
export function remapCommentAnchors(
    comments: readonly CommentAnchorSource[],
    mappings: readonly AnchorMapping[]
): CommentAnchorPatch[] {
    if (mappings.length === 0) return [];

    const patches: CommentAnchorPatch[] = [];
    for (const comment of comments) {
        const anchor = mapRange(comment.anchor, mappings);
        if (!sameRange(anchor, comment.anchor)) patches.push({ id: comment.id, anchor });
    }
    return patches;
}
