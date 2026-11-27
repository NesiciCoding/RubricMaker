import { describe, expect, it } from 'vitest';
import { remapCommentAnchors, remapMarkAnchors, type AnchorMapping } from './documentAnchorMapping';
import type { DocumentComment, DocumentMark } from '../types';

const mark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'del',
    anchor: { from: 2, to: 6 },
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
    snippetHash: 'abc',
    ...overrides,
});

const comment = (overrides: Partial<DocumentComment> = {}): DocumentComment => ({
    id: 'c1',
    attachmentId: 'a1',
    authorId: 't1',
    text: 'Check this',
    anchor: { from: 2, to: 6 },
    createdAt: '2024-01-01T00:00:00Z',
    resolved: false,
    ...overrides,
});

const shift = (by: number): AnchorMapping => ({ map: (pos) => pos + by });
const collapse = (at: number): AnchorMapping => ({ map: () => at });

describe('remapMarkAnchors', () => {
    it('writes nothing when no document changed', () => {
        expect(remapMarkAnchors([mark()], [])).toEqual([]);
    });

    it('writes nothing when the anchors do not move', () => {
        expect(remapMarkAnchors([mark()], [shift(0)])).toEqual([]);
    });

    it('moves both ends and the transpose partner through an insertion', () => {
        const patched = remapMarkAnchors([mark({ extraAnchor: { from: 10, to: 12 } })], [shift(3)]);

        expect(patched).toEqual([{ id: 'm1', anchor: { from: 5, to: 9 }, extraAnchor: { from: 13, to: 15 } }]);
    });

    it('keeps a collapsed mark as an empty anchor instead of inventing a range', () => {
        expect(remapMarkAnchors([mark()], [collapse(2)])).toEqual([{ id: 'm1', anchor: { from: 2, to: 2 } }]);
    });

    it('applies consecutive mappings in order', () => {
        expect(remapMarkAnchors([mark()], [shift(2), shift(-1)])).toEqual([{ id: 'm1', anchor: { from: 3, to: 7 } }]);
    });
});

describe('remapCommentAnchors', () => {
    it('writes nothing when no document changed or the anchor stays put', () => {
        expect(remapCommentAnchors([comment()], [])).toEqual([]);
        expect(remapCommentAnchors([comment()], [shift(0)])).toEqual([]);
    });

    it('moves a comment with the text around it', () => {
        expect(remapCommentAnchors([comment()], [shift(-1)])).toEqual([{ id: 'c1', anchor: { from: 1, to: 5 } }]);
    });

    it('keeps a comment whose range collapsed readable as a caret anchor', () => {
        expect(remapCommentAnchors([comment()], [collapse(4)])).toEqual([{ id: 'c1', anchor: { from: 4, to: 4 } }]);
    });

    it('does not delete or invent comments', () => {
        expect(
            remapCommentAnchors([comment(), comment({ id: 'c2', anchor: { from: 20, to: 22 } })], [shift(1)])
        ).toEqual([
            { id: 'c1', anchor: { from: 3, to: 7 } },
            { id: 'c2', anchor: { from: 21, to: 23 } },
        ]);
    });
});
