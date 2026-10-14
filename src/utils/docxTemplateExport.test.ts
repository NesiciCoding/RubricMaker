import { describe, expect, it, vi } from 'vitest';
import { Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow } from 'docx';
import { DEFAULT_TEMPLATE_HEADER_COLOR, headerTextColor, parseTemplateHeaders, toDocxFill } from './docxTemplateExport';

// mammoth's Node build can't read an ArrayBuffer, so stub its HTML; the shading comes from the real zip.
const mammothHtml = vi.hoisted(() => ({ value: '' }));
vi.mock('mammoth', () => ({ convertToHtml: async () => ({ value: mammothHtml.value }) }));
const HEADER_TABLE_HTML = '<table><tr><td>Criterion</td><td>Strong</td><td>Weak</td></tr><tr><td></td></tr></table>';

async function makeTemplate(headerFill?: string, withTable = true): Promise<File> {
    mammothHtml.value = withTable ? HEADER_TABLE_HTML : '<p>No table here</p>';
    const cell = (text: string) =>
        new TableCell({
            shading: headerFill ? { fill: headerFill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
            children: [new Paragraph(text)],
        });
    const doc = new Document({
        sections: [
            {
                children: withTable
                    ? [
                          new Table({
                              rows: [
                                  new TableRow({ children: [cell('Criterion'), cell('Strong'), cell('Weak')] }),
                                  new TableRow({
                                      children: [
                                          new TableCell({ children: [new Paragraph('')] }),
                                          new TableCell({ children: [new Paragraph('')] }),
                                          new TableCell({ children: [new Paragraph('')] }),
                                      ],
                                  }),
                              ],
                          }),
                      ]
                    : [new Paragraph('No table here')],
            },
        ],
    });
    return new File([await Packer.toBlob(doc)], 'template.docx');
}

describe('parseTemplateHeaders (#698)', () => {
    it('reads the level headers and the header row shading from the template XML', async () => {
        const result = await parseTemplateHeaders(await makeTemplate('C00000'));
        expect(result.levelHeaders).toEqual(['Strong', 'Weak']);
        expect(result.headerColor).toBe('#C00000');
    });

    it('falls back to the default colour when the header row is not shaded', async () => {
        const result = await parseTemplateHeaders(await makeTemplate());
        expect(result.headerColor).toBe(DEFAULT_TEMPLATE_HEADER_COLOR);
    });

    it('returns no headers and the default colour without a table', async () => {
        expect(await parseTemplateHeaders(await makeTemplate(undefined, false))).toEqual({
            levelHeaders: [],
            headerColor: DEFAULT_TEMPLATE_HEADER_COLOR,
        });
    });
});

describe('toDocxFill', () => {
    it('expands 3-digit hex and strips the hash', () => {
        expect(toDocxFill('#f00')).toBe('FF0000');
        expect(toDocxFill('1e3a5f')).toBe('1E3A5F');
    });

    it.each(['auto', 'red', '#12345', 'rgb(1,2,3)', '', undefined])('rejects %s', (value) => {
        expect(toDocxFill(value)).toBeUndefined();
    });
});

describe('headerTextColor', () => {
    it('keeps white labels on a dark fill', () => {
        expect(headerTextColor('1E3A5F')).toBe('FFFFFF');
        expect(headerTextColor('FF0000')).toBe('FFFFFF');
    });

    it('switches to dark labels on a light fill so they stay readable', () => {
        expect(headerTextColor('FFFFFF')).toBe('1F2937');
        expect(headerTextColor('FFF2CC')).toBe('1F2937');
    });
});

const savedBlobs = vi.hoisted(() => [] as Blob[]);
vi.mock('file-saver', () => ({ saveAs: (blob: Blob) => savedBlobs.push(blob) }));

describe('exportRubricWithTemplate', () => {
    it.each([
        ['#f00', 'FF0000', 'FFFFFF'],
        ['#ffffff', 'FFFFFF', '1F2937'],
    ])('writes template colour %s as fill %s with readable %s labels', async (headerColor, fill, text) => {
        const { exportRubricWithTemplate } = await import('./docxTemplateExport');
        const { DEFAULT_FORMAT } = await import('../types');
        const JSZip = (await import('jszip')).default;
        const level = (id: string, points: number) => ({
            id,
            label: id,
            minPoints: points,
            maxPoints: points,
            description: '',
            subItems: [],
        });
        await exportRubricWithTemplate(
            {
                id: 'r1',
                name: 'Essay',
                subject: '',
                description: '',
                criteria: [
                    {
                        id: 'c1',
                        title: 'Content',
                        description: '',
                        weight: 100,
                        levels: [level('A', 2), level('B', 1)],
                    },
                ],
                gradeScaleId: 'gs',
                format: DEFAULT_FORMAT,
                scoringMode: 'weighted-percentage',
                totalMaxPoints: 100,
                createdAt: '',
                updatedAt: '',
            } as never,
            {
                id: 't',
                name: 'T',
                dataUrl: '',
                size: 0,
                addedAt: '',
                levelHeaders: ['Strong', 'Weak'],
                headerColor,
            }
        );
        const zip = await JSZip.loadAsync(savedBlobs.at(-1)!);
        const xml = await zip.file('word/document.xml')!.async('string');
        expect(xml).toContain(`w:fill="${fill}"`);
        expect(xml).toContain('Strong');
        expect(xml).toContain(`<w:color w:val="${text}"/>`);
    });
});
