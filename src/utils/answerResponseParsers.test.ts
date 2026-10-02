import { describe, expect, it } from 'vitest';
import { parseErrorPicks, parsePlacedWords } from './answerResponseParsers';

describe('answer response parsers', () => {
    it('reads well-formed responses', () => {
        expect(parseErrorPicks('{"0":"goes","2":""}')).toEqual({ 0: 'goes', 2: '' });
        expect(parsePlacedWords('["I","go"]')).toEqual(['I', 'go']);
    });

    it('treats wrong-shaped or malformed JSON as no answer', () => {
        for (const bad of ['', 'null', '5', '"x"', '[1]', '{nope']) {
            expect(parseErrorPicks(bad)).toEqual({});
        }
        for (const bad of ['', 'null', '{"0":"I"}', '5', '{nope']) {
            expect(parsePlacedWords(bad)).toEqual([]);
        }
        expect(parseErrorPicks('{"0":5}')).toEqual({ 0: '' });
        expect(parsePlacedWords('["I",3,null]')).toEqual(['I']);
    });
});
