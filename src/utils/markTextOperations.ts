import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { DocumentMark } from '../types';
import { getSymbol } from '../data/proofMarks';
import { markAnchorState } from './proofRail';

/**
 * The reasons a text-operation mark cannot be applied. They are advisory rather than errors: the
 * teacher's mark stays as placed, the essay is untouched, and the panel says why nothing happened.
 * Guessing here is the one thing this module must never do — a wrong guess edits a student's essay.
 */
export type TextOperationAdvisory =
    'across-blocks' | 'needs-two-words' | 'no-whitespace' | 'no-replacement' | 'already-there' | 'no-block';

export type TextOperationPlanResult =
    | { ok: true; plan: TextOperationPlan }
    | { ok: false; reason: 'not-text-operation' | 'stale-anchor' }
    | { ok: false; reason: 'advisory'; advisory: TextOperationAdvisory };

export interface TextOperationPlan {
    kind: 'deleteRange' | 'replaceRange' | 'insertText' | 'transposeRanges' | 'splitBlock' | 'setBlockAttr';
    from: number;
    to: number;
    /** Text to write for replace, insert and transpose; absent for a plain deletion. */
    text?: string;
    /** A deletion that takes the adjacent space with it, so the words do not leave a double space. */
    removesSpace?: boolean;
    align?: 'left' | 'center' | 'right';
}

export interface MarkSuggestion {
    /** i18n key of the sentence shown in the panel. */
    key: string;
    values?: Record<string, string>;
    /** Set instead of a plan when the mark is advisory: the reason is itself a localised key. */
    reasonKey?: string;
}

export const ADVISORY_KEYS: Readonly<Record<TextOperationAdvisory, string>> = {
    'across-blocks': 'proofMarks.apply.reason.acrossBlocks',
    'needs-two-words': 'proofMarks.apply.reason.needsTwoWords',
    'no-whitespace': 'proofMarks.apply.reason.noWhitespace',
    'no-replacement': 'proofMarks.apply.reason.noReplacement',
    'already-there': 'proofMarks.apply.reason.alreadyThere',
    'no-block': 'proofMarks.apply.reason.noBlock',
};

const SUGGESTION_KEYS: Readonly<Record<TextOperationPlan['kind'], string>> = {
    deleteRange: 'proofMarks.apply.suggestion.delete',
    replaceRange: 'proofMarks.apply.suggestion.replace',
    insertText: 'proofMarks.apply.suggestion.insert',
    transposeRanges: 'proofMarks.apply.suggestion.transpose',
    splitBlock: 'proofMarks.apply.suggestion.split',
    setBlockAttr: 'proofMarks.apply.suggestion.align',
};

function advisory(reason: TextOperationAdvisory): TextOperationPlanResult {
    return { ok: false, reason: 'advisory', advisory: reason };
}

/** The textblock a position sits in, with the position just before the block itself. */
function textblockAt(doc: PMNode, pos: number): { node: PMNode; start: number } | null {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const node = $pos.node(depth);
        if (node.isTextblock) return { node, start: $pos.before(depth) };
    }
    return null;
}

function charAt(node: PMNode, offset: number): string {
    if (offset < 0 || offset >= node.content.size) return '';
    return node.textBetween(offset, offset + 1);
}

function whitespaceStart(node: PMNode, offset: number): number {
    let start = offset;
    while (start > 0 && /\s/.test(charAt(node, start - 1))) start -= 1;
    return start;
}

function whitespaceEnd(node: PMNode, offset: number): number {
    let end = offset;
    while (end < node.content.size && /\s/.test(charAt(node, end))) end += 1;
    return end;
}

/** A short read of the block around a range, so a close-up instruction names the words it joins. */
function contextAround(block: PMNode, localFrom: number, localTo: number): string {
    const from = Math.max(0, localFrom - 20);
    const to = Math.min(block.content.size, localTo + 20);
    return block.textBetween(from, to, ' ', ' ').trim();
}

/**
 * Derives the edit a mark asks for against the document it sits in, or refuses with a reason.
 * Every rule is deterministic: the same document and mark always produce the same plan, and a range
 * that does not fit the rule becomes advisory instead of a near-enough edit.
 */
export function planTextOperation(doc: PMNode, mark: DocumentMark): TextOperationPlanResult {
    const derive = getSymbol(mark.symbolId).derive;
    if (!derive) return { ok: false, reason: 'not-text-operation' };
    // The same guard PM-11 uses: never edit text whose stored snippet no longer matches the mark.
    if (markAnchorState(doc, mark) !== 'anchored') return { ok: false, reason: 'stale-anchor' };

    const { from, to } = mark.anchor;
    const fromBlock = textblockAt(doc, from);
    const toBlock = textblockAt(doc, to);
    if (!fromBlock || !toBlock) return advisory('no-block');
    if (fromBlock.start !== toBlock.start) return advisory('across-blocks');

    const block = fromBlock.node;
    const localFrom = from - fromBlock.start - 1;
    const localTo = to - fromBlock.start - 1;

    switch (derive.kind) {
        case 'delete': {
            const after = charAt(block, localTo);
            const before = charAt(block, localFrom - 1);
            if (after === ' ') return { ok: true, plan: { kind: 'deleteRange', from, to: to + 1, removesSpace: true } };
            if (before === ' ')
                return { ok: true, plan: { kind: 'deleteRange', from: from - 1, to, removesSpace: true } };
            return { ok: true, plan: { kind: 'deleteRange', from, to } };
        }

        case 'closeup': {
            const inside = block.textBetween(localFrom, localTo);
            const innerStart = inside.search(/\s/);
            if (innerStart >= 0) {
                let innerEnd = innerStart;
                while (innerEnd < inside.length && /\s/.test(inside[innerEnd]!)) innerEnd += 1;
                return {
                    ok: true,
                    plan: { kind: 'deleteRange', from: from + innerStart, to: from + innerEnd, removesSpace: true },
                };
            }
            if (localFrom > 0 && /\s/.test(charAt(block, localFrom - 1))) {
                return {
                    ok: true,
                    plan: {
                        kind: 'deleteRange',
                        from: fromBlock.start + 1 + whitespaceStart(block, localFrom),
                        to: from,
                    },
                };
            }
            if (localTo < block.content.size && /\s/.test(charAt(block, localTo))) {
                return {
                    ok: true,
                    plan: { kind: 'deleteRange', from: to, to: fromBlock.start + 1 + whitespaceEnd(block, localTo) },
                };
            }
            return advisory('no-whitespace');
        }

        case 'insert': {
            const value = (mark.payload?.text ?? '').trim() || derive.text;
            if (!value) return advisory('no-replacement');
            const existing = block.textBetween(localTo, Math.min(localTo + value.length, block.content.size));
            if (existing === value) return advisory('already-there');
            return { ok: true, plan: { kind: 'insertText', from: to, to, text: value } };
        }

        case 'replace': {
            const replacement = mark.payload?.text?.trim();
            if (!replacement) return advisory('no-replacement');
            if (replacement === block.textBetween(localFrom, localTo)) return advisory('already-there');
            return { ok: true, plan: { kind: 'replaceRange', from, to, text: replacement } };
        }

        case 'transpose': {
            const swap = /^(\s*)(\S+)(\s+)(\S+)(\s*)$/.exec(block.textBetween(localFrom, localTo));
            if (!swap) return advisory('needs-two-words');
            return {
                ok: true,
                plan: { kind: 'transposeRanges', from, to, text: `${swap[1]}${swap[4]}${swap[3]}${swap[2]}${swap[5]}` },
            };
        }

        case 'split-block': {
            // Splitting at the end of a block would only add an empty paragraph, and a second accept
            // would add another: the paragraph already ends where the mark asks it to.
            if (localTo >= block.content.size) return advisory('already-there');
            return { ok: true, plan: { kind: 'splitBlock', from: to, to } };
        }

        case 'align':
            return {
                ok: true,
                plan: { kind: 'setBlockAttr', from: fromBlock.start, to: fromBlock.start, align: derive.align },
            };
    }
}

/**
 * Applies one text-operation mark as a single transaction, so the editor's own undo and redo cover
 * it exactly like typed text. Refusals leave the document byte-for-byte unchanged.
 */
export function applyTextMark(editor: Editor, mark: DocumentMark): TextOperationPlanResult {
    const result = planTextOperation(editor.state.doc, mark);
    if (!result.ok) return result;

    const { plan } = result;
    const { tr } = editor.state;

    switch (plan.kind) {
        case 'deleteRange':
            tr.delete(plan.from, plan.to);
            break;
        case 'replaceRange':
        case 'transposeRanges':
            tr.insertText(plan.text ?? '', plan.from, plan.to);
            break;
        case 'insertText':
            tr.insertText(plan.text ?? '', plan.from);
            break;
        case 'splitBlock':
            tr.split(plan.from);
            break;
        case 'setBlockAttr': {
            const block = editor.state.doc.nodeAt(plan.from);
            if (!block?.isTextblock) return advisory('no-block');
            tr.setNodeMarkup(plan.from, undefined, { ...block.attrs, textAlign: plan.align });
            break;
        }
    }

    editor.view.dispatch(tr);
    return result;
}

/** What the panel says accepting this mark would do, or why it will not do anything. */
export function suggestionFor(doc: PMNode, mark: DocumentMark): MarkSuggestion | null {
    const derive = getSymbol(mark.symbolId).derive;
    if (!derive) return null;

    const result = planTextOperation(doc, mark);
    if (!result.ok) {
        if (result.reason !== 'advisory') return null;
        return { key: 'proofMarks.apply.advisory', reasonKey: ADVISORY_KEYS[result.advisory] };
    }

    const { plan } = result;
    const marked = doc.textBetween(mark.anchor.from, mark.anchor.to, ' ', ' ').trim();

    if (plan.kind === 'deleteRange') {
        if (derive.kind === 'closeup') {
            const block = textblockAt(doc, mark.anchor.from);
            return {
                key: 'proofMarks.apply.suggestion.closeup',
                values: {
                    text: block
                        ? contextAround(
                              block.node,
                              mark.anchor.from - block.start - 1,
                              mark.anchor.to - block.start - 1
                          )
                        : marked,
                },
            };
        }
        return {
            key: plan.removesSpace ? 'proofMarks.apply.suggestion.deleteWithSpace' : SUGGESTION_KEYS.deleteRange,
            values: { text: marked },
        };
    }

    if (plan.kind === 'transposeRanges') {
        const swap = /^(\s*)(\S+)(\s+)(\S+)(\s*)$/.exec(marked);
        return {
            key: SUGGESTION_KEYS.transposeRanges,
            values: { first: swap?.[2] ?? '', second: swap?.[4] ?? '' },
        };
    }

    if (plan.kind === 'setBlockAttr') {
        const direction = plan.align === 'left' ? 'Left' : plan.align === 'center' ? 'Center' : 'Right';
        return { key: `${SUGGESTION_KEYS.setBlockAttr}${direction}` };
    }

    return {
        key: SUGGESTION_KEYS[plan.kind],
        values:
            plan.kind === 'replaceRange'
                ? { text: marked, replacement: plan.text ?? '' }
                : plan.kind === 'insertText'
                  ? { text: plan.text ?? '' }
                  : undefined,
    };
}
