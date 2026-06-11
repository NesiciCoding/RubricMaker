import { describe, it, expect } from 'vitest';
import { CAMBRIDGE_EXAMS, cambridgeExamForLevel } from './cambridgeExams';
import type { CefrLevel } from '../types';

describe('CAMBRIDGE_EXAMS', () => {
    it('contains exactly 5 entries, one per A2-C2 level', () => {
        expect(CAMBRIDGE_EXAMS).toHaveLength(5);
        const levels = CAMBRIDGE_EXAMS.map((exam) => exam.cefrLevel).sort();
        expect(levels).toEqual(['A2', 'B1', 'B2', 'C1', 'C2']);
    });

    it('does not include an entry for A1', () => {
        expect(CAMBRIDGE_EXAMS.find((exam) => exam.cefrLevel === 'A1')).toBeUndefined();
    });

    it('has the expected short labels', () => {
        const shortLabels = CAMBRIDGE_EXAMS.map((exam) => exam.shortLabel).sort();
        expect(shortLabels).toEqual(['CAE', 'CPE', 'FCE', 'KET', 'PET']);
    });

    it('every entry has a non-empty id, label, and shortLabel', () => {
        for (const exam of CAMBRIDGE_EXAMS) {
            expect(exam.id).toBeTruthy();
            expect(exam.label).toBeTruthy();
            expect(exam.shortLabel).toBeTruthy();
        }
    });
});

describe('cambridgeExamForLevel', () => {
    const expected: Record<Exclude<CefrLevel, 'A1'>, string> = {
        A2: 'KET',
        B1: 'PET',
        B2: 'FCE',
        C1: 'CAE',
        C2: 'CPE',
    };

    for (const [level, shortLabel] of Object.entries(expected) as [CefrLevel, string][]) {
        it(`returns the ${shortLabel} entry for ${level}`, () => {
            const exam = cambridgeExamForLevel(level);
            expect(exam).not.toBeNull();
            expect(exam?.shortLabel).toBe(shortLabel);
            expect(exam?.cefrLevel).toBe(level);
        });
    }

    it('returns null for A1', () => {
        expect(cambridgeExamForLevel('A1')).toBeNull();
    });
});
