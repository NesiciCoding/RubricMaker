/**
 * extractBlocks.ts
 * The one door a document file goes through: pick the reader from the file itself, apply the size
 * limit, and hand back the neutral DocumentModel. Callers get a DocumentReadError with a reason
 * instead of a stack trace, because every one of these failures is something the import dialog can
 * explain to a teacher.
 */

import { docxToBlocks } from './docxBlocks';
import { pdfToBlocks } from './pdfBlocks';
import { DocumentReadError, isEmptyDocument, type DocumentModel } from './documentModel';

export type DocumentImportKind = 'docx' | 'pdf';

/** Documents may carry images; 25 MB admits a scanned paper without letting a huge file freeze the tab. */
export const DOCUMENT_IMPORT_MAX_BYTES = 25 * 1024 * 1024;

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The reader for a file, from its extension (mime types lie: browsers report "" for .docx on some systems). */
export function documentImportKind(file: { name: string; type?: string }): DocumentImportKind | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === PDF_MIME) return 'pdf';
    if (name.endsWith('.docx') || file.type === DOCX_MIME) return 'docx';
    return null;
}

export function isDocumentImportFile(file: { name: string; type?: string }): boolean {
    return documentImportKind(file) !== null;
}

async function readBytes(file: File): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    // Older Safari lacks Blob.arrayBuffer; FileReader is available everywhere the app runs.
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Reads a .docx or .pdf into blocks. Throws DocumentReadError for anything the caller should explain:
 * an unsupported type, a file over the limit, a package that will not open, or a document with no text
 * (typically a scan, which needs the OCR path rather than this one).
 */
export async function extractDocumentBlocks(file: File): Promise<DocumentModel> {
    const kind = documentImportKind(file);
    if (!kind) throw new DocumentReadError('unsupported', file.name);
    if (file.size > DOCUMENT_IMPORT_MAX_BYTES) throw new DocumentReadError('too_large', file.name);

    let bytes: ArrayBuffer;
    try {
        bytes = await readBytes(file);
    } catch (err) {
        throw new DocumentReadError('unreadable', err instanceof Error ? err.message : String(err));
    }
    if (bytes.byteLength === 0) throw new DocumentReadError('unreadable', file.name);

    const model = kind === 'pdf' ? await pdfToBlocks(bytes) : await docxToBlocks(bytes);
    if (isEmptyDocument(model)) throw new DocumentReadError('no_text', file.name);
    return model;
}
