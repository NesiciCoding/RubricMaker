import { describe, it, expect } from 'vitest';
import type { DocumentMark } from '../types';
import { MARK_UNDO_LIMIT, popMarkUndo, pushMarkUndo, type MarkUndoEntry } from './markUndo';

const mark = (id: string): DocumentMark => ({
    id,
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'sp',
    anchor: { from: 0, to: 4 },
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
});

const entries = (ids: string[]): MarkUndoEntry[] => ids.map((id) => ({ kind: 'delete', mark: mark(id) }));

describe('pushMarkUndo', () => {
    it('appends the newest entry last', () => {
        const stack = pushMarkUndo(pushMarkUndo([], entries(['a'])[0]!), entries(['b'])[0]!);
        expect(stack.map((entry) => entry.mark.id)).toEqual(['a', 'b']);
    });

    it('keeps the stack bounded, dropping the oldest entries', () => {
        const stack = pushMarkUndo(entries(['a', 'b', 'c']), entries(['d'])[0]!, 2);
        expect(stack.map((entry) => entry.mark.id)).toEqual(['c', 'd']);
    });

    it('defaults to the exported limit', () => {
        let stack: MarkUndoEntry[] = [];
        for (let i = 0; i <= MARK_UNDO_LIMIT; i += 1) stack = pushMarkUndo(stack, entries([`m${i}`])[0]!);
        expect(stack).toHaveLength(MARK_UNDO_LIMIT);
        expect(stack[stack.length - 1]!.mark.id).toBe(`m${MARK_UNDO_LIMIT}`);
    });

    it('does not mutate the stack it is given', () => {
        const original = entries(['a']);
        const next = pushMarkUndo(original, entries(['b'])[0]!);
        expect(original).toHaveLength(1);
        expect(next).toHaveLength(2);
    });
});

describe('popMarkUndo', () => {
    it('returns the newest entry and the remaining stack', () => {
        const { entry, stack } = popMarkUndo(entries(['a', 'b']));
        expect(entry?.mark.id).toBe('b');
        expect(stack.map((item) => item.mark.id)).toEqual(['a']);
    });

    it('returns nothing for an empty stack', () => {
        expect(popMarkUndo([])).toEqual({ entry: null, stack: [] });
    });
});
