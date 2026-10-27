import fs from 'node:fs';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import sheet from './__fixtures__/tiered-rubric/grote-opdracht-y1-p1.json';
import {
    bandMarker,
    draftToParsedRubric,
    parseRequirements,
    parseSheetHtml,
    parseSheetPdf,
    repairLigatures,
    tierNamesFromPipeLine,
    trackFromName,
    yearFromText,
    type PdfTextItem,
    type SheetDraft,
} from './sheetImport';

const dir = 'src/utils/import/__fixtures__/tiered-rubric/';
type Cells = Record<string, Record<string, string[]>>;
/** The canonical sheet as a draft: [tier][band][statement] per criterion. */
const expected = sheet.criteria.map((c) => ({
    title: c.title,
    cells: sheet.tiers.map((t) => sheet.bands.map((b) => (c.cells as Cells)[t.id][b.id])),
}));

async function docxDraft(file: string) {
    return parseSheetHtml((await mammoth.convertToHtml({ buffer: fs.readFileSync(dir + file) })).value);
}

async function pdfDraft(file: string) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(dir + file)), verbosity: 0 }).promise;
    const items: PdfTextItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const height = page.getViewport({ scale: 1 }).height;
        for (const it of (await page.getTextContent()).items)
            if ('str' in it) items.push({ page: p, x: it.transform[4], y: height - it.transform[5], str: it.str });
    }
    return parseSheetPdf(items);
}

function expectSheetHead(draft: SheetDraft | null) {
    expect(draft).not.toBeNull();
    expect(draft!.title).toBe(sheet.title);
    expect(draft!.tierNames).toEqual(sheet.tiers.map((t) => t.label));
    expect(draft!.bandCodes).toEqual(sheet.bands.map((b) => b.code));
    expect(draft!.criteria.map((c) => c.title)).toEqual(sheet.criteria.map((c) => c.title));
}

describe('sheet import — the sample sheet', () => {
    it.each(['grote-opdracht-y1-p1.docx', 'grote-opdracht-y1-p1.original.docx'])(
        'reads every statement of %s exactly',
        async (file) => {
            const draft = await docxDraft(file);
            expectSheetHead(draft);
            expect(draft!.requirements).toEqual(sheet.requirements);
            expect(draft!.criteria).toEqual(expected);
            expect(draft!.warnings).toEqual([]);
        }
    );

    it('reads every statement of the redesigned PDF exactly', async () => {
        const draft = await pdfDraft('grote-opdracht-y1-p1.pdf');
        expectSheetHead(draft);
        expect(draft!.requirements).toEqual(sheet.requirements);
        expect(draft!.criteria).toEqual(expected);
    });

    it("reads the teacher's original PDF in the same shape, repairing its broken ligatures", async () => {
        const draft = await pdfDraft('grote-opdracht-y1-p1.original.pdf');
        expectSheetHead(draft);
        expect(draft!.warnings).toEqual([{ key: 'importRubric.warn_sheet_ligatures' }]);
        const shape = (d: { cells: string[][][] }[]) => d.map((c) => c.cells.map((t) => t.map((b) => b.length)));
        expect(shape(draft!.criteria)).toEqual(shape(expected));
        const read = draft!.criteria.flatMap((c) => c.cells.flat(2));
        const exact = read.filter((s, i) => s === expected.flatMap((c) => c.cells.flat(2))[i]);
        // A ligature at the start of a word ("Ojd" for "tijd") can't be told from a real capital.
        expect(exact.length / read.length).toBeGreaterThan(0.9);
        expect(read.join(' ')).not.toMatch(/HeeD|beva\.en|hoofdle\.ers/);
    });

    it('turns a draft into a tiered rubric with the sheet tiers, bands and tier-tagged statements', async () => {
        const parsed = draftToParsedRubric((await docxDraft('grote-opdracht-y1-p1.docx'))!, 'grote-opdracht-y1-p1');
        expect(parsed.name).toBe(sheet.title);
        expect(parsed.confidence).toBe('high');
        expect(parsed.warnings).toEqual([]);
        expect(parsed.format?.levelOrder).toBe('worst-first');
        expect(parsed.tiered!.tiers.map((t) => [t.year, t.track, t.label])).toEqual([
            ['jaar-1', 'vmbo-tl', 'Mavo'],
            ['jaar-1', 'havo', 'Havo'],
            ['jaar-1', 'vwo', 'VWO'],
        ]);
        expect(parsed.tiered!.bands.map((b) => [b.code, b.label, b.points])).toEqual([
            ['IO', 'In ontwikkeling', 0],
            ['B', 'Beheerst', 1],
            ['E', 'Expert', 2],
        ]);
        expect(parsed.tiered!.requirements!.map((r) => r.text)).toEqual(sheet.requirements);
        expect(parsed.criteria.map((c) => c.weight)).toEqual([25, 25, 25, 25]);
        const havo = parsed.tiered!.tiers[1].id;
        const spellingB = parsed.criteria[0].levels.find((l) => l.bandId === parsed.tiered!.bands[1].id)!;
        expect(spellingB.subItems.filter((si) => si.tierId === havo).map((si) => si.label)).toEqual(
            sheet.criteria[0].cells.havo.b
        );
        expect(parsed.criteria[0].subItemMode).toBe('checklist');
    });
});

describe('sheet import — rules', () => {
    it('recognises short band codes followed by a colon', () => {
        expect(['IO:', ' B :', 'E:', 'Level 1:', 'IO', 'Note: x', 'Naam:', 'Date:'].map(bandMarker)).toEqual([
            'IO',
            'B',
            'E',
            null,
            null,
            null,
            null,
            null,
        ]);
    });

    it('repairs ligatures only when a text shows the pattern several times', () => {
        expect(repairLigatures(['HeeD geen hoofdle.ers', 'Gramma6ca']).texts).toEqual([
            'Heeft geen hoofdletters',
            'Grammatica',
        ]);
        expect(repairLigatures(['e.g. version 6a', 'Dutch']).repaired).toBe(false);
        // Abbreviations are not ligatures, however many a text has.
        const abbreviations = ['o.a. spelling, d.w.z. de regels', 'm.a.w. ook i.p.v. dat'];
        expect(repairLigatures(abbreviations)).toEqual({ texts: abbreviations, repaired: false });
    });

    it('reads numbered requirements on their own lines or joined by bars, up to the next field', () => {
        expect(
            parseRequirements(['Title', 'Requirements', '1. On time', '2. Own work', 'Name: ___']).requirements
        ).toEqual(['On time', 'Own work']);
        expect(
            parseRequirements(['Verplichte eisen', '1. A | 2. B that wraps', 'onto a line', 'Naam:']).requirements
        ).toEqual(['A', 'B that wraps onto a line']);
        expect(parseRequirements(['No heading', '1. Item']).requirements).toEqual([]);
    });

    it('maps tier names to tracks and titles to school years', () => {
        expect(['Mavo', 'Havo', 'VWO', 'Gymnasium', 'vmbo-kb', 'Basis', 'Group A'].map(trackFromName)).toEqual([
            'vmbo-tl',
            'havo',
            'vwo',
            'vwo',
            'vmbo-kb',
            'vmbo-bb',
            undefined,
        ]);
        expect(['Grote opdracht Y2', 'leerjaar 3 toets', 'Groep 8 rubric', 'P1 opdracht'].map(yearFromText)).toEqual([
            'jaar-2',
            'jaar-3',
            'groep-8',
            undefined,
        ]);
        expect(tierNamesFromPipeLine('| Onderdeel | Mavo | Havo | VWO |', 3)).toEqual(['Mavo', 'Havo', 'VWO']);
        expect(tierNamesFromPipeLine('| Mavo |', 3)).toEqual([]);
        // An empty header cell keeps its column, so VWO stays on the third tier.
        expect(tierNamesFromPipeLine('| Onderdeel | Mavo | | VWO |', 3)).toEqual(['Mavo', '', 'VWO']);
    });

    it('fills in what a sheet leaves out and says so', () => {
        const parsed = draftToParsedRubric(
            {
                requirements: [],
                tierNames: ['Basis'],
                bandCodes: ['O', 'V', 'G', 'U'],
                criteria: [
                    {
                        title: '',
                        cells: [
                            [['a'], ['b'], [], []],
                            [[], [], ['c'], []],
                        ],
                    },
                ],
                warnings: [],
            },
            'Toets'
        );
        expect(parsed.name).toBe('Toets');
        expect(parsed.confidence).toBe('medium');
        expect(parsed.warnings.map((w) => w.key)).toEqual([
            'importRubric.warn_sheet_year',
            'importRubric.warn_sheet_tier_names',
            'importRubric.warn_sheet_criterion_names',
        ]);
        expect(parsed.tiered!.tiers).toHaveLength(2);
        expect(parsed.tiered!.tiers[0]).toMatchObject({ track: 'vmbo-bb', label: 'Basis' });
        expect(parsed.tiered!.tiers[1].label).toBeUndefined();
        expect(parsed.tiered!.bands.map((b) => [b.code, b.label])).toEqual([
            ['O', ''],
            ['V', ''],
            ['G', ''],
            ['U', ''],
        ]);
        expect(parsed.tiered!.requirements).toBeUndefined();
        expect(parsed.criteria[0].title).toBe('1');
    });

    it('keeps each tier name on its own column when one header cell is empty', () => {
        const cells = [[['a']], [['b']], [['c']]];
        const parsed = draftToParsedRubric(
            {
                requirements: [],
                tierNames: ['Mavo', '', 'VWO'],
                bandCodes: ['B'],
                criteria: [{ title: 'Spelling', cells }],
                warnings: [],
            },
            'Toets jaar 1'
        );
        expect(parsed.tiered!.tiers.map((t) => [t.label, t.track])).toEqual([
            ['Mavo', 'vmbo-tl'],
            [undefined, undefined],
            ['VWO', 'vwo'],
        ]);
        expect(parsed.warnings.map((w) => w.key)).toContain('importRubric.warn_sheet_tier_names');
    });

    it('finds no sheet in a document without band codes or statements', () => {
        expect(
            parseSheetHtml('<table><tr><td>Criterion</td><td>Good</td></tr><tr><td>A</td><td>b</td></tr></table>')
        ).toBeNull();
        expect(parseSheetHtml('<table><tr><td>IO:</td></tr></table>')).toBeNull();
        expect(parseSheetPdf([{ page: 1, x: 10, y: 10, str: 'IO:' }])).toBeNull();
        // Form labels above an ordinary rubric are not band markers.
        expect(
            parseSheetPdf([
                { page: 1, x: 10, y: 10, str: 'Name:' },
                { page: 1, x: 300, y: 10, str: 'Date:' },
                { page: 1, x: 10, y: 40, str: 'Criterion' },
                { page: 1, x: 300, y: 40, str: 'Excellent (4)' },
                { page: 1, x: 10, y: 60, str: 'Spelling' },
                { page: 1, x: 300, y: 60, str: 'No errors' },
            ])
        ).toBeNull();
    });
});
