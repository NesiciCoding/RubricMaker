import { describe, it, expect } from 'vitest';
import { Oem, psmForCaptureHint, buildUserWords, buildUserPatterns } from './ocrConfig';

describe('engine mode constants', () => {
    it('uses the LSTM-only OEM value', () => {
        expect(Oem.LSTM_ONLY).toBe(1);
    });
});

describe('psmForCaptureHint', () => {
    it('maps each capture hint to its Tesseract PSM key', () => {
        expect(psmForCaptureHint('auto')).toBe('AUTO');
        expect(psmForCaptureHint('single-column')).toBe('SINGLE_COLUMN');
        expect(psmForCaptureHint('block')).toBe('SINGLE_BLOCK');
        expect(psmForCaptureHint('sparse')).toBe('SPARSE_TEXT');
    });

    it('defaults to AUTO when no hint is given', () => {
        expect(psmForCaptureHint()).toBe('AUTO');
    });
});

describe('buildUserWords', () => {
    it('trims, drops blanks and multi-word tokens, and de-duplicates case-insensitively', () => {
        expect(buildUserWords(['Cat', ' dog ', 'cat', 'a b', ''])).toBe('Cat\ndog');
    });

    it('returns an empty string when there are no usable words', () => {
        expect(buildUserWords([])).toBe('');
        expect(buildUserWords(['  ', 'two words'])).toBe('');
    });
});

describe('buildUserPatterns', () => {
    it('trims, drops blanks and whitespace patterns, and de-duplicates exactly', () => {
        expect(buildUserPatterns(['\\d\\d', '\\d\\d', 'A B', ' \\w+ '])).toBe('\\d\\d\n\\w+');
    });

    it('is case-sensitive (patterns are not folded)', () => {
        expect(buildUserPatterns(['\\A', '\\a'])).toBe('\\A\n\\a');
    });
});
