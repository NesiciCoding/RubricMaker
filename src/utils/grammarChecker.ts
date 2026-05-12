import type { GrammarError } from '../types';
import nlp from 'compromise';

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
    return (json.matches as LtMatch[]).map(m => ({
        message: m.message,
        offset: m.offset,
        length: m.length,
        suggestions: m.replacements.slice(0, 3).map(r => r.value),
        ruleId: m.rule?.id,
    }));
}

async function checkWithCompromise(text: string): Promise<GrammarError[]> {
    const errors: GrammarError[] = [];
    const doc = nlp(text);

    // Detect sentences that lack a verb (likely fragments)
    doc.sentences().forEach((sent: any) => {
        const verbs = sent.verbs().out('array') as string[];
        if (verbs.length === 0) {
            const sentText: string = sent.text();
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
