import { describe, expect, it } from 'vitest';
import { MARK_GLYPHS } from './markGlyphs';
import { PROOF_MARK_FAMILIES, PROOF_MARK_IDS, PROOF_MARKS, type ProofMarkFamily } from './proofMarks';
import en from '../locales/en.json';
import nl from '../locales/nl.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import es from '../locales/es.json';

const LOCALES: Record<string, Record<string, unknown>> = { en, nl, fr, de, es };

const OPERATIONS = [
    'deleteRange',
    'insertText',
    'splitBlock',
    'transposeRanges',
    'replaceRange',
    'setMark',
    'setBlockAttr',
];

const ENTRIES = PROOF_MARK_IDS.map((id) => PROOF_MARKS[id]);

function resolve(bundle: Record<string, unknown>, key: string): unknown {
    return key
        .split('.')
        .reduce<unknown>(
            (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
            bundle
        );
}

describe('proofMarks registry', () => {
    it('registers the 19 seed symbols with unique ids', () => {
        expect(ENTRIES).toHaveLength(19);
        expect(new Set(PROOF_MARK_IDS).size).toBe(19);
        // The key is the id: a renamed key must not leave the stored id behind.
        for (const id of PROOF_MARK_IDS) expect(PROOF_MARKS[id].id, id).toBe(id);
    });

    it('covers exactly the glyphs the glyph table draws', () => {
        expect([...PROOF_MARK_IDS].sort()).toEqual((Object.keys(MARK_GLYPHS) as string[]).sort());
    });

    it('resolves every symbol to a glyph of a known kind', () => {
        for (const mark of ENTRIES) {
            const glyph = MARK_GLYPHS[mark.glyph];
            expect(glyph, mark.id).toBeDefined();
            expect(['stroke', 'letter'], mark.id).toContain(glyph.kind);
        }
    });

    it('maps every symbol to an operation or explicitly to advisory', () => {
        for (const mark of ENTRIES) {
            if (mark.family === 'advisory') {
                expect(mark.operation, mark.id).toBeNull();
            } else {
                expect(OPERATIONS, mark.id).toContain(mark.operation);
            }
        }
        expect(ENTRIES.filter((mark) => mark.family === 'advisory').map((mark) => mark.id)).toEqual(['query']);
    });

    it('groups every symbol into a declared family that the palette can render', () => {
        for (const mark of ENTRIES) {
            expect(PROOF_MARK_FAMILIES, mark.id).toContain(mark.family);
        }
        const used = new Set<ProofMarkFamily>(ENTRIES.map((mark) => mark.family));
        for (const family of PROOF_MARK_FAMILIES) {
            expect(used.has(family), family).toBe(true);
        }
        expect(used.size).toBe(PROOF_MARK_FAMILIES.length);
    });

    it('names every symbol and every family in all five locales', () => {
        for (const [lang, bundle] of Object.entries(LOCALES)) {
            for (const mark of ENTRIES) {
                const label = resolve(bundle, mark.labelKey);
                expect(typeof label, `${lang}: ${mark.labelKey}`).toBe('string');
                expect((label as string).trim().length, `${lang}: ${mark.labelKey}`).toBeGreaterThan(0);
            }
            for (const family of PROOF_MARK_FAMILIES) {
                expect(typeof resolve(bundle, `proofMarks.families.${family}`), `${lang}: ${family}`).toBe('string');
            }
        }
    });
});
