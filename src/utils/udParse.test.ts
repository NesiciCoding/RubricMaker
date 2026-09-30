import { describe, it, expect } from 'vitest';
import { parseConlluSentences } from './udParse';

const CONLLU = [
    '# sent_id = 1',
    '# text = She was seen.',
    '1\tShe\tshe\tPRON\tPRP\tCase=Nom|Number=Sing|Person=3\t3\tnsubj:pass\t_\t_',
    '2\twas\tbe\tAUX\tVBD\tMood=Ind|Tense=Past\t3\taux:pass\t_\t_',
    '3\tseen\tsee\tVERB\tVBN\tTense=Past|VerbForm=Part\t0\troot\t_\tSpaceAfter=No',
    '4\t.\t.\tPUNCT\t.\t_\t3\tpunct\t_\tSpacesAfter=\\n',
    '',
    '# text = No.',
    "1-2\tdon't\t_\t_\t_\t_\t_\t_\t_\t_",
    '1\tNo\tno\tINTJ\tUH\t_\t0\troot\t_\tSpaceAfter=No',
    '',
].join('\n');

describe('parseConlluSentences', () => {
    const [s1, s2] = parseConlluSentences(CONLLU);

    it('splits sentences and keeps the # text line', () => {
        expect(s1.text).toBe('She was seen.');
        expect(s2.tokens).toHaveLength(1);
    });
    it('keeps xpos and FEATS that udpipe-wasm drops', () => {
        expect(s1.tokens[1].tag).toBe('VBD');
        expect(s1.tokens[1].feats).toEqual({ Mood: 'Ind', Tense: 'Past' });
    });
    it('converts to 0-based heads and spaCy-style labels', () => {
        expect(s1.tokens[2].head).toBe(-1);
        expect(s1.tokens[2].dep).toBe('ROOT');
        expect(s1.tokens[0].dep).toBe('nsubjpass');
        expect(s1.tokens[1].dep).toBe('auxpass');
        expect(s1.head(s1.tokens[0])?.form).toBe('seen');
    });
    it('exposes children, subtree and span text', () => {
        expect(s1.children(2).map((t) => t.form)).toEqual(['She', 'was', '.']);
        expect(s1.subtree(s1.tokens[2])).toHaveLength(4);
        expect(s1.spanText(0, 2)).toBe('She was seen');
    });
    it('skips multiword-token ranges', () => {
        expect(s2.tokens.map((t) => t.form)).toEqual(['No']);
    });

    it('reads CRLF input without carrying carriage returns into the text or tokens', () => {
        const [sentence] = parseConlluSentences(CONLLU.replace(/\n/g, '\r\n'));
        expect(sentence.text).toBe('She was seen.');
        expect(sentence.tokens[2].spaceAfter).toBe(false);
        expect(sentence.tokens[2].deprel).toBe('root');
    });
});
