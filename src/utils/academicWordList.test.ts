import { describe, it, expect } from 'vitest';
import { classifyAcademic, academicCoverage } from './academicWordList';
import { AWL_WORDS } from '../data/academicWordLists';

describe('classifyAcademic', () => {
    it('recognises Academic Word List members', () => {
        expect(classifyAcademic('analysis')).toBe('awl');
        expect(classifyAcademic('research')).toBe('awl');
    });

    it('returns null for non-academic words', () => {
        expect(classifyAcademic('cat')).toBeNull();
        expect(classifyAcademic('zxqywv')).toBeNull();
    });
});

describe('academicCoverage', () => {
    it('returns zeroed coverage for no tokens', () => {
        expect(academicCoverage([])).toEqual({ awlPercent: 0, nawlPercent: 0, academicWords: [] });
    });

    it('reports the academic share and distinct academic words', () => {
        const result = academicCoverage(['analysis', 'research', 'cat', 'mat']);
        // 2 of 4 tokens are AWL words
        expect(result.awlPercent).toBeCloseTo(50, 5);
        expect(result.academicWords).toEqual(expect.arrayContaining(['analysis', 'research']));
        expect(result.academicWords).not.toContain('cat');
    });

    it('counts repeated academic words in the share but lists each once', () => {
        const result = academicCoverage(['analysis', 'analysis', 'analysis']);
        expect(result.awlPercent).toBeCloseTo(100, 5);
        expect(result.academicWords).toEqual(['analysis']);
    });

    it('caps the distinct academic-word list at 40', () => {
        const sixtyAcademic = AWL_WORDS.slice(0, 60);
        const result = academicCoverage([...sixtyAcademic]);
        expect(sixtyAcademic.length).toBe(60);
        expect(result.awlPercent).toBeCloseTo(100, 5);
        expect(result.academicWords.length).toBe(40);
    });
});
