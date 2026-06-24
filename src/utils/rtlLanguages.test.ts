import { describe, expect, it } from 'vitest';
import { isRtlLanguage } from './rtlLanguages';

describe('isRtlLanguage', () => {
    it('detects Arabic', () => {
        expect(isRtlLanguage('ar')).toBe(true);
        expect(isRtlLanguage('ar-SA')).toBe(true);
        expect(isRtlLanguage('AR')).toBe(true);
    });

    it.each(['en', 'nl', 'fr', 'de', 'es'])('treats %s as LTR', (lang) => {
        expect(isRtlLanguage(lang)).toBe(false);
    });
});
