/**
 * Sub- and superscript inside plain option / item text, written `H_{2}O` and `x^{2}`. The braces are required, so
 * ordinary text (snake_case, 2^10, "~5") is never touched. Options stay plain strings everywhere (answer keys,
 * read-aloud, imports); this only changes how they are displayed.
 */
export type ScriptPart = { kind: 'text' | 'sub' | 'sup'; text: string };

const SCRIPT_PATTERN = /([_^])\{([^{}]+)\}/g;

export function parseInlineScript(text: string): ScriptPart[] {
    const parts: ScriptPart[] = [];
    let last = 0;
    for (const match of text.matchAll(SCRIPT_PATTERN)) {
        if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
        parts.push({ kind: match[1] === '_' ? 'sub' : 'sup', text: match[2] });
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
    return parts;
}

const SUB: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
    '+': '₊',
    '-': '₋',
    '=': '₌',
    '(': '₍',
    ')': '₎',
    a: 'ₐ',
    e: 'ₑ',
    h: 'ₕ',
    i: 'ᵢ',
    j: 'ⱼ',
    k: 'ₖ',
    l: 'ₗ',
    m: 'ₘ',
    n: 'ₙ',
    o: 'ₒ',
    p: 'ₚ',
    r: 'ᵣ',
    s: 'ₛ',
    t: 'ₜ',
    u: 'ᵤ',
    v: 'ᵥ',
    x: 'ₓ',
};
const SUP: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '+': '⁺',
    '-': '⁻',
    '=': '⁼',
    '(': '⁽',
    ')': '⁾',
    i: 'ⁱ',
    n: 'ⁿ',
};

function convert(text: string, map: Record<string, string>): string | null {
    let out = '';
    for (const ch of text) {
        const mapped = map[ch];
        if (!mapped) return null;
        out += mapped;
    }
    return out;
}

/** Plain-text rendering (results, answer keys, read-aloud): Unicode scripts where they exist, else the bare text. */
export function plainInlineScript(text: string): string {
    return parseInlineScript(text)
        .map((part) => {
            if (part.kind === 'text') return part.text;
            return convert(part.text, part.kind === 'sub' ? SUB : SUP) ?? part.text;
        })
        .join('');
}

/** HTML for printing: the text escaped, with sub/superscript as real tags. */
export function inlineScriptHtml(text: string, escape: (value: string) => string): string {
    return parseInlineScript(text)
        .map((part) =>
            part.kind === 'sub'
                ? `<sub>${escape(part.text)}</sub>`
                : part.kind === 'sup'
                  ? `<sup>${escape(part.text)}</sup>`
                  : escape(part.text)
        )
        .join('');
}
