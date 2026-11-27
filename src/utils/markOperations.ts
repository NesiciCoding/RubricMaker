import type { Editor } from '@tiptap/core';
import type { DocumentMark, MarkStatus } from '../types';
import { getSymbol } from '../data/proofMarks';
import { markAnchorState } from './proofRail';

/**
 * The formatting half of the apply vocabulary (PM-11): the type-style symbols map onto editor marks
 * the app already owns, or onto `text-transform` for the two case marks, which HTML has no mark for.
 * A symbol outside this table has no formatting effect and is refused rather than guessed at.
 */
export type FormattingTarget =
    | { kind: 'mark'; name: 'bold' | 'italic' | 'underline' }
    | { kind: 'textTransform'; value: 'uppercase' | 'lowercase' };

const TARGETS: Readonly<Record<string, FormattingTarget>> = {
    ital: { kind: 'mark', name: 'italic' },
    bf: { kind: 'mark', name: 'bold' },
    ul: { kind: 'mark', name: 'underline' },
    caps: { kind: 'textTransform', value: 'uppercase' },
    lc: { kind: 'textTransform', value: 'lowercase' },
};

export function formattingTargetFor(mark: Pick<DocumentMark, 'symbolId' | 'payload'>): FormattingTarget | null {
    const bySymbol = TARGETS[mark.symbolId];
    if (bySymbol) return bySymbol;
    // The payload carries the mark an operation sets, so a type-style symbol this build added later
    // still applies without a second table. Anything else ignores it: a stale payload mark on a
    // spelling mark must not turn into a formatting change.
    const payloadMark = mark.payload?.mark;
    if (payloadMark && getSymbol(mark.symbolId).family === 'type-style') return { kind: 'mark', name: payloadMark };
    return null;
}

export function isFormattingMark(mark: Pick<DocumentMark, 'symbolId' | 'payload'>): boolean {
    return formattingTargetFor(mark) !== null;
}

export type FormattingRefusal = 'not-formatting' | 'stale-anchor' | 'unsupported';

export const FORMATTING_REFUSAL_KEYS: Readonly<Record<FormattingRefusal, string>> = {
    'not-formatting': 'proofMarks.apply.refused.not-formatting',
    'stale-anchor': 'proofMarks.apply.refused.stale-anchor',
    unsupported: 'proofMarks.apply.refused.unsupported',
};

export type FormattingApplyResult = { ok: true; target: FormattingTarget } | { ok: false; reason: FormattingRefusal };

/**
 * Applies one formatting mark to the document as a single transaction, so the editor's own undo and
 * redo cover it exactly like manual formatting. The teacher's selection is restored in the same
 * transaction: an apply must not move the caret. A mark whose stored anchor no longer matches the
 * text under it is refused before anything is dispatched.
 */
export function applyFormattingMark(editor: Editor, mark: DocumentMark): FormattingApplyResult {
    const target = formattingTargetFor(mark);
    if (!target) return { ok: false, reason: 'not-formatting' };
    if (markAnchorState(editor.state.doc, mark) !== 'anchored') return { ok: false, reason: 'stale-anchor' };

    const supported = target.kind === 'mark' ? editor.schema.marks[target.name] : editor.schema.marks.textStyle;
    if (!supported) return { ok: false, reason: 'unsupported' };

    const { from, to } = mark.anchor;
    const previous = editor.state.selection;
    const chain = editor.chain().setTextSelection({ from, to });
    const ran =
        target.kind === 'mark'
            ? chain.setMark(target.name)
            : chain.setMark('textStyle', { textTransform: target.value });

    const applied = ran.setTextSelection({ from: previous.from, to: previous.to }).run();
    if (!applied) return { ok: false, reason: 'unsupported' };
    return { ok: true, target };
}

export interface FormattingBatchResult {
    applied: DocumentMark[];
    refused: { mark: DocumentMark; reason: FormattingRefusal }[];
}

/**
 * Applies each formatting mark in turn, one transaction each, and reports the refusals rather than
 * stopping at the first one: a page with one stale mark must still accept the rest.
 */
export function applyFormattingMarks(editor: Editor, marks: readonly DocumentMark[]): FormattingBatchResult {
    const applied: DocumentMark[] = [];
    const refused: { mark: DocumentMark; reason: FormattingRefusal }[] = [];

    for (const mark of marks) {
        if (!isFormattingMark(mark)) continue;
        const result = applyFormattingMark(editor, mark);
        if (result.ok) applied.push(mark);
        else refused.push({ mark, reason: result.reason });
    }

    return { applied, refused };
}

export type MarkDecision = 'propose' | 'accept' | 'reject';

/**
 * The decision machine from the epic: `noted → proposed → accepted | rejected`, with a decision
 * reversible afterwards. `proposed` is the state PM-12's suggestion flow prepares; accept and reject
 * work from `noted` too, so marks placed before this machine existed need no migration.
 */
const DECISIONS: Readonly<Record<MarkDecision, { to: MarkStatus; from: readonly MarkStatus[] }>> = {
    propose: { to: 'proposed', from: ['noted', 'accepted', 'rejected'] },
    accept: { to: 'accepted', from: ['noted', 'proposed', 'rejected'] },
    reject: { to: 'rejected', from: ['noted', 'proposed', 'accepted'] },
};

/** The status after a decision, or null when the mark is already in that state (nothing to write). */
export function markStatusAfter(status: MarkStatus, decision: MarkDecision): MarkStatus | null {
    const rule = DECISIONS[decision];
    return rule.from.includes(status) ? rule.to : null;
}
