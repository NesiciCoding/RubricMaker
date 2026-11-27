import { PROOF_MARK_IDS, type ProofMarkId } from '../data/proofMarks';

/**
 * Codes a teacher types instead of hunting for the glyph. Aliases are an input convenience, not a
 * second vocabulary: every one of them resolves to a registry id, and the id stays the only thing a
 * mark is stored with.
 */
const CODE_ALIASES: Readonly<Record<string, ProofMarkId>> = {
    delete: 'del',
    cut: 'del',
    insert: 'ins',
    caret: 'ins',
    spaces: 'space',
    spacebar: 'space',
    close: 'closeup',
    join: 'closeup',
    paragraph: 'para',
    pilcrow: 'para',
    newline: 'para',
    transpose: 'tr',
    swap: 'tr',
    spelling: 'sp',
    spell: 'sp',
    advisory: 'query',
    check: 'query',
    capitals: 'caps',
    uppercase: 'caps',
    lowercase: 'lc',
    lower: 'lc',
    italic: 'ital',
    italics: 'ital',
    bold: 'bf',
    boldface: 'bf',
    underline: 'ul',
    underlined: 'ul',
    fullstop: 'period',
    dot: 'period',
    apos: 'apostrophe',
    left: 'align-left',
    center: 'align-center',
    centre: 'align-center',
    right: 'align-right',
};

export type MarkCodeStatus = 'exact' | 'fuzzy' | 'ambiguous' | 'none' | 'empty';

export interface MarkCodeResolution {
    /** `exact` covers ids and aliases; only `exact` and `fuzzy` carry a `symbolId`. */
    status: MarkCodeStatus;
    symbolId: ProofMarkId | null;
    /** Every symbol the code could mean — one entry for a match, several for an ambiguous one. */
    candidates: ProofMarkId[];
}

function squash(value: string): string {
    return value.toLowerCase().replace(/[\s\-_]/g, '');
}

const SQUASHED_IDS = PROOF_MARK_IDS.map((id) => ({ id, key: squash(id) }));
const SQUASHED_ALIASES = (Object.keys(CODE_ALIASES) as string[]).map((key) => ({ id: CODE_ALIASES[key]!, key }));
const CODES = [...SQUASHED_IDS, ...SQUASHED_ALIASES];

function dedupe(hits: readonly { id: ProofMarkId }[]): ProofMarkId[] {
    const seen = new Set<ProofMarkId>();
    const ids: ProofMarkId[] = [];
    for (const hit of hits) {
        if (seen.has(hit.id)) continue;
        seen.add(hit.id);
        ids.push(hit.id);
    }
    return ids;
}

/** True when `a` and `b` are at most one insertion, deletion, substitution or adjacent swap apart. */
export function withinOneEdit(a: string, b: string): boolean {
    if (a === b) return true;
    const long = a.length >= b.length ? a : b;
    const short = a.length >= b.length ? b : a;
    if (long.length - short.length > 1) return false;

    let at = 0;
    while (at < short.length && long.charAt(at) === short.charAt(at)) at += 1;

    if (long.length === short.length) {
        // One substitution...
        if (long.slice(at + 1) === short.slice(at + 1)) return true;
        // ...or one adjacent swap, which is how a two-letter code usually gets mistyped.
        return (
            long.charAt(at + 1) === short.charAt(at) &&
            long.charAt(at) === short.charAt(at + 1) &&
            long.slice(at + 2) === short.slice(at + 2)
        );
    }

    return long.slice(at + 1) === short.slice(at);
}

/**
 * Resolves a typed code. The order is the contract: an exact id or alias always wins, so a
 * near-miss can never take a code that already means something; prefix and edit-distance matches
 * only run when nothing is exact, and an ambiguous code resolves to nothing rather than guessing.
 */
export function resolveMarkCode(input: string): MarkCodeResolution {
    const code = squash(input);
    if (!code) return { status: 'empty', symbolId: null, candidates: [] };

    const exact = CODES.find((entry) => entry.key === code);
    if (exact) return { status: 'exact', symbolId: exact.id, candidates: [exact.id] };

    if (code.length >= 2) {
        const prefixed = dedupe(CODES.filter((entry) => entry.key.startsWith(code)));
        if (prefixed.length === 1) return { status: 'fuzzy', symbolId: prefixed[0]!, candidates: prefixed };
        if (prefixed.length > 1) return { status: 'ambiguous', symbolId: null, candidates: prefixed };
    }

    const near = dedupe(CODES.filter((entry) => withinOneEdit(code, entry.key)));
    if (near.length === 1) return { status: 'fuzzy', symbolId: near[0]!, candidates: near };
    if (near.length > 1) return { status: 'ambiguous', symbolId: null, candidates: near };

    return { status: 'none', symbolId: null, candidates: [] };
}
