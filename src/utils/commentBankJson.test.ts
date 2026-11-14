import { describe, expect, it } from 'vitest';
import { exportCommentBankJson, parseCommentBankJson } from './commentBankJson';
import type { CommentBankItem } from '../types';

function item(text: string, tags: string[]): CommentBankItem {
    return { id: text, text, tags, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('commentBankJson', () => {
    it('round-trips text and tags without ids or timestamps', () => {
        const json = exportCommentBankJson([item('Good structure', ['b2', 'writing'])]);

        expect(JSON.parse(json)).toEqual({ items: [{ text: 'Good structure', tags: ['b2', 'writing'] }] });
        expect(parseCommentBankJson(json)).toEqual([{ text: 'Good structure', tags: ['b2', 'writing'] }]);
    });

    it('accepts a bare array and trims entries', () => {
        expect(parseCommentBankJson(JSON.stringify([{ text: '  Nice  ', tags: [' reading ', 7] }]))).toEqual([
            { text: 'Nice', tags: ['reading'] },
        ]);
    });

    it('skips entries without usable text instead of failing the file', () => {
        expect(
            parseCommentBankJson(JSON.stringify({ items: [{ text: '   ' }, { tags: [] }, { text: 'Kept' }] }))
        ).toEqual([{ text: 'Kept', tags: [] }]);
    });

    it('rejects a file that is not an item list', () => {
        expect(() => parseCommentBankJson('{"nope":true}')).toThrow(/expected an items array/);
        expect(() => parseCommentBankJson('not json')).toThrow();
    });
});
