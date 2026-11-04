/**
 * documentModel.ts
 * The neutral shape that every imported document is reduced to before anything tries to recognise a
 * test in it: an ordered list of paragraphs and tables, each carrying the few layout facts the
 * structure detector needs (heading level, list level, emphasis, font size, page position).
 *
 * Word and PDF are laid out completely differently — one has named styles and real tables, the other
 * only has glyphs at coordinates — so the detector must never see either format's own vocabulary.
 * Keeping that boundary here is what lets the same recogniser read a Word file, a digital PDF and
 * (later) an OCR'd scan.
 */

export interface DocumentParagraph {
    kind: 'paragraph';
    /** 1 for a Word document, which has no pages until it is laid out; 1-based for a PDF. */
    page: number;
    text: string;
    /** The source's own style name when it has one ("Heading 1", "List Paragraph"). */
    style?: string;
    /** 1-6 when the source marks this as a heading; absent otherwise. */
    headingLevel?: number;
    /** True when every text-bearing run is bold, so a detector can use emphasis as a heading cue. */
    bold?: boolean;
    italic?: boolean;
    /** Effective font size in points, when the source states one. */
    fontSizePt?: number;
    /** 0 for the outermost list level, when the source lists the paragraph. */
    listLevel?: number;
    /**
     * Whether that list counts ("1.", "2.") or merely marks bullets. A numbered Word list is a strong
     * item cue even though the ordinal never appears in the text; a bulleted one is usually an
     * instruction, so the two must not be confused.
     */
    listFormat?: 'numbered' | 'bullet';
    /** Left edge of the text, in PDF points from the page's left margin. PDF only. */
    x?: number;
}

export interface DocumentTableCell {
    text: string;
    /** Columns this cell spans; 1 (or absent) for an ordinary cell. */
    colspan?: number;
}

export interface DocumentTable {
    kind: 'table';
    page: number;
    rows: DocumentTableCell[][];
}

export type DocumentBlock = DocumentParagraph | DocumentTable;

export interface DocumentModel {
    source: 'docx' | 'pdf';
    /** Page count; 1 for a Word document, which is paginated at print time. */
    pageCount: number;
    blocks: DocumentBlock[];
    /** Caveats worth surfacing while reading ("this PDF has no text layer"), keyed for i18n. */
    notes?: DocumentReadNote[];
}

export interface DocumentReadNote {
    /** Why the note exists: a bare format such as `pdf_no_text_layer` or `docx_tracked_changes_skipped`. */
    key: string;
    params?: Record<string, string | number>;
}

/** Why a file could not be read; the caller turns these into user-facing warnings. */
export type DocumentReadFailure = 'unsupported' | 'too_large' | 'unreadable' | 'no_text';

export class DocumentReadError extends Error {
    constructor(
        readonly reason: DocumentReadFailure,
        message?: string
    ) {
        super(message ?? reason);
        this.name = 'DocumentReadError';
    }
}

/** Collapses runs of whitespace, including the non-breaking spaces Word and PDF leave behind. */
export function cleanDocumentText(text: string): string {
    return text
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

/** The paragraphs of a model, in reading order — tables are skipped because they are parsed separately. */
export function documentParagraphs(model: DocumentModel): DocumentParagraph[] {
    return model.blocks.filter((b): b is DocumentParagraph => b.kind === 'paragraph');
}

/** The whole document as plain text, one block per line, for summaries and fuzzy matching. */
export function plainDocumentText(model: DocumentModel): string {
    return model.blocks
        .map((block) =>
            block.kind === 'table'
                ? block.rows.map((row) => row.map((cell) => cell.text).join('\t')).join('\n')
                : block.text
        )
        .filter((line) => line.trim().length > 0)
        .join('\n');
}

/** True when the document holds nothing worth importing — a blank PDF, an empty template. */
export function isEmptyDocument(model: DocumentModel): boolean {
    return plainDocumentText(model).trim().length === 0;
}
