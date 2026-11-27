import { describe, expect, it } from 'vitest';
import { PROOF_MARK_IDS } from '../data/proofMarks';
import { resolveMarkCode, withinOneEdit } from './proofMarkCode';

describe('resolveMarkCode', () => {
    it('resolves every registry id exactly', () => {
        for (const id of PROOF_MARK_IDS) {
            expect(resolveMarkCode(id), id).toMatchObject({ status: 'exact', symbolId: id });
        }
    });

    it('ignores case, spaces and hyphens, so a stored id and a typed one agree', () => {
        expect(resolveMarkCode('  SP ')).toMatchObject({ status: 'exact', symbolId: 'sp' });
        expect(resolveMarkCode('align-center')).toMatchObject({ status: 'exact', symbolId: 'align-center' });
        expect(resolveMarkCode('align center')).toMatchObject({ status: 'exact', symbolId: 'align-center' });
        expect(resolveMarkCode('Align_Center')).toMatchObject({ status: 'exact', symbolId: 'align-center' });
    });

    it('accepts the plain-English aliases', () => {
        expect(resolveMarkCode('italic')).toMatchObject({ status: 'exact', symbolId: 'ital' });
        expect(resolveMarkCode('full stop')).toMatchObject({ status: 'exact', symbolId: 'period' });
        expect(resolveMarkCode('close up')).toMatchObject({ status: 'exact', symbolId: 'closeup' });
        expect(resolveMarkCode('uppercase')).toMatchObject({ status: 'exact', symbolId: 'caps' });
        expect(resolveMarkCode('paragraph')).toMatchObject({ status: 'exact', symbolId: 'para' });
        expect(resolveMarkCode('underline')).toMatchObject({ status: 'exact', symbolId: 'ul' });
    });

    it('never lets a near-miss take a code that already means something', () => {
        expect(resolveMarkCode('sp')).toMatchObject({ status: 'exact', symbolId: 'sp' });
        expect(resolveMarkCode('space')).toMatchObject({ status: 'exact', symbolId: 'space' });
        expect(resolveMarkCode('lc')).toMatchObject({ status: 'exact', symbolId: 'lc' });
    });

    it('finishes a prefix that names exactly one symbol', () => {
        expect(resolveMarkCode('parag')).toMatchObject({ status: 'fuzzy', symbolId: 'para' });
        expect(resolveMarkCode('dele')).toMatchObject({ status: 'fuzzy', symbolId: 'del' });
        expect(resolveMarkCode('spella')).toMatchObject({ status: 'fuzzy', symbolId: 'sp' });
    });

    it('resolves a single slipped letter', () => {
        expect(resolveMarkCode('spp')).toMatchObject({ status: 'fuzzy', symbolId: 'sp' });
        expect(resolveMarkCode('bff')).toMatchObject({ status: 'fuzzy', symbolId: 'bf' });
    });

    it('resolves a swapped pair instead of treating it as a miss', () => {
        expect(resolveMarkCode('itla')).toMatchObject({ status: 'fuzzy', symbolId: 'ital' });
    });

    it('refuses to guess when a code could mean several symbols', () => {
        const result = resolveMarkCode('ali');
        expect(result.status).toBe('ambiguous');
        expect(result.symbolId).toBeNull();
        expect(result.candidates).toEqual(expect.arrayContaining(['align-left', 'align-center', 'align-right']));
        expect(result.candidates).toHaveLength(3);
    });

    it('reports an unknown code as a miss rather than falling back to a symbol', () => {
        expect(resolveMarkCode('zzz')).toEqual({ status: 'none', symbolId: null, candidates: [] });
    });

    it('treats blank input as no input', () => {
        expect(resolveMarkCode('')).toEqual({ status: 'empty', symbolId: null, candidates: [] });
        expect(resolveMarkCode('   ')).toEqual({ status: 'empty', symbolId: null, candidates: [] });
    });
});

describe('withinOneEdit', () => {
    it('counts one insertion, deletion, substitution or adjacent swap as a single edit', () => {
        expect(withinOneEdit('sp', 'spp')).toBe(true);
        expect(withinOneEdit('sp', 's')).toBe(true);
        expect(withinOneEdit('sp', 'sh')).toBe(true);
        expect(withinOneEdit('ital', 'itla')).toBe(true);
        expect(withinOneEdit('sp', 'sp')).toBe(true);
    });

    it('rejects anything further than one edit', () => {
        expect(withinOneEdit('sp', 'spell')).toBe(false);
        expect(withinOneEdit('ital', 'caps')).toBe(false);
        expect(withinOneEdit('', 'sp')).toBe(false);
    });
});
