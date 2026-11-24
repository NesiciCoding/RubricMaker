import { describe, expect, it } from 'vitest';
import { parseInlineScript, plainInlineScript } from './inlineScript';

describe('parseInlineScript', () => {
    it('splits sub- and superscript out of plain text', () => {
        expect(parseInlineScript('H_{2}O and x^{2}')).toEqual([
            { kind: 'text', text: 'H' },
            { kind: 'sub', text: '2' },
            { kind: 'text', text: 'O and x' },
            { kind: 'sup', text: '2' },
        ]);
    });

    it('leaves ordinary text alone, since the braces are required', () => {
        for (const text of ['snake_case', '2^10', 'about ~5 km', 'a_{', 'x^{}', '']) {
            expect(plainInlineScript(text)).toBe(text);
        }
        expect(parseInlineScript('snake_case')).toEqual([{ kind: 'text', text: 'snake_case' }]);
    });

    it('does not nest or span braces', () => {
        expect(parseInlineScript('a_{b_{c}}')).toEqual([
            { kind: 'text', text: 'a_{b' },
            { kind: 'sub', text: 'c' },
            { kind: 'text', text: '}' },
        ]);
    });
});

describe('plainInlineScript', () => {
    it('uses Unicode scripts where they exist', () => {
        expect(plainInlineScript('H_{2}O')).toBe('H₂O');
        expect(plainInlineScript('x^{2}+y^{n}')).toBe('x²+yⁿ');
        expect(plainInlineScript('CO_{2}')).toBe('CO₂');
        expect(plainInlineScript('x^{2a}')).toBe('x²ᵃ');
        expect(plainInlineScript('x^{2a}')).not.toBe(plainInlineScript('x2a'));
    });

    it('falls back to the bare text when a character has no Unicode form', () => {
        expect(plainInlineScript('x^{q}')).toBe('xq');
        expect(plainInlineScript('x^{2q}')).toBe('x2q');
        expect(plainInlineScript('SO_{4}^{2-}')).toBe('SO₄²⁻');
    });
});
