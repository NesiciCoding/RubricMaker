import { describe, expect, it } from 'vitest';
import { gapStems, suggestDerivedForms } from './wordFormation';

describe('suggestDerivedForms', () => {
    it('offers real derived forms only', () => {
        const forms = suggestDerivedForms('happy');
        expect(forms.length).toBeGreaterThan(0);
        expect(forms).not.toContain('happy');
        expect(forms).not.toContain('happyness');
        expect(suggestDerivedForms('happy')).toEqual(forms);
    });
    it('includes compromise inflections and ignores junk input', () => {
        expect(suggestDerivedForms('go')).toEqual([]);
        expect(suggestDerivedForms('act')).toEqual(expect.arrayContaining(['action']));
        expect(suggestDerivedForms('123')).toEqual([]);
    });
});

describe('gapStems', () => {
    it('reads the (STEM) written after each gap', () => {
        expect(gapStems('Her {{happiness}}(HAPPY) was clear but the {{end}} was not.')).toEqual(['HAPPY', null]);
    });
});
