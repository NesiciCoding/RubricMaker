import { describe, it, expect } from 'vitest';
import fixtures from './__fixtures__/grammarProfile.conllu.json';
import { parseConlluSentences } from './udParse';
import { constructionsAtLevel, profileUdSentences } from './grammarProfile';
import { GRAMMAR_CONSTRUCTIONS, CEFRJ_CODE_LEVELS } from '../data/grammarConstructions';
import type { CefrLevel } from '../types';

// CoNLL-U snapshots produced by UDPipe (english-ewt-ud-2.5) so the tests need no model or wasm.
const conllu = fixtures as Record<string, string>;

function profile(text: string) {
    const r = profileUdSentences(parseConlluSentences(conllu[text]));
    const ids = new Set(Object.values(r.results).flatMap((b) => b.constructions.map((c) => c.id)));
    return { r, ids };
}

// Same cases as vocabkitchen-CLI test_grammar_profile.py detect_check(...)
const CASES: [string, string, CefrLevel, string[]?][] = [
    ['She has been working all day.', 'pres_perf_prog', 'B2'],
    ['The book was written last year.', 'passive_past', 'A2'],
    ['The work must be finished today.', 'passive_modal', 'B1'],
    ['The window got broken.', 'get_passive', 'B1'],
    ['I can swim well.', 'modal_can', 'A1'],
    ['I am going to travel next week.', 'future_going_to', 'A2'],
    ['I have to leave now.', 'have_to', 'A2'],
    ['She used to smoke.', 'used_to', 'B1'],
    ['If I had known, I would have helped.', 'cond_third', 'B1'],
    ['If it rains, we will stay home.', 'cond_first', 'A2'],
    ['The man who lives here is kind.', 'rel_who', 'A1'],
    ['The book which I read was long.', 'rel_which', 'B2'],
    ['I want to learn French.', 'to_inf', 'A1'],
    ['The house needs to be cleaned.', 'to_be_done', 'B2'],
    ['She is taller than him.', 'comp_er', 'A1'],
    ['This is the biggest house.', 'superl_est', 'A1'],
    ['There is a book here.', 'there_be', 'A1'],
    ['What did you do?', 'wh_question', 'A1'],
    ["You like tea, don't you?", 'tag_question', 'B1'],
    ['Sit down.', 'imperative', 'A1'],
    ["Don't touch that.", 'neg_imperative', 'B1'],
    ['She made me laugh.', 'caus_make', 'A2'],
    ['Never have I seen such a thing.', 'inversion_neg', 'C1'],
    ['You ought to leave.', 'ought_to', 'B1', ['modal_can']],
    ['You had better go now.', 'had_better', 'B2', ['comp_er']],
    ['She is as tall as her brother.', 'as_as', 'B2'],
    ['I wish I had a car.', 'wish_clause', 'B2'],
    ['My sister, who is older, sings.', 'rel_nonrestrictive', 'B1'],
    ['Having finished, she left.', 'having_pp', 'B2'],
    ['Being asked twice, he agreed.', 'being_pp', 'B2'],
    ['I had my hair cut.', 'caus_have_pp', 'B2'],
    ['I suggest that he leave now.', 'subjunctive_mandative', 'C1'],
    ['I know what you did.', 'wh_clause', 'B1', ['wh_question']],
];

describe('grammarProfile parity with vocabkitchen-CLI detect_check cases', () => {
    it.each(CASES)('%s → %s', (text, id, level, forbidden = []) => {
        const { r, ids } = profile(text);
        expect(ids.has(id)).toBe(true);
        expect(r.results[level].constructions.map((c) => c.id)).toContain(id);
        for (const f of forbidden) expect(ids.has(f)).toBe(false);
    });
});

describe('grammarProfile extras', () => {
    it('treats a copular predicate as present simple (be) and past simple (be)', () => {
        expect(profile('The sky is blue.').ids.has('pres_simple_be')).toBe(true);
        expect(profile('She was happy yesterday.').ids.has('past_simple_be')).toBe(true);
    });
    it('does not report "Let\'s go" as a causative', () => {
        const { ids } = profile("Let's go home.");
        expect(ids.has('lets')).toBe(true);
        expect(ids.has('caus_make')).toBe(false);
    });
    it('does not report existential there as present simple', () => {
        const { ids } = profile('There is a book here.');
        expect(ids.has('pres_simple_be')).toBe(false);
    });
    it('estimates typical and reaching level and does not misfire on a plain sentence', () => {
        const { r, ids } = profile('The cat sat on the mat.');
        expect(ids.has('past_simple')).toBe(true);
        expect(ids.has('passive_past')).toBe(false);
        expect(r.estimatedLevel).toEqual({ typical: 'A1', reaches: 'A1' });
        expect(r.sentenceCount).toBe(1);
        expect(r.tokenCount).toBe(6);
    });
    it('reports the highest band reached', () => {
        expect(profile('Never have I seen such a thing.').r.estimatedLevel.reaches).toBe('C1');
    });
});

describe('construction registry', () => {
    it('resolves every construction to a CEFR band and partitions the registry', () => {
        const levels: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const total = levels.reduce((n, l) => n + constructionsAtLevel(l).length, 0);
        expect(total).toBe(GRAMMAR_CONSTRUCTIONS.length);
        expect(constructionsAtLevel('B1').length).toBeGreaterThan(5);
    });
    it('reads CEFR-J levels', () => {
        expect(CEFRJ_CODE_LEVELS['TA.PRPF.AFF']).toBe('A2');
        expect(CEFRJ_CODE_LEVELS['MD.can.AFF']).toBe('A1');
        expect(CEFRJ_CODE_LEVELS['TO.to_have_done']).toBe('C1');
    });
});
