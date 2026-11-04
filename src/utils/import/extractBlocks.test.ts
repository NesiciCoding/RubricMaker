import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { documentImportKind, extractDocumentBlocks, isDocumentImportFile } from './extractBlocks';
import { DocumentReadError } from './documentModel';
import { docxToBlocks } from './docxBlocks';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function docxFile(body: string, name = 'test.docx'): Promise<File> {
    const zip = new JSZip();
    zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`
    );
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    return new File([bytes], name);
}

describe('documentImportKind', () => {
    it('routes on the extension, which is the only reliable signal for docx', () => {
        expect(documentImportKind({ name: 'Paper.PDF' })).toBe('pdf');
        expect(documentImportKind({ name: 'paper.docx' })).toBe('docx');
        expect(documentImportKind({ name: 'paper', type: 'application/pdf' })).toBe('pdf');
        expect(
            documentImportKind({
                name: 'paper',
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            })
        ).toBe('docx');
    });

    it('rejects everything the document path cannot read', () => {
        expect(documentImportKind({ name: 'test.json' })).toBeNull();
        expect(documentImportKind({ name: 'old.doc' })).toBeNull();
        expect(isDocumentImportFile({ name: 'test.json' })).toBe(false);
        expect(isDocumentImportFile({ name: 'scan.png' })).toBe(false);
    });
});

describe('extractDocumentBlocks', () => {
    it('reads a Word file into blocks', async () => {
        const model = await extractDocumentBlocks(await docxFile('<w:p><w:r><w:t>Assignment 1</w:t></w:r></w:p>'));

        expect(model.source).toBe('docx');
        expect(model.blocks.map((b) => (b.kind === 'paragraph' ? b.text : ''))).toEqual(['Assignment 1']);
    });

    it('refuses a type it does not read', async () => {
        const file = new File(['{}'], 'test.json', { type: 'application/json' });

        await expect(extractDocumentBlocks(file)).rejects.toMatchObject({ reason: 'unsupported' });
    });

    it('refuses a file over the size limit before reading it', async () => {
        const file = await docxFile('<w:p><w:r><w:t>x</w:t></w:r></w:p>');
        Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });

        await expect(extractDocumentBlocks(file)).rejects.toMatchObject({ reason: 'too_large' });
    });

    it('refuses a document with no text, which is what a scan looks like here', async () => {
        const file = await docxFile('');

        await expect(extractDocumentBlocks(file)).rejects.toMatchObject({ reason: 'no_text' });
    });

    it('refuses an empty file instead of handing back an empty model', async () => {
        const file = new File([], 'empty.docx');

        await expect(extractDocumentBlocks(file)).rejects.toMatchObject({ reason: 'unreadable' });
    });

    it('surfaces a broken package as unreadable', async () => {
        const file = new File(['definitely not a zip'], 'broken.docx');

        await expect(extractDocumentBlocks(file)).rejects.toBeInstanceOf(DocumentReadError);
        await expect(extractDocumentBlocks(file)).rejects.toMatchObject({ reason: 'unreadable' });
    });

    it('agrees with the reader it delegates to', async () => {
        const file = await docxFile('<w:p><w:r><w:t>same</w:t></w:r></w:p>');
        const viaHelper = await extractDocumentBlocks(file);
        const direct = await docxToBlocks(await file.arrayBuffer());

        expect(viaHelper).toEqual(direct);
    });
});
