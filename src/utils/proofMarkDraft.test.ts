import { describe, expect, it } from 'vitest';
import { draftProofMark } from './proofMarkDraft';
import { hashSnippet } from './proofRail';

const BASE = {
    attachmentId: 'att-1',
    authorId: 'user-1',
    symbolId: 'sp',
    selection: { from: 4, to: 12 },
    text: 'speling',
};

describe('draftProofMark', () => {
    it('builds a noted mark on the selection, hashed so an edited document drops it', () => {
        const result = draftProofMark(BASE);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.mark).toEqual({
            attachmentId: 'att-1',
            authorId: 'user-1',
            symbolId: 'sp',
            anchor: { from: 4, to: 12 },
            snippetHash: hashSnippet('speling'),
            status: 'noted',
        });
        expect(result.mark).not.toHaveProperty('essayId');
    });

    it('carries the essay id when the marked document is an essay body', () => {
        const result = draftProofMark({ ...BASE, essayId: 'essay-1' });
        expect(result.ok && result.mark.essayId).toBe('essay-1');
    });

    it('derives the operation from the registry, advisory included', () => {
        const spell = draftProofMark(BASE);
        const bold = draftProofMark({ ...BASE, symbolId: 'bf' });
        const align = draftProofMark({ ...BASE, symbolId: 'align-center' });
        const query = draftProofMark({ ...BASE, symbolId: 'query' });

        expect(spell.ok && spell.operation).toBe('replaceRange');
        expect(bold.ok && bold.operation).toBe('setMark');
        expect(align.ok && align.operation).toBe('setBlockAttr');
        expect(query.ok && query.operation).toBeNull();
    });

    it('refuses an empty or reversed selection', () => {
        expect(draftProofMark({ ...BASE, selection: { from: 5, to: 5 } })).toEqual({
            ok: false,
            reason: 'empty-selection',
        });
        expect(draftProofMark({ ...BASE, selection: { from: 9, to: 3 } })).toEqual({
            ok: false,
            reason: 'empty-selection',
        });
        expect(draftProofMark({ ...BASE, selection: { from: -1, to: 3 } })).toEqual({
            ok: false,
            reason: 'empty-selection',
        });
        expect(draftProofMark({ ...BASE, selection: null })).toEqual({ ok: false, reason: 'empty-selection' });
        expect(draftProofMark({ ...BASE, selection: undefined })).toEqual({ ok: false, reason: 'empty-selection' });
    });

    it('refuses a symbol this build dropped, even though the registry reads one as advisory', () => {
        expect(draftProofMark({ ...BASE, symbolId: 'stet' })).toEqual({ ok: false, reason: 'unknown-symbol' });
        expect(draftProofMark({ ...BASE, symbolId: 'DEL' })).toEqual({ ok: false, reason: 'unknown-symbol' });
    });
});
