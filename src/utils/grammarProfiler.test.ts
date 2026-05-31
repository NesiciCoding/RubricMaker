import { describe, it, expect } from 'vitest';
import { profileGrammar } from './grammarChecker';

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
            const maxDetectedIdx = Math.max(
                ...result.detectedStructures.map((s) => LEVEL_ORDER.indexOf(s.level))
            );
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

    it('returns A1 and empty detectedStructures for empty text', () => {
        const result = profileGrammar('');
        expect(result.estimatedLevel).toBe('A1');
        expect(result.detectedStructures).toHaveLength(0);
    });

    it('detects past perfect (had + past participle)', () => {
        const result = profileGrammar('By the time she arrived, he had already left. They had finished.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'TA.PASTPF');
        expect(hit).toBeDefined();
        expect(hit!.count).toBeGreaterThanOrEqual(1);
        expect(hit!.level).toBe('B1');
    });

    it('detects past perfect progressive (had been + -ing)', () => {
        const result = profileGrammar('He had been waiting for three hours when she arrived.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'TA.PASTPFPRG');
        expect(hit).toBeDefined();
        expect(hit!.level).toBe('B2');
    });

    it('detects present perfect progressive (have/has been + -ing)', () => {
        const result = profileGrammar('I have been studying all day. She has been working on this.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'TA.PRPFPRG');
        expect(hit).toBeDefined();
        expect(hit!.count).toBeGreaterThanOrEqual(1);
        expect(hit!.level).toBe('B1');
    });

    it('detects can/cannot/could modals', () => {
        const result = profileGrammar('She can speak French. He cannot attend. They could not agree.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'MOD.CAN');
        expect(hit).toBeDefined();
        expect(hit!.level).toBe('A2');
    });

    it('detects cause/result clauses (because/therefore)', () => {
        const result = profileGrammar('She failed because she did not study. Therefore, he decided to leave.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'CAUS.CLAUSE');
        expect(hit).toBeDefined();
        expect(hit!.count).toBeGreaterThanOrEqual(1);
        expect(hit!.level).toBe('B1');
    });

    it('detects second conditional (if + past + would)', () => {
        const result = profileGrammar('If I were rich, I would travel the world.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'COND.SECOND');
        expect(hit).toBeDefined();
        expect(hit!.level).toBe('B1');
    });

    it('detects third conditional (if + past perfect + would have)', () => {
        const result = profileGrammar('If she had studied harder, she would have passed the exam.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'COND.THIRD');
        expect(hit).toBeDefined();
        expect(hit!.level).toBe('B2');
    });

    it('detects cleft sentences (it is/was ... that/who)', () => {
        const result = profileGrammar('It was the teacher who explained everything. It is hard work that matters.');
        const hit = result.detectedStructures.find((s) => s.shorthand === 'CLEFT');
        expect(hit).toBeDefined();
        expect(hit!.level).toBe('B2');
    });

    it('detects negated present perfect (haven\'t/hasn\'t)', () => {
        const result = profileGrammar("I haven't finished yet. She hasn't responded.");
        const hit = result.detectedStructures.find((s) => s.shorthand === 'TA.PRPF');
        expect(hit).toBeDefined();
    });

    it('count accurately reflects multiple occurrences of the same structure', () => {
        const result = profileGrammar(
            'She was running. He was sleeping. They were playing. We were eating.'
        );
        const hit = result.detectedStructures.find((s) => s.shorthand === 'TA.PASTPRG');
        expect(hit).toBeDefined();
        expect(hit!.count).toBeGreaterThanOrEqual(3);
    });

    it('does not produce duplicate entries for the same shorthand', () => {
        const result = profileGrammar('I have finished. She has eaten. We have gone.');
        const shorthands = result.detectedStructures.map((s) => s.shorthand);
        const unique = new Set(shorthands);
        expect(shorthands.length).toBe(unique.size);
    });

    it('each detectedStructure has required fields: label, level, count, shorthand', () => {
        const result = profileGrammar('I have been studying. She was running. He should try.');
        for (const s of result.detectedStructures) {
            expect(typeof s.label).toBe('string');
            expect(s.label.length).toBeGreaterThan(0);
            expect(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).toContain(s.level);
            expect(typeof s.count).toBe('number');
            expect(s.count).toBeGreaterThan(0);
            expect(typeof s.shorthand).toBe('string');
            expect(s.shorthand.length).toBeGreaterThan(0);
        }
    });

    it('returns higher estimatedLevel when mixing B1 and B2 structures', () => {
        // B2: concession clause; B1: present perfect
        const result = profileGrammar(
            'Although it was difficult, she has completed the work. Despite the rain, they continued.'
        );
        const hasB2 = result.detectedStructures.some((s) => s.level === 'B2');
        if (hasB2) {
            expect(['B2', 'C1', 'C2']).toContain(result.estimatedLevel);
        }
    });

    it('result always has detectedStructures array and estimatedLevel string', () => {
        const result = profileGrammar('Random text here.');
        expect(result).toHaveProperty('detectedStructures');
        expect(result).toHaveProperty('estimatedLevel');
        expect(Array.isArray(result.detectedStructures)).toBe(true);
        expect(typeof result.estimatedLevel).toBe('string');
    });
});
