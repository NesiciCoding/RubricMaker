import type { MarkOperation } from '../types';
import { getMarkGlyph, type MarkGlyph, type MarkGlyphId } from './markGlyphs';

/**
 * The symbol set: one entry per mark a teacher can place. A registry rather than a map of
 * components, so adding a symbol is one data edit plus five locale files (PM-02).
 *
 * Ids are deliberately the strings the glyph table uses: a stored mark, and a PM-01 proof code such
 * as `sp` or `del`, then resolves to a symbol without a second lookup table. They stay separate
 * types all the same — a glyph can be redrawn or renamed without rewriting saved marks.
 */
export type ProofMarkId =
    | 'del'
    | 'ins'
    | 'space'
    | 'closeup'
    | 'para'
    | 'tr'
    | 'sp'
    | 'query'
    | 'caps'
    | 'lc'
    | 'ital'
    | 'bf'
    | 'ul'
    | 'comma'
    | 'period'
    | 'apostrophe'
    | 'align-left'
    | 'align-center'
    | 'align-right';

/**
 * A palette group, in palette order. The family owns the in-text cue style (one cue per family);
 * the symbol owns the exact instruction, and the rail glyph plus the label carry that.
 */
export type ProofMarkFamily = 'delete' | 'insert' | 'replace' | 'type-style' | 'align' | 'advisory';

export const PROOF_MARK_FAMILIES: readonly ProofMarkFamily[] = [
    'delete',
    'insert',
    'replace',
    'type-style',
    'align',
    'advisory',
];

export interface ProofMark {
    id: ProofMarkId;
    glyph: MarkGlyphId;
    family: ProofMarkFamily;
    /** null means advisory: the mark asks the author to act, it never applies a change itself. */
    operation: MarkOperation | null;
    /** An instruction, not a glyph name — the glyph is the recognition aid, the label the meaning. */
    labelKey: `proofMarks.${ProofMarkId}.label`;
}

/*
 * Deliberately not ported from CMOS/ISO proofreading:
 * - hair space, letter spacing and equalise-space change tracking against a fixed measure, and a
 *   reflowable HTML document has no measure for them to correct;
 * - wrong fount, roman and small caps have no HTML equivalent — the type-style marks cover exactly
 *   what the editor can set;
 * - stet is a proofreader's self-cancel, not teacher feedback: rejecting a mark is the app's undo.
 */
export const PROOF_MARKS: Readonly<Record<ProofMarkId, ProofMark>> = {
    del: { id: 'del', glyph: 'del', family: 'delete', operation: 'deleteRange', labelKey: 'proofMarks.del.label' },
    ins: { id: 'ins', glyph: 'ins', family: 'insert', operation: 'insertText', labelKey: 'proofMarks.ins.label' },
    space: {
        id: 'space',
        glyph: 'space',
        family: 'insert',
        operation: 'insertText',
        labelKey: 'proofMarks.space.label',
    },
    closeup: {
        id: 'closeup',
        glyph: 'closeup',
        family: 'delete',
        operation: 'deleteRange',
        labelKey: 'proofMarks.closeup.label',
    },
    para: { id: 'para', glyph: 'para', family: 'insert', operation: 'splitBlock', labelKey: 'proofMarks.para.label' },
    tr: { id: 'tr', glyph: 'tr', family: 'replace', operation: 'transposeRanges', labelKey: 'proofMarks.tr.label' },
    sp: { id: 'sp', glyph: 'sp', family: 'replace', operation: 'replaceRange', labelKey: 'proofMarks.sp.label' },
    query: { id: 'query', glyph: 'query', family: 'advisory', operation: null, labelKey: 'proofMarks.query.label' },
    caps: { id: 'caps', glyph: 'caps', family: 'type-style', operation: 'setMark', labelKey: 'proofMarks.caps.label' },
    lc: { id: 'lc', glyph: 'lc', family: 'type-style', operation: 'setMark', labelKey: 'proofMarks.lc.label' },
    ital: { id: 'ital', glyph: 'ital', family: 'type-style', operation: 'setMark', labelKey: 'proofMarks.ital.label' },
    bf: { id: 'bf', glyph: 'bf', family: 'type-style', operation: 'setMark', labelKey: 'proofMarks.bf.label' },
    ul: { id: 'ul', glyph: 'ul', family: 'type-style', operation: 'setMark', labelKey: 'proofMarks.ul.label' },
    comma: {
        id: 'comma',
        glyph: 'comma',
        family: 'insert',
        operation: 'insertText',
        labelKey: 'proofMarks.comma.label',
    },
    period: {
        id: 'period',
        glyph: 'period',
        family: 'insert',
        operation: 'insertText',
        labelKey: 'proofMarks.period.label',
    },
    apostrophe: {
        id: 'apostrophe',
        glyph: 'apostrophe',
        family: 'insert',
        operation: 'insertText',
        labelKey: 'proofMarks.apostrophe.label',
    },
    'align-left': {
        id: 'align-left',
        glyph: 'align-left',
        family: 'align',
        operation: 'setBlockAttr',
        labelKey: 'proofMarks.align-left.label',
    },
    'align-center': {
        id: 'align-center',
        glyph: 'align-center',
        family: 'align',
        operation: 'setBlockAttr',
        labelKey: 'proofMarks.align-center.label',
    },
    'align-right': {
        id: 'align-right',
        glyph: 'align-right',
        family: 'align',
        operation: 'setBlockAttr',
        labelKey: 'proofMarks.align-right.label',
    },
};

export const PROOF_MARK_IDS = Object.keys(PROOF_MARKS) as ProofMarkId[];

export interface ProofMarkFamilyGroup {
    family: ProofMarkFamily;
    symbols: ProofMark[];
}

const ADVISORY_FALLBACK = PROOF_MARKS.query;

/*
 * Mark ids arrive from storage and sync, so they are untrusted: they can name a symbol this build
 * dropped. Every accessor resolves through this one fallback instead of throwing or returning
 * undefined, and query is the honest answer - it asks the author, it never applies a change.
 */
export function getSymbol(id: string): ProofMark {
    return PROOF_MARKS[id as ProofMarkId] ?? ADVISORY_FALLBACK;
}

export function getGlyph(id: string): MarkGlyph {
    return getMarkGlyph(getSymbol(id).glyph);
}

export function operationFor(symbolId: string): MarkOperation | null {
    return getSymbol(symbolId).operation;
}

/** The palette contents in palette order, every declared family present even when it is empty. */
export function symbolsByFamily(): ProofMarkFamilyGroup[] {
    return PROOF_MARK_FAMILIES.map((family) => ({
        family,
        symbols: PROOF_MARK_IDS.map((id) => PROOF_MARKS[id]).filter((mark) => mark.family === family),
    }));
}
