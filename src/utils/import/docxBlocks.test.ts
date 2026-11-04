import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { docxToBlocks } from './docxBlocks';
import { DocumentReadError } from './documentModel';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`;

function documentXml(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
}

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="3"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

async function buildDocx(body: string, opts: { styles?: boolean; numbering?: boolean } = {}): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`
    );
    zip.file('word/document.xml', documentXml(body));
    if (opts.styles !== false) zip.file('word/styles.xml', STYLES);
    if (opts.numbering) zip.file('word/numbering.xml', NUMBERING);
    return zip.generateAsync({ type: 'arraybuffer' });
}

const para = (inner: string, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
const run = (text: string, rPr = '') =>
    `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;

describe('docxToBlocks', () => {
    it('keeps the paragraph style, heading level and font size a heading needs', async () => {
        const model = await docxToBlocks(
            await buildDocx(para(run('Assignment 1'), '<w:pStyle w:val="Heading1"/>') + para(run('Name:')))
        );

        expect(model.source).toBe('docx');
        const [heading, plain] = model.blocks;
        expect(heading).toMatchObject({
            kind: 'paragraph',
            text: 'Assignment 1',
            style: 'heading 1',
            headingLevel: 1,
            fontSizePt: 16,
            bold: true,
        });
        expect(plain).toMatchObject({ kind: 'paragraph', text: 'Name:', fontSizePt: 11 });
        expect((plain as { headingLevel?: number }).headingLevel).toBeUndefined();
    });

    it('reads outline levels and list numbering even without a named style', async () => {
        const body =
            para(run('Section'), '<w:outlineLvl w:val="1"/>') +
            para(run('item one'), '<w:numPr><w:ilvl w:val="2"/><w:numId w:val="7"/></w:numPr>') +
            // numId 0 means "numbering removed", so a stray numPr must not claim a list level.
            para(run('plain'), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="0"/></w:numPr>');
        const model = await docxToBlocks(await buildDocx(body, { styles: false }));

        expect(model.blocks[0]).toMatchObject({ text: 'Section', headingLevel: 2 });
        expect(model.blocks[1]).toMatchObject({ text: 'item one', listLevel: 2 });
        expect((model.blocks[2] as { listLevel?: number }).listLevel).toBeUndefined();
    });

    it('tells a numbered list from a bulleted one through numbering.xml', async () => {
        const model = await docxToBlocks(
            await buildDocx(
                para(run('counted'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>') +
                    para(run('marked'), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>'),
                { numbering: true }
            )
        );

        // Word renders the ordinal at layout time, so the numbering definition is the only evidence
        // that the first paragraph is a list item that counts and the second is only underlined.
        expect(model.blocks[0]).toMatchObject({ text: 'counted', listLevel: 0, listFormat: 'numbered' });
        expect(model.blocks[1]).toMatchObject({ text: 'marked', listLevel: 1, listFormat: 'bullet' });
    });

    it('turns tabs into spacing, keeps line breaks, and drops tracked deletions and field codes', async () => {
        const body = para(
            run('a') +
                '<w:r><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r>' +
                '<w:del><w:r><w:delText>removed</w:delText></w:r></w:del>' +
                '<w:r><w:instrText>PAGE</w:instrText></w:r>'
        );
        const model = await docxToBlocks(await buildDocx(body));

        // Tabs are column spacing, not content: the detector compares text, and a PDF has no tabs at all.
        expect(model.blocks[0]).toMatchObject({ text: 'a b\nc' });
    });

    it('reads table rows and column spans', async () => {
        const table = `<w:tbl>
            <w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr>${para(run('ASSIGNMENT 1'))}</w:tc></w:tr>
            <w:tr><w:tc>${para(run('1'))}</w:tc><w:tc>${para(run('She'))}${para(run('is tall'))}</w:tc><w:tc>${para(run('1'))}</w:tc></w:tr>
        </w:tbl>`;
        const model = await docxToBlocks(await buildDocx(table));

        const block = model.blocks[0];
        expect(block.kind).toBe('table');
        if (block.kind !== 'table') return;
        expect(block.rows[0]).toEqual([{ text: 'ASSIGNMENT 1', colspan: 3 }]);
        expect(block.rows[1]).toEqual([{ text: '1' }, { text: 'She\nis tall' }, { text: '1' }]);
    });

    it('reads paragraphs inside content controls', async () => {
        const body = `<w:sdt><w:sdtContent>${para(run('inside a control'))}</w:sdtContent></w:sdt>`;
        const model = await docxToBlocks(await buildDocx(body));

        expect(model.blocks.map((b) => (b.kind === 'paragraph' ? b.text : ''))).toEqual(['inside a control']);
    });

    it('inherits heading cues through w:basedOn', async () => {
        const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:styleId="Base"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Child"><w:name w:val="Custom"/><w:basedOn w:val="Base"/></w:style>
</w:styles>`;
        const zip = new JSZip();
        zip.file(
            '[Content_Types].xml',
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`
        );
        zip.file('word/document.xml', documentXml(para(run('Derived'), '<w:pStyle w:val="Child"/>')));
        zip.file('word/styles.xml', styles);
        const model = await docxToBlocks(await zip.generateAsync({ type: 'arraybuffer' }));

        expect(model.blocks[0]).toMatchObject({ text: 'Derived', headingLevel: 2, fontSizePt: 14, bold: true });
    });

    it('reads table cells wrapped in content controls', async () => {
        const table = `<w:tbl><w:tr><w:tc><w:sdt><w:sdtContent>${para(run('controlled'))}</w:sdtContent></w:sdt></w:tc></w:tr></w:tbl>`;
        const model = await docxToBlocks(await buildDocx(table));

        const block = model.blocks[0];
        expect(block.kind).toBe('table');
        if (block.kind !== 'table') return;
        expect(block.rows[0]).toEqual([{ text: 'controlled' }]);
    });

    it('reports a broken package as unreadable instead of throwing a zip error', async () => {
        await expect(docxToBlocks(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(DocumentReadError);
        await expect(docxToBlocks(new TextEncoder().encode('not a zip'))).rejects.toMatchObject({
            reason: 'unreadable',
        });
    });

    it('reports a package without word/document.xml as unreadable', async () => {
        const zip = new JSZip();
        zip.file('word/styles.xml', STYLES);
        const bytes = await zip.generateAsync({ type: 'arraybuffer' });

        await expect(docxToBlocks(bytes)).rejects.toMatchObject({ reason: 'unreadable' });
    });
});
