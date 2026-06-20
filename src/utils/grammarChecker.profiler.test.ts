import { describe, it, expect } from 'vitest';
import { profileGrammar, detectGrammar } from './grammarChecker';

describe('detectGrammar', () => {
    it('counts regular past-simple verbs separately from irregular ones', () => {
        const counts = detectGrammar('She walked home and played outside, then went inside and saw the dog.', [
            'PAST.SIMPLE.REG',
            'PAST.SIMPLE.IRREG',
        ]);
        expect(counts['PAST.SIMPLE.REG']).toBeGreaterThan(0);
        expect(counts['PAST.SIMPLE.IRREG']).toBeGreaterThan(0);
    });

    it('omits unknown shorthands', () => {
        const counts = detectGrammar('Hello world.', ['NOPE.NOT.A.RULE']);
        expect(counts['NOPE.NOT.A.RULE']).toBeUndefined();
    });
});

describe('profileGrammar', () => {
    it('returns A1 estimated level for text with no advanced structures', () => {
        const result = profileGrammar('I like dogs. She is happy. The cat is small.');
        expect(result.estimatedLevel).toBe('A1');
        expect(result.detectedStructures).toHaveLength(0);
    });

    it('detects present perfect', () => {
        const result = profileGrammar('She has completed the assignment. They have finished the work.');
        const hasPP = result.detectedStructures.some((s) => s.shorthand === 'TA.PRPF');
        expect(hasPP).toBe(true);
    });

    it('present perfect maps to B1', () => {
        const result = profileGrammar('He has written an excellent essay.');
        const pp = result.detectedStructures.find((s) => s.shorthand === 'TA.PRPF');
        if (pp) expect(pp.level).toBe('B1');
    });

    it('detects past progressive', () => {
        const result = profileGrammar('They were studying when the teacher arrived.');
        const hasPastPrg = result.detectedStructures.some((s) => s.shorthand === 'TA.PASTPRG');
        expect(hasPastPrg).toBe(true);
    });

    it('detects relative clauses', () => {
        const result = profileGrammar('The student who passed the exam was celebrated.');
        const hasRel = result.detectedStructures.some((s) => s.shorthand === 'REL.CLAUSE');
        expect(hasRel).toBe(true);
    });

    it('detects reported speech', () => {
        const result = profileGrammar('She said that the results were very good.');
        const hasRep = result.detectedStructures.some((s) => s.shorthand === 'REP.SPEECH');
        expect(hasRep).toBe(true);
    });

    it('detects modal verbs', () => {
        const result = profileGrammar('You should always check your work before submitting it.');
        const hasMod = result.detectedStructures.some((s) => s.shorthand === 'MOD.SHOULD');
        expect(hasMod).toBe(true);
    });

    it('returns estimatedLevel as the highest detected structure level', () => {
        const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const result = profileGrammar(
            'She has written a report. It was written by experts. If he had done it, they would have passed.'
        );
        if (result.detectedStructures.length > 0) {
            const maxDetectedIdx = Math.max(...result.detectedStructures.map((s) => LEVEL_ORDER.indexOf(s.level)));
            expect(LEVEL_ORDER.indexOf(result.estimatedLevel)).toBe(maxDetectedIdx);
        }
    });

    it('detects concession clauses', () => {
        const result = profileGrammar('Although the weather was bad, they continued the trip.');
        const hasConc = result.detectedStructures.some((s) => s.shorthand === 'CONC.CLAUSE');
        expect(hasConc).toBe(true);
    });

    it('count is at least 1 for each detected structure', () => {
        const result = profileGrammar('She has done the homework. He has seen the film.');
        result.detectedStructures.forEach((s) => {
            expect(s.count).toBeGreaterThanOrEqual(1);
        });
    });
});
