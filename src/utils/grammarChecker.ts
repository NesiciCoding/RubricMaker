import type { CefrGrammarHit, CefrGrammarProfile, CefrLevel, GrammarError } from '../types';
import nlp from 'compromise';

/** compromise's own .d.ts doesn't propagate the sentence view type through .forEach() — only type what we actually use. */
interface SentenceView {
    verbs(): { out(format: string): string[] };
    text(): string;
}

const LT_API = 'https://api.languagetool.org/v2/check';
const TIMEOUT_MS = 8000;
// LanguageTool public API hard limit: 20 KB per request
const LT_MAX_BYTES = 20 * 1024;

export const LT_ATTRIBUTION_URL = 'https://languagetool.org';

interface LtMatch {
    message: string;
    offset: number;
    length: number;
    replacements: { value: string }[];
    rule?: { id: string };
}

/** Truncate text to stay within LT's 20 KB per-request byte limit. */
function truncateToBytes(text: string, maxBytes: number): string {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    if (encoded.length <= maxBytes) return text;
    // Decode the allowed slice — TextDecoder handles partial multi-byte chars safely
    return new TextDecoder().decode(encoded.slice(0, maxBytes));
}

async function checkWithLanguageTool(text: string, language: string): Promise<GrammarError[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const body = new URLSearchParams({ text, language, enabledOnly: 'false' });

    const res = await fetch(LT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 429) throw new Error('RATE_LIMITED');
    if (!res.ok) throw new Error(`LanguageTool returned ${res.status}`);

    const json = await res.json();
    return (json.matches as LtMatch[]).map((m) => ({
        message: m.message,
        offset: m.offset,
        length: m.length,
        suggestions: m.replacements.slice(0, 3).map((r) => r.value),
        ruleId: m.rule?.id,
    }));
}

/**
 * Detects likely sentence fragments and repeated consecutive words in the input text.
 *
 * Detects sentences that appear to lack a verb (possible fragments) and occurrences of repeated consecutive words (e.g., "the the"), returning one GrammarError entry per finding.
 *
 * @returns An array of GrammarError objects describing each detected issue.
 */
async function checkWithCompromise(text: string): Promise<GrammarError[]> {
    const errors: GrammarError[] = [];
    const doc = nlp(text);

    // Detect sentences that lack a verb (likely fragments)
    doc.sentences().forEach((sent) => {
        const view = sent as unknown as SentenceView;
        const verbs = view.verbs().out('array');
        if (verbs.length === 0) {
            const sentText: string = view.text();
            const offset = text.indexOf(sentText);
            if (offset >= 0 && sentText.length > 10) {
                errors.push({
                    message: 'Possible sentence fragment — no verb detected.',
                    offset,
                    length: sentText.length,
                    suggestions: [],
                    ruleId: 'COMPROMISE_FRAGMENT',
                });
            }
        }
    });

    // Detect repeated consecutive words (e.g. "the the")
    const repeatedWord = /\b(\w+)\s+\1\b/gi;
    let m: RegExpExecArray | null;
    while ((m = repeatedWord.exec(text)) !== null) {
        errors.push({
            message: `Repeated word: "${m[1]}"`,
            offset: m.index,
            length: m[0].length,
            suggestions: [m[1]],
            ruleId: 'COMPROMISE_REPEATED_WORD',
        });
    }

    return errors;
}

// ─── CEFR Grammar Profiler ───────────────────────────────────────────────────

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface GrammarPattern {
    shorthand: string;
    label: string;
    level: CefrLevel;
    detect: (text: string, doc: ReturnType<typeof nlp>) => number;
}

const countMatches = (text: string, re: RegExp) => {
    const m = text.match(new RegExp(re.source, 'gi'));
    return m ? m.length : 0;
};

const GRAMMAR_PATTERNS: GrammarPattern[] = [
    {
        shorthand: 'TA.PRPF',
        label: 'Present perfect (have/has + past participle)',
        level: 'B1',
        detect: (t) => countMatches(t, /\b(have|has|haven'?t|hasn'?t)\s+\w+(ed|en|oken|tten|one|awn|rown|wn)\b/),
    },
    {
        shorthand: 'TA.PRPFPRG',
        label: 'Present perfect progressive (have/has been + -ing)',
        level: 'B1',
        detect: (t) => countMatches(t, /\b(have|has)\s+been\s+\w+ing\b/),
    },
    {
        shorthand: 'TA.PASTPRG',
        label: 'Past progressive (was/were + -ing)',
        level: 'A2',
        detect: (t) => countMatches(t, /\b(was|were)\s+\w+ing\b/),
    },
    {
        shorthand: 'TA.PASTPF',
        label: 'Past perfect (had + past participle)',
        level: 'B1',
        detect: (t) => countMatches(t, /\bhad\s+\w+(ed|en|oken|tten|one|awn|rown|wn)\b/),
    },
    {
        shorthand: 'TA.PASTPFPRG',
        label: 'Past perfect progressive (had been + -ing)',
        level: 'B2',
        detect: (t) => countMatches(t, /\bhad\s+been\s+\w+ing\b/),
    },
    {
        shorthand: 'PASS',
        label: 'Passive voice (be + past participle)',
        level: 'B1',
        detect: (_, doc) => doc.match('#Passive').length,
    },
    {
        shorthand: 'MOD.CAN',
        label: 'Modal: can/could',
        level: 'A2',
        detect: (t) => countMatches(t, /\b(can|cannot|can'?t|could|couldn'?t)\b/),
    },
    {
        shorthand: 'MOD.SHOULD',
        label: 'Modal: should/would/must/might',
        level: 'B1',
        detect: (t) => countMatches(t, /\b(should|shouldn'?t|would|wouldn'?t|must|mustn'?t|might)\b/),
    },
    {
        shorthand: 'REL.CLAUSE',
        label: 'Relative clause (who/which/that/whom)',
        level: 'B1',
        detect: (t) => countMatches(t, /\b(who|which|that|whom|whose)\s+\w+/),
    },
    {
        shorthand: 'COND.ZERO_FIRST',
        label: 'Zero/first conditional (if + present/future)',
        level: 'B1',
        detect: (t) => countMatches(t, /\bif\s+\w+\s+(is|are|will|do|does)\b/),
    },
    {
        shorthand: 'COND.SECOND',
        label: 'Second conditional (if + past + would)',
        level: 'B1',
        detect: (t) => countMatches(t, /\bif\s+\w+\s+(were|was|had|did|could)\b.*\bwould\b/),
    },
    {
        shorthand: 'COND.THIRD',
        label: 'Third conditional (if + past perfect + would have)',
        level: 'B2',
        detect: (t) => countMatches(t, /\bif\s+\w+\s+had\s+\w+(ed|en)\b.*\bwould\s+have\b/),
    },
    {
        shorthand: 'REP.SPEECH',
        label: 'Reported speech (said/told that)',
        level: 'B1',
        detect: (t) => countMatches(t, /\b(said|told|explained|mentioned|stated|argued|claimed)\s+(that\s+)?\w+/),
    },
    {
        shorthand: 'INF.CLAUSE',
        label: 'Infinitive clause (verb + to + infinitive)',
        level: 'B1',
        detect: (_, doc) => doc.match('#Verb to #Verb').length,
    },
    {
        shorthand: 'CLEFT',
        label: 'Cleft sentence (it is/was ... that/who)',
        level: 'B2',
        detect: (t) => countMatches(t, /\bit\s+(is|was)\s+\w+\s+(that|who)\b/),
    },
    {
        shorthand: 'CONC.CLAUSE',
        label: 'Concession clause (although/even though/despite)',
        level: 'B2',
        detect: (t) => countMatches(t, /\b(although|even though|despite|whereas|nevertheless|nonetheless)\b/),
    },
    {
        shorthand: 'CAUS.CLAUSE',
        label: 'Cause/result clause (because/therefore/consequently)',
        level: 'B1',
        detect: (t) => countMatches(t, /\b(because|therefore|consequently|as a result|due to|owing to)\b/),
    },
    {
        shorthand: 'PRES.PROG',
        label: 'Present continuous (am/is/are + -ing)',
        level: 'A1',
        detect: (t) => countMatches(t, /\b(am|is|are|'m|'re|'s)\s+\w+ing\b/),
    },
    {
        shorthand: 'FUT.WILL',
        label: 'Future with will (will + base verb)',
        level: 'A2',
        detect: (t) => countMatches(t, /\b(will|'ll|won'?t)\s+\w+\b/),
    },
    {
        shorthand: 'FUT.GOING',
        label: 'Future with going to',
        level: 'A2',
        detect: (t) => countMatches(t, /\b(am|is|are|'m|'re|'s)\s+going\s+to\s+\w+\b/),
    },
    {
        // ponytail: regular = past-tense word ending -ed; misses spelling-irregular -ed forms (e.g. "spelt"). Good-enough heuristic.
        shorthand: 'PAST.SIMPLE.REG',
        label: 'Past simple, regular verbs (-ed)',
        level: 'A1',
        detect: (_, doc) => (doc.match('#PastTense').out('array') as string[]).filter((w) => /ed$/i.test(w)).length,
    },
    {
        // ponytail: irregular = past-tense word NOT ending -ed; relies on compromise's #PastTense tagging.
        shorthand: 'PAST.SIMPLE.IRREG',
        label: 'Past simple, irregular verbs',
        level: 'A2',
        detect: (_, doc) => (doc.match('#PastTense').out('array') as string[]).filter((w) => !/ed$/i.test(w)).length,
    },
    {
        shorthand: 'COMP.ADJ',
        label: 'Comparative adjectives (-er / more)',
        level: 'A2',
        detect: (_, doc) => doc.match('#Comparative').length,
    },
    {
        shorthand: 'SUP.ADJ',
        label: 'Superlative adjectives (-est / most)',
        level: 'A2',
        detect: (_, doc) => doc.match('#Superlative').length,
    },
    {
        shorthand: 'ART.INDEF',
        label: 'Indefinite article (a / an)',
        level: 'A1',
        detect: (t) => countMatches(t, /\b(a|an)\s+\w+/),
    },
];

/**
 * Analyze text for CEFR-graded grammatical structures and produce a CEFR profile.
 *
 * Scans the input for a curated set of grammar patterns and reports each detected
 * structure with its CEFR level and occurrence count. The overall `estimatedLevel`
 * is the highest CEFR level found among detected structures.
 *
 * @returns An object containing `detectedStructures` (an array of detected grammar hits with `label`, `level`, `count`, and `shorthand`) and `estimatedLevel` (the highest CEFR level detected, one of `A1` through `C2`)
 */
export function profileGrammar(text: string): CefrGrammarProfile {
    const doc = nlp(text);
    const detected: CefrGrammarHit[] = [];

    for (const pattern of GRAMMAR_PATTERNS) {
        const count = pattern.detect(text, doc);
        if (count > 0) {
            detected.push({ label: pattern.label, level: pattern.level, count, shorthand: pattern.shorthand });
        }
    }

    // Estimated level: highest level among detected structures
    let estimatedLevel: CefrLevel = 'A1';
    for (const hit of detected) {
        if (LEVEL_ORDER.indexOf(hit.level) > LEVEL_ORDER.indexOf(estimatedLevel)) {
            estimatedLevel = hit.level;
        }
    }

    return { detectedStructures: detected, estimatedLevel };
}

/**
 * Count occurrences of specific grammar patterns (by shorthand) in the text.
 * Used by the grammar linker to evaluate exactly the structures linked to a rubric
 * criterion. Unknown shorthands (no matching rule) are omitted from the result.
 */
export function detectGrammar(text: string, shorthands: string[]): Record<string, number> {
    const doc = nlp(text);
    const wanted = new Set(shorthands);
    const result: Record<string, number> = {};
    for (const pattern of GRAMMAR_PATTERNS) {
        if (wanted.has(pattern.shorthand)) {
            result[pattern.shorthand] = pattern.detect(text, doc);
        }
    }
    return result;
}

/**
 * Checks the given text for grammatical issues, preferring LanguageTool and falling back to a local compromise-based detector.
 *
 * @param language - BCP 47 language tag to request from LanguageTool (default: 'en-US')
 * @returns An object with `errors` (detected grammar issues), `source` (which detector produced the results: `'languagetool'` or `'compromise'`), and `textWasTruncated` (`true` if the submitted text was truncated to meet the service byte limit)
 */
export async function checkGrammar(
    text: string,
    language = 'en-US'
): Promise<{ errors: GrammarError[]; source: 'languagetool' | 'compromise'; textWasTruncated: boolean }> {
    const encoder = new TextEncoder();
    const originalBytes = encoder.encode(text).length;
    const sample = truncateToBytes(text, LT_MAX_BYTES);
    const textWasTruncated = encoder.encode(sample).length < originalBytes;

    try {
        const errors = await checkWithLanguageTool(sample, language);
        return { errors, source: 'languagetool', textWasTruncated };
    } catch {
        const errors = await checkWithCompromise(sample);
        return { errors, source: 'compromise', textWasTruncated };
    }
}
