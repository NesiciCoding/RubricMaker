/**
 * The cheap proofreading mark: a code the teacher types at the start of an ordinary document
 * comment. Deliberately convention-only — no new entity, no field, no picker state — so a comment
 * written on paper ("sp recieve → receive") reads the same here.
 */
export const PROOF_CODES = ['sp', 'del', 'ins', 'tr', 'lc', 'caps', 'ital', 'bf', 'ul', '¶', ',', '.', "'"] as const;

export type ProofCode = (typeof PROOF_CODES)[number];

/**
 * Shape only, not membership: a letter run of 1-4 or one punctuation code, followed by a separator
 * or the end. `\b` cannot be used here — it fails on the punctuation codes because there is no word
 * character on one side.
 */
const CODE_SHAPE = /^\s*([a-z]{1,4}|[,;:.¶'])(?=[\s—–-]|$)/i;

export function codeFromText(text: string): string | null {
    const match = CODE_SHAPE.exec(text);
    return match ? match[1].toLowerCase() : null;
}

export function isProofCode(value: string | null | undefined): value is ProofCode {
    return typeof value === 'string' && (PROOF_CODES as readonly string[]).includes(value);
}

/**
 * The code the comment opens with, but only when it is one we know. Membership is what keeps
 * "Great point" from rendering a `grea` chip: the word must be a code, not merely code-shaped.
 */
export function knownCode(text: string): ProofCode | null {
    const code = codeFromText(text);
    return code !== null && isProofCode(code) ? code : null;
}

/** Prefix a comment with a code, unless it already opens with one. */
export function withProofCode(code: ProofCode, text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return `${code} `;
    return knownCode(trimmed) ? trimmed : `${code} ${trimmed}`;
}

export function stripProofCode(text: string): string {
    const code = codeFromText(text);
    if (!code || !isProofCode(code)) return text;
    return text
        .trim()
        .slice(code.length)
        .replace(/^[\s—–-]+/, '');
}
