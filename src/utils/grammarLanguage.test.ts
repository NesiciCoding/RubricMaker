import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectTextLanguage, resolveGrammarLanguage } from './grammarLanguage';
import { checkGrammar } from './grammarChecker';

const SAMPLES = {
    en: 'I think that the school trip was great, and the teachers were very kind to us. It is a shame that it rained.',
    nl: 'Ik vind dat de schoolreis heel leuk was en de leraren waren ook erg aardig. Het is jammer dat het niet zonnig was.',
    fr: "Je pense que le voyage scolaire était super et les professeurs sont gentils avec nous. C'est dommage qu'il pleuve dans la ville.",
    de: 'Ich finde, dass die Klassenfahrt toll war und die Lehrer sind auch sehr nett zu uns. Es ist schade, dass es nicht sonnig war.',
    es: 'Creo que el viaje escolar fue muy bueno y los profesores son amables con nosotros. Es una pena que no hiciera sol en la ciudad.',
};

describe('detectTextLanguage', () => {
    it.each(Object.entries(SAMPLES))('detects %s', (lang, text) => {
        expect(detectTextLanguage(text)).toBe(lang);
    });

    it('returns null when there is too little text to decide', () => {
        expect(detectTextLanguage('Hello')).toBeNull();
        expect(detectTextLanguage('')).toBeNull();
        expect(detectTextLanguage('12345 !!! ---')).toBeNull();
    });
});

describe('resolveGrammarLanguage', () => {
    it('uses the teacher’s English variant for English text', () => {
        expect(resolveGrammarLanguage(SAMPLES.en, 'en-GB')).toBe('en-GB');
        expect(resolveGrammarLanguage(SAMPLES.en, 'en-US')).toBe('en-US');
    });

    it('defaults English to en-US', () => {
        expect(resolveGrammarLanguage(SAMPLES.en)).toBe('en-US');
    });

    it('maps other detected languages to LanguageTool codes', () => {
        expect(resolveGrammarLanguage(SAMPLES.nl, 'en-GB')).toBe('nl');
        expect(resolveGrammarLanguage(SAMPLES.fr, 'en-GB')).toBe('fr');
        expect(resolveGrammarLanguage(SAMPLES.de, 'en-GB')).toBe('de-DE');
        expect(resolveGrammarLanguage(SAMPLES.es, 'en-GB')).toBe('es');
    });

    it('falls back to the English variant when the language is unclear', () => {
        expect(resolveGrammarLanguage('Okay.', 'en-GB')).toBe('en-GB');
    });
});

describe('checkGrammar language allowlist', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubFetch() {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ matches: [] }),
        });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    function sentLanguage(fetchMock: ReturnType<typeof vi.fn>): string | null {
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        return new URLSearchParams(String(init.body)).get('language');
    }

    it('sends an allowed language as given', async () => {
        const fetchMock = stubFetch();
        await checkGrammar('Dit is een test.', 'nl');
        expect(sentLanguage(fetchMock)).toBe('nl');
    });

    it('replaces auto or unknown languages with en-US', async () => {
        const fetchMock = stubFetch();
        await checkGrammar('This is a test.', 'auto');
        expect(sentLanguage(fetchMock)).toBe('en-US');
    });
});
