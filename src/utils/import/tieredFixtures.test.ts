import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import sheet from './__fixtures__/tiered-rubric/grote-opdracht-y1-p1.json';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__/tiered-rubric');

async function documentXml(file: string): Promise<string> {
    const zip = await JSZip.loadAsync(readFileSync(path.join(dir, file)));
    return zip.file('word/document.xml')!.async('string');
}

const statements = sheet.criteria.flatMap((c) =>
    sheet.tiers.flatMap((t) =>
        sheet.bands.flatMap((b) => (c.cells as Record<string, Record<string, string[]>>)[t.id][b.id])
    )
);

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('tiered rubric fixtures', () => {
    it('canonical JSON describes 4 criteria × 3 tiers × 3 bands with 95 statements', () => {
        expect(sheet.criteria.map((c) => c.title)).toEqual([
            'Spelling en woordenschat',
            'Leestekens',
            'Grammatica',
            'Inhoud en uitvoering van de opdracht',
        ]);
        expect(sheet.tiers.map((t) => t.id)).toEqual(['mavo', 'havo', 'vwo']);
        expect(sheet.bands.map((b) => b.code)).toEqual(['IO', 'B', 'E']);
        expect(sheet.requirements).toHaveLength(3);
        expect(statements).toHaveLength(95);
        expect(statements.every((s) => s.length > 0 && s === s.trim())).toBe(true);
    });

    it('original DOCX has one legacy form checkbox per statement', async () => {
        const xml = await documentXml('grote-opdracht-y1-p1.original.docx');
        expect(xml.match(/<w:checkBox>/g)).toHaveLength(statements.length);
    });

    it('redesigned DOCX holds every statement once, each behind a checkbox content control', async () => {
        const xml = await documentXml('grote-opdracht-y1-p1.docx');
        expect(xml.match(/<w14:checkbox>/g)).toHaveLength(statements.length);
        for (const s of new Set(statements)) expect(xml).toContain(`>${xmlEscape(s)}</w:t>`);
        for (const c of sheet.criteria) expect(xml).toContain(`>${xmlEscape(c.title)}</w:t>`);
        expect(xml).toContain('w:orient="landscape"');
    });

    it('both PDFs are present', () => {
        for (const file of ['grote-opdracht-y1-p1.original.pdf', 'grote-opdracht-y1-p1.pdf']) {
            expect(readFileSync(path.join(dir, file)).subarray(0, 5).toString()).toBe('%PDF-');
        }
    });
});
