import JSZip from 'jszip';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Rubric, StudentRubric } from '../types';
import { initTestI18n } from '../test-utils/initI18n';
import { sheet as fixture, sheetRubric } from '../test-utils/tieredSheetRubric';
import { buildTieredSheet, requirementMark } from './tieredSheet';
import { buildRubricHTML, exportRubricGridPdf } from './pdfExport';
import { buildRubricGridDocxChildren, exportRubricToDocx } from './docxExport';
import { exportRubricWithTemplate } from './docxTemplateExport';
import { Document, Packer } from 'docx';

const savedBlobs = vi.hoisted(() => [] as Blob[]);
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => savedBlobs.push(blob) }));

beforeAll(async () => {
    await initTestI18n();
});

const rubric = sheetRubric();
type Cells = Record<string, Record<string, string[]>>;
const statement = (tier: string, band: string, i = 0) => (fixture.criteria[0].cells as Cells)[tier][band][i];

/** A complete havo grade: E on spelling, B elsewhere, the first havo statement of every level ticked. */
function havoGrade(extra: Partial<StudentRubric> = {}): StudentRubric {
    return {
        id: 'sr1',
        rubricId: rubric.id,
        studentId: 's1',
        tierId: 'havo',
        overallComment: '<p>Mooi <strong>werk</strong>.</p>',
        isPeerReview: false,
        gradedAt: '2026-10-20T10:00:00Z',
        entries: rubric.criteria.map((c, i) => ({
            criterionId: c.id,
            levelId: c.levels.find((l) => l.bandId === (i === 0 ? 'e' : 'b'))!.id,
            comment: i === 1 ? '<p>Let op komma&#39;s.</p>' : '',
            checkedSubItems: c.levels.flatMap((l) =>
                l.subItems
                    .filter((si) => si.tierId === 'havo')
                    .slice(0, 1)
                    .map((si) => si.id)
            ),
        })),
        ...extra,
    };
}

const graded = (sr: StudentRubric, r: Rubric = rubric) =>
    buildTieredSheet(r, { sr, studentName: 'Alice', scale: null })!;

describe('buildTieredSheet', () => {
    it('lays out a blank sheet with every tier, bands worst first and each tier its own statements', () => {
        const sheet = buildTieredSheet(rubric)!;
        expect(sheet.tiers.map((t) => t.label)).toEqual(['Mavo', 'Havo', 'VWO']);
        expect(sheet.allTierLabels).toEqual(['Mavo', 'Havo', 'VWO']);
        expect(sheet.bands.map((b) => b.code)).toEqual(['IO', 'B', 'E']);
        expect(sheet.requirements.map((r) => r.text)).toEqual(fixture.requirements);
        expect(sheet.requirements.every((r) => r.met === undefined)).toBe(true);
        expect(sheet.graded).toBeUndefined();

        const [mavo, havo] = sheet.criteria[0].columns;
        expect(mavo.map((b) => b.code)).toEqual(['IO', 'B', 'E']);
        expect(havo[1].statements.map((s) => s.label)).toEqual(fixture.criteria[0].cells.havo.b);
        expect(havo[1].statements.every((s) => s.ticked === undefined)).toBe(true);
        expect(havo.some((b) => b.chosen)).toBe(false);
        expect(havo[0].color).toBe(fixture.bands[0].color);
    });

    it('follows a best-first level order and returns nothing for a rubric without tiers', () => {
        const bestFirst = buildTieredSheet({ ...rubric, format: { ...rubric.format, levelOrder: 'best-first' } })!;
        expect(bestFirst.bands.map((b) => b.code)).toEqual(['E', 'B', 'IO']);
        expect(buildTieredSheet({ ...rubric, tiered: undefined })).toBeNull();
    });

    it("prints only a grade's tier, with its ticks, chosen bands, requirements, comments and verdict", () => {
        const sheet = graded(havoGrade({ requirementsMet: { req1: true, req2: false } }));
        expect(sheet.tiers).toEqual([{ id: 'havo', label: 'Havo' }]);
        const spelling = sheet.criteria[0].columns[0];
        expect(spelling.map((b) => b.chosen)).toEqual([false, false, true]);
        expect(spelling[1].statements[0]).toEqual({ label: statement('havo', 'b'), ticked: true });
        expect(spelling[1].statements[1].ticked).toBe(false);
        expect(sheet.criteria[1].comment).toBe("Let op komma's.");
        expect(sheet.requirements.map((r) => r.met)).toEqual([true, false, undefined]);
        expect(sheet.graded).toEqual({
            studentName: 'Alice',
            tierLabel: 'Havo',
            verdict: { code: 'IO', label: fixture.bands[0].label, color: fixture.bands[0].color },
            overallComment: 'Mooi werk.',
        });
    });

    it('withholds a points verdict until every criterion is scored, and prints every tier while the tier is unknown', () => {
        const partial = havoGrade({ tierId: undefined });
        partial.entries[3] = { ...partial.entries[3], levelId: null };
        const sheet = graded(partial);
        expect(sheet.graded!.verdict).toBeUndefined();
        expect(sheet.graded!.tierLabel).toBeUndefined();
        expect(sheet.tiers).toHaveLength(3);

        const overridden = graded({ ...partial, verdictOverride: 'e' });
        expect(overridden.graded!.verdict!.code).toBe('E');
    });

    it('prints a tier passed in for a grade saved before tiers were pinned', () => {
        const vwo = rubric.tiered!.tiers[2];
        const sheet = buildTieredSheet(rubric, {
            sr: havoGrade({ tierId: undefined }),
            studentName: 'Alice',
            scale: null,
            tier: vwo,
        })!;
        expect(sheet.tiers).toEqual([{ id: 'vwo', label: 'VWO' }]);
    });

    it('marks requirements as met, not met or not judged', () => {
        expect([true, false, undefined].map(requirementMark)).toEqual(['☑', '☒', '☐']);
    });
});

describe('tiered PDF export', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('prints a graded sheet in the sheet layout instead of the level grid', () => {
        const html = buildRubricHTML(havoGrade(), rubric, { id: 's1', name: 'Alice <b>', classId: 'c1' }, null);
        expect(html).toContain('class="tiered-sheet"');
        expect(html).toContain('Alice &lt;b&gt;');
        expect(html).toContain('Havo');
        expect(html).toContain(`☑&nbsp;${statement('havo', 'b')}`);
        expect(html).not.toContain(statement('mavo', 'b'));
        expect(html).toContain('✓ chosen');
        expect(html).toContain('Graded:');
        expect(html).toContain('Mooi werk.');
    });

    it('prints a blank sheet landscape with every tier and numbered requirements', async () => {
        vi.useFakeTimers();
        void exportRubricGridPdf(rubric);
        const doc = document.querySelector('iframe')!.contentDocument!;
        const html = doc.documentElement.innerHTML;
        expect(html).toContain('size: landscape');
        expect(html).toContain(statement('mavo', 'io'));
        expect(html).toContain(statement('vwo', 'e'));
        expect(html).toContain(`1. ${fixture.requirements[0]}`);
        expect(html).toContain('______________________');
        vi.useRealTimers();
    });
});

async function documentXml(blob: Blob): Promise<string> {
    const zip = await JSZip.loadAsync(blob);
    return zip.file('word/document.xml')!.async('string');
}

describe('tiered DOCX export', () => {
    it('writes a blank sheet landscape, with checkbox controls and one page per criterion', async () => {
        await exportRubricToDocx(rubric);
        const xml = await documentXml(savedBlobs.at(-1)!);
        expect(xml).toContain('w:orient="landscape"');
        expect(xml).toContain('w14:checkbox');
        expect(xml).toContain(statement('vwo', 'e'));
        expect(xml).toContain(fixture.requirements[2]);
        expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(rubric.criteria.length - 1);
        expect(xml).toContain('w:fill="FFD7DE"');
    });

    it("writes a graded sheet with the grade's tier, ticked boxes and the verdict", async () => {
        const children = buildRubricGridDocxChildren(rubric, havoGrade({ requirementsMet: { req2: false } }), null, {
            id: 's1',
            name: 'Alice',
            classId: 'c1',
        });
        const xml = await documentXml(await Packer.toBlob(new Document({ sections: [{ children }] })));
        expect(xml).toContain('Alice');
        expect(xml).toContain('<w14:checked w14:val="1"/>');
        expect(xml).not.toContain(statement('mavo', 'b'));
        expect(xml).toContain('not met');
        expect(xml).toContain('✓ chosen');
        expect(xml).not.toContain('<w:pageBreakBefore/>');
    });

    it('keeps the sheet layout for a table template, taking only its header colour', async () => {
        await exportRubricWithTemplate(rubric, {
            id: 't',
            name: 'T',
            dataUrl: '',
            size: 0,
            addedAt: '',
            levelHeaders: ['Strong', 'Weak'],
            headerColor: '#f00',
        });
        const xml = await documentXml(savedBlobs.at(-1)!);
        expect(xml).toContain('w:fill="FF0000"');
        expect(xml).not.toContain('Strong');
        expect(xml).toContain(statement('havo', 'io'));
    });
});
