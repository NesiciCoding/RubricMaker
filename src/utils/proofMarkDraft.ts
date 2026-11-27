import type { DocumentMark, MarkOperation } from '../types';
import { operationFor, PROOF_MARKS, type ProofMarkId } from '../data/proofMarks';
import { hashSnippet, type TextRange } from './proofRail';

/**
 * The create-mark command, kept out of the component so the validation is testable without an
 * editor: a mark is only worth writing when it points at real text, and only a symbol this build
 * ships may be stored — a stale id would silently read as `query` and say the wrong thing.
 */
export interface DraftMarkInput {
    attachmentId: string;
    authorId: string;
    symbolId: string;
    /** The editor selection at the moment the symbol was chosen; empty selections are refused. */
    selection: TextRange | null | undefined;
    /** The selected text as it reads now, hashed so an edited document drops the mark instead of misplacing it. */
    text: string;
    essayId?: string;
}

export type DraftMarkFailure = 'empty-selection' | 'unknown-symbol';

export interface DraftMark {
    ok: true;
    mark: Omit<DocumentMark, 'id' | 'createdAt'>;
    /** What accepting this mark would do; derived from the registry, never stored on the mark. */
    operation: MarkOperation | null;
}

export type DraftMarkResult = DraftMark | { ok: false; reason: DraftMarkFailure };

export function isProofMarkId(id: string): id is ProofMarkId {
    return Object.prototype.hasOwnProperty.call(PROOF_MARKS, id);
}

export function draftProofMark({
    attachmentId,
    authorId,
    symbolId,
    selection,
    text,
    essayId,
}: DraftMarkInput): DraftMarkResult {
    if (!isProofMarkId(symbolId)) return { ok: false, reason: 'unknown-symbol' };

    const from = selection?.from;
    const to = selection?.to;
    if (typeof from !== 'number' || typeof to !== 'number' || from < 0 || to <= from) {
        return { ok: false, reason: 'empty-selection' };
    }

    return {
        ok: true,
        operation: operationFor(symbolId),
        mark: {
            attachmentId,
            authorId,
            symbolId,
            anchor: { from, to },
            snippetHash: hashSnippet(text),
            status: 'noted',
            ...(essayId ? { essayId } : {}),
        },
    };
}
