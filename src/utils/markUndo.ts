import type { DocumentMark } from '../types';

/**
 * Mark mutations get their own bounded undo stack, deliberately separate from the editor's history:
 * marks are app-state sidecar records, so Ctrl+Z can never bring one back, and a second Ctrl+Z
 * binding next to the editor's would be a trap. The stack is scoped to the review surface (the
 * toast action and the mark panel call it, nothing binds it to a global shortcut) and records whole
 * mark snapshots, so undoing never has to reverse a patch field by field.
 */
export const MARK_UNDO_LIMIT = 20;

export type MarkUndoEntry =
    /** `mark` is the record as it was before the update. */
    | { kind: 'update'; mark: DocumentMark }
    /** The deleted record, restored with its own id so references stay intact. */
    | { kind: 'delete'; mark: DocumentMark };

export function pushMarkUndo(
    stack: readonly MarkUndoEntry[],
    entry: MarkUndoEntry,
    limit = MARK_UNDO_LIMIT
): MarkUndoEntry[] {
    const next = [...stack, entry];
    return next.length > limit ? next.slice(next.length - limit) : next;
}

export function popMarkUndo(stack: readonly MarkUndoEntry[]): {
    entry: MarkUndoEntry | null;
    stack: MarkUndoEntry[];
} {
    if (stack.length === 0) return { entry: null, stack: [] };
    return { entry: stack[stack.length - 1]!, stack: stack.slice(0, -1) };
}
