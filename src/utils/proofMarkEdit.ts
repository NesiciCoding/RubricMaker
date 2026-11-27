import type { DocumentMark, MarkPayload } from '../types';
import { isProofMarkId } from './proofMarkDraft';
import { hashSnippet, type TextRange } from './proofRail';

/**
 * The editable part of a placed mark. Identity (`id`, `createdAt`, author) never moves, and status
 * belongs to the apply flow (PM-11), so an edit is a patch on exactly what a teacher can change
 * after the mark was placed.
 */
export interface MarkEditInput {
    symbolId?: string;
    /** The teacher's own words; an empty note clears it. */
    note?: string;
    /** The corrected word/sign for the symbols that write text; an empty value clears it. */
    text?: string;
}

export type MarkEditPatch = Pick<DocumentMark, 'symbolId' | 'note' | 'payload'>;

export type MarkEditResult =
    { ok: true; patch: Partial<MarkEditPatch> } | { ok: false; reason: 'unknown-symbol' | 'unchanged' };

export type MarkMoveResult =
    | { ok: true; patch: Pick<DocumentMark, 'anchor' | 'snippetHash'> }
    | { ok: false; reason: 'empty-selection' | 'unchanged' };

function withText(payload: MarkPayload | undefined, text: string): MarkPayload | undefined {
    const next: MarkPayload = { ...payload };
    if (text) next.text = text;
    else delete next.text;
    return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Computes the patch for a mark edit, refusing a symbol this build does not ship and returning
 * `unchanged` rather than writing a no-op record. Trimming happens here so the panel can hand over
 * raw field values.
 */
export function editMark(mark: DocumentMark, input: MarkEditInput): MarkEditResult {
    const patch: Partial<MarkEditPatch> = {};

    if (input.symbolId !== undefined && input.symbolId !== mark.symbolId) {
        if (!isProofMarkId(input.symbolId)) return { ok: false, reason: 'unknown-symbol' };
        patch.symbolId = input.symbolId;
    }

    if (input.note !== undefined) {
        const note = input.note.trim() || undefined;
        if (note !== (mark.note || undefined)) patch.note = note;
    }

    if (input.text !== undefined) {
        const payload = withText(mark.payload, input.text.trim());
        if ((payload?.text ?? '') !== (mark.payload?.text ?? '')) patch.payload = payload;
    }

    return Object.keys(patch).length > 0 ? { ok: true, patch } : { ok: false, reason: 'unchanged' };
}

/**
 * Re-anchors a mark to the teacher's current selection. A mark already on that range is refused,
 * and a selection that is empty or backwards is refused too — moving a mark onto nothing would
 * draw it nowhere.
 */
export function moveMark(mark: DocumentMark, selection: TextRange | null | undefined, text: string): MarkMoveResult {
    const from = selection?.from;
    const to = selection?.to;
    if (typeof from !== 'number' || typeof to !== 'number' || from < 0 || to <= from) {
        return { ok: false, reason: 'empty-selection' };
    }
    if (from === mark.anchor.from && to === mark.anchor.to) return { ok: false, reason: 'unchanged' };
    return { ok: true, patch: { anchor: { from, to }, snippetHash: hashSnippet(text) } };
}

/**
 * The patch that puts a mark back the way a stored snapshot had it. Used by undo, which records the
 * whole mark before a change instead of reversing a patch field by field.
 */
export function markSnapshotPatch(mark: DocumentMark): Partial<Omit<DocumentMark, 'id' | 'createdAt' | 'updatedAt'>> {
    return {
        symbolId: mark.symbolId,
        anchor: { ...mark.anchor },
        snippetHash: mark.snippetHash,
        note: mark.note || undefined,
        payload: mark.payload ? { ...mark.payload } : undefined,
    };
}
