import { describe, it, expect } from 'vitest';
import { commentDecorationSpecs } from './commentDecorations';
import type { DocumentComment } from '../../types';

const makeComment = (overrides: Partial<DocumentComment> = {}): DocumentComment => ({
    id: 'c1',
    attachmentId: 'a1',
    authorId: 'u1',
    text: 'Nice work',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolved: false,
    anchor: { from: 2, to: 8 },
    ...overrides,
});

describe('commentDecorationSpecs', () => {
    it('produces one spec per comment within bounds', () => {
        const comments = [makeComment(), makeComment({ id: 'c2', anchor: { from: 10, to: 20 } })];
        const specs = commentDecorationSpecs(comments, 30, null);
        expect(specs).toHaveLength(2);
        expect(specs[0]).toMatchObject({ from: 2, to: 8, id: 'c1', active: false });
        expect(specs[1]).toMatchObject({ from: 10, to: 20, id: 'c2', active: false });
    });

    it('marks the active comment', () => {
        const comments = [makeComment({ id: 'c1' }), makeComment({ id: 'c2', anchor: { from: 10, to: 20 } })];
        const specs = commentDecorationSpecs(comments, 30, 'c2');
        expect(specs.find((s) => s.id === 'c1')?.active).toBe(false);
        expect(specs.find((s) => s.id === 'c2')?.active).toBe(true);
    });

    it('drops a comment whose anchor extends beyond the document size', () => {
        const comments = [
            makeComment({ anchor: { from: 2, to: 8 } }),
            makeComment({ id: 'c2', anchor: { from: 5, to: 50 } }),
        ];
        const specs = commentDecorationSpecs(comments, 10, null);
        expect(specs).toHaveLength(1);
        expect(specs[0].id).toBe('c1');
    });

    it('drops a zero-length or inverted anchor range', () => {
        const comments = [
            makeComment({ id: 'zero', anchor: { from: 4, to: 4 } }),
            makeComment({ id: 'inverted', anchor: { from: 8, to: 3 } }),
            makeComment({ id: 'valid', anchor: { from: 1, to: 5 } }),
        ];
        const specs = commentDecorationSpecs(comments, 30, null);
        expect(specs.map((s) => s.id)).toEqual(['valid']);
    });

    it('drops a negative anchor start', () => {
        const comments = [makeComment({ anchor: { from: -1, to: 5 } })];
        expect(commentDecorationSpecs(comments, 30, null)).toHaveLength(0);
    });

    it('returns an empty array for no comments', () => {
        expect(commentDecorationSpecs([], 30, null)).toEqual([]);
    });
});
