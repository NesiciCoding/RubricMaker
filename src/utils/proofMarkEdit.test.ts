import { describe, it, expect } from 'vitest';
import type { DocumentMark } from '../types';
import { editMark, markSnapshotPatch, moveMark } from './proofMarkEdit';
import { hashSnippet } from './proofRail';

const makeMark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'sp',
    anchor: { from: 2, to: 6 },
    snippetHash: hashSnippet('hello'),
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
});

describe('editMark', () => {
    it('trims the note and clears it when emptied', () => {
        expect(editMark(makeMark(), { note: '  wrong tense  ' })).toEqual({ ok: true, patch: { note: 'wrong tense' } });
        expect(editMark(makeMark({ note: 'keep me' }), { note: '   ' })).toEqual({
            ok: true,
            patch: { note: undefined },
        });
    });

    it('writes nothing when the note has not changed', () => {
        expect(editMark(makeMark({ note: 'same' }), { note: ' same ' })).toEqual({ ok: false, reason: 'unchanged' });
        expect(editMark(makeMark(), {})).toEqual({ ok: false, reason: 'unchanged' });
    });

    it('changes the symbol and refuses one this build does not ship', () => {
        expect(editMark(makeMark(), { symbolId: 'ital' })).toEqual({ ok: true, patch: { symbolId: 'ital' } });
        expect(editMark(makeMark(), { symbolId: 'nope' })).toEqual({ ok: false, reason: 'unknown-symbol' });
        expect(editMark(makeMark(), { symbolId: 'sp' })).toEqual({ ok: false, reason: 'unchanged' });
    });

    it('sets, replaces and clears the replacement text', () => {
        expect(editMark(makeMark(), { text: ' hello ' })).toEqual({
            ok: true,
            patch: { payload: { text: 'hello' } },
        });
        expect(editMark(makeMark({ payload: { text: 'hte' } }), { text: 'the' })).toEqual({
            ok: true,
            patch: { payload: { text: 'the' } },
        });
        expect(editMark(makeMark({ payload: { text: 'the', mark: 'bold' } }), { text: '' })).toEqual({
            ok: true,
            patch: { payload: { mark: 'bold' } },
        });
        expect(editMark(makeMark({ payload: { text: 'the' } }), { text: '  ' })).toEqual({
            ok: true,
            patch: { payload: undefined },
        });
    });

    it('combines symbol, note and text in one patch', () => {
        expect(editMark(makeMark(), { symbolId: 'bf', note: 'bold it', text: 'word' })).toEqual({
            ok: true,
            patch: { symbolId: 'bf', note: 'bold it', payload: { text: 'word' } },
        });
    });
});

describe('moveMark', () => {
    it('refuses a null, empty or backwards selection', () => {
        expect(moveMark(makeMark(), null, '')).toEqual({ ok: false, reason: 'empty-selection' });
        expect(moveMark(makeMark(), { from: 4, to: 4 }, '')).toEqual({ ok: false, reason: 'empty-selection' });
        expect(moveMark(makeMark(), { from: 9, to: 3 }, '')).toEqual({ ok: false, reason: 'empty-selection' });
        expect(moveMark(makeMark(), { from: -1, to: 3 }, '')).toEqual({ ok: false, reason: 'empty-selection' });
    });

    it('re-anchors to the new range and hashes the text under it', () => {
        expect(moveMark(makeMark(), { from: 10, to: 16 }, 'better')).toEqual({
            ok: true,
            patch: { anchor: { from: 10, to: 16 }, snippetHash: hashSnippet('better') },
        });
    });

    it('refuses a move to the range the mark already covers', () => {
        expect(moveMark(makeMark(), { from: 2, to: 6 }, 'hello')).toEqual({ ok: false, reason: 'unchanged' });
    });
});

describe('markSnapshotPatch', () => {
    it('restores the editable fields without sharing the stored anchor', () => {
        const mark = makeMark({ note: 'old', payload: { text: 'word' } });
        const patch = markSnapshotPatch(mark);

        expect(patch).toEqual({
            symbolId: 'sp',
            anchor: { from: 2, to: 6 },
            snippetHash: mark.snippetHash,
            note: 'old',
            payload: { text: 'word' },
        });
        expect(patch.anchor).not.toBe(mark.anchor);
        expect(patch.payload).not.toBe(mark.payload);
    });

    it('empties a note or payload the mark did not have', () => {
        expect(markSnapshotPatch(makeMark({ note: '' }))).toMatchObject({ note: undefined, payload: undefined });
    });
});
