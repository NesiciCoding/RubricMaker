import { describe, expect, it } from 'vitest';
import { codeFromText, isProofCode, knownCode, PROOF_CODES, stripProofCode, withProofCode } from './proofCode';

describe('codeFromText', () => {
    it('reads a letter code followed by a dash, an em dash or a space', () => {
        expect(codeFromText('sp — spelling')).toBe('sp');
        expect(codeFromText('del - delete this')).toBe('del');
        expect(codeFromText('tr swap these')).toBe('tr');
        expect(codeFromText('caps')).toBe('caps');
    });

    it('reads a punctuation code, which a word-boundary regex would drop', () => {
        expect(codeFromText('¶ new paragraph')).toBe('¶');
        expect(codeFromText('¶')).toBe('¶');
        expect(codeFromText(', insert comma')).toBe(',');
        expect(codeFromText('. full stop')).toBe('.');
        expect(codeFromText("' insert apostrophe")).toBe("'");
    });

    it('normalises case and leading whitespace', () => {
        expect(codeFromText('  SP  spelling')).toBe('sp');
        expect(codeFromText('Caps start of sentence')).toBe('caps');
    });

    it('returns null when the comment does not open with a code', () => {
        expect(codeFromText('')).toBeNull();
        expect(codeFromText('   ')).toBeNull();
        expect(codeFromText('Please rewrite this paragraph')).toBeNull();
        expect(codeFromText('comma here please')).toBeNull();
        expect(codeFromText('spelling is wrong')).toBeNull();
    });

    it('does not treat a longer word as a code', () => {
        expect(codeFromText('space between words')).toBeNull();
        expect(codeFromText('delete this word')).toBeNull();
    });
});

describe('knownCode', () => {
    it('accepts every code in the vocabulary', () => {
        for (const code of PROOF_CODES) {
            expect(knownCode(`${code} instruction`), code).toBe(code);
        }
    });

    it('rejects a code-shaped word that is not in the vocabulary', () => {
        expect(knownCode('yes this works')).toBeNull();
        expect(knownCode('add a comma here')).toBeNull();
        expect(knownCode('edit the ending')).toBeNull();
        expect(knownCode('Good sentence')).toBeNull();
    });

    it('treats a leading number or symbol as no code', () => {
        expect(knownCode('2 marks here')).toBeNull();
        expect(knownCode('- hyphen first')).toBeNull();
    });
});

describe('isProofCode', () => {
    it('narrows only known codes', () => {
        expect(isProofCode('sp')).toBe(true);
        expect(isProofCode('¶')).toBe(true);
        expect(isProofCode('yes')).toBe(false);
        expect(isProofCode(null)).toBe(false);
        expect(isProofCode(undefined)).toBe(false);
    });
});

describe('withProofCode', () => {
    it('prefixes a plain comment with the code and a space', () => {
        expect(withProofCode('sp', 'recieve → receive')).toBe('sp recieve → receive');
    });

    it('does not double-prefix a comment that already opens with a code', () => {
        expect(withProofCode('sp', 'del remove this')).toBe('del remove this');
        expect(withProofCode('sp', 'sp recieve')).toBe('sp recieve');
    });

    it('leaves only the code for an empty comment', () => {
        expect(withProofCode('sp', '   ')).toBe('sp ');
    });
});

describe('stripProofCode', () => {
    it('removes a known code and its separator', () => {
        expect(stripProofCode('sp — recieve → receive')).toBe('recieve → receive');
        expect(stripProofCode('¶')).toBe('');
    });

    it('leaves a comment without a code untouched', () => {
        expect(stripProofCode('Nice work')).toBe('Nice work');
        expect(stripProofCode('yes this works')).toBe('yes this works');
    });
});
