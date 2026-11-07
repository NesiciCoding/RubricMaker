/**
 * docxBlocks.ts
 * Turns a Word file into the neutral DocumentModel by reading `word/document.xml` directly.
 *
 * Mammoth (used by the rubric importer) is the friendlier conversion, but it throws away exactly what
 * layout recognition needs: the paragraph style name, the outline level, list numbering and the real
 * table grid. Reading the XML keeps those, at the cost of walking it ourselves.
 */

import JSZip from 'jszip';
import {
    cleanDocumentText,
    DocumentReadError,
    type DocumentBlock,
    type DocumentModel,
    type DocumentParagraph,
    type DocumentTable,
    type DocumentTableCell,
} from './documentModel';

interface StyleInfo {
    name?: string;
    headingLevel?: number;
    fontSizePt?: number;
    bold?: boolean;
}

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function elementsOf(node: Element | Document): Element[] {
    return Array.from(node.children ?? []).filter((child): child is Element => child.nodeType === 1);
}

/** Children in the WordprocessingML namespace only, so `mc:AlternateContent` wrappers can't be mistaken for content. */
function wordChildren(node: Element): Element[] {
    return elementsOf(node).filter((child) => child.namespaceURI === WORD_NS);
}

function wordChild(node: Element, localName: string): Element | undefined {
    return wordChildren(node).find((child) => child.localName === localName);
}

/** All elements of a parsed part, whatever their prefix — XML documents expose qualified names. */
function allElements(doc: Document): Element[] {
    return Array.from(doc.getElementsByTagName('*'));
}

function val(node: Element | undefined): string | undefined {
    if (!node) return undefined;
    const raw = node.getAttributeNS(WORD_NS, 'val') ?? node.getAttribute('w:val') ?? node.getAttribute('val');
    return raw === null || raw === undefined ? undefined : raw;
}

function intVal(node: Element | undefined): number | undefined {
    const raw = val(node);
    if (raw === undefined || raw === '') return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
}

/** True/false Word properties: the tag's presence means on unless `w:val` says otherwise. */
function toggle(node: Element | undefined): boolean | undefined {
    if (!node) return undefined;
    const raw = val(node);
    return raw === undefined ? true : raw !== '0' && raw !== 'false';
}

function parseXml(xml: string): Document {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new DocumentReadError('unreadable', 'document.xml is not valid XML');
    }
    return doc;
}

/** Reads `word/styles.xml` so a paragraph's style id can say "this is heading 2 at 14pt". */
function readStyles(xml: string | undefined): Map<string, StyleInfo> {
    const styles = new Map<string, StyleInfo>();
    const parents = new Map<string, string>();
    if (!xml) return styles;
    const doc = parseXml(xml);
    for (const style of allElements(doc)) {
        if (style.localName !== 'style') continue;
        const styleId =
            style.getAttributeNS(WORD_NS, 'styleId') ??
            style.getAttribute('w:styleId') ??
            style.getAttribute('styleId');
        if (!styleId) continue;
        const name = val(wordChild(style, 'name'));
        const basedOn = val(wordChild(style, 'basedOn'));
        if (basedOn) parents.set(styleId, basedOn);
        const pPr = wordChild(style, 'pPr');
        const rPr = wordChild(style, 'rPr');
        const outline = intVal(wordChild(pPr ?? style, 'outlineLvl'));
        const sizeHalfPoints = intVal(wordChild(rPr ?? style, 'sz'));
        const info: StyleInfo = {};
        if (name) info.name = name;
        const headingFromName = name ? /^heading\s*([1-6])$/i.exec(name.trim()) : null;
        if (headingFromName) info.headingLevel = Number(headingFromName[1]);
        else if (outline !== undefined && outline >= 0 && outline < 6) info.headingLevel = outline + 1;
        else if (name && /^title$/i.test(name.trim())) info.headingLevel = 1;
        if (sizeHalfPoints !== undefined && sizeHalfPoints > 0) info.fontSizePt = sizeHalfPoints / 2;
        const bold = toggle(wordChild(rPr ?? style, 'b'));
        if (bold !== undefined) info.bold = bold;
        styles.set(styleId, info);
    }
    // Inherit missing properties from each ancestor; a style's own values win.
    for (const [styleId, info] of styles) {
        const seen = new Set<string>([styleId]);
        let parentId = parents.get(styleId);
        while (parentId !== undefined && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = styles.get(parentId);
            if (!parent) break;
            if (info.headingLevel === undefined) info.headingLevel = parent.headingLevel;
            if (info.fontSizePt === undefined) info.fontSizePt = parent.fontSizePt;
            if (info.bold === undefined) info.bold = parent.bold;
            parentId = parents.get(parentId);
        }
    }
    return styles;
}

function readDefaultFontSize(xml: string | undefined): number | undefined {
    if (!xml) return undefined;
    const doc = parseXml(xml);
    for (const node of allElements(doc)) {
        if (node.localName !== 'rPrDefault') continue;
        const size = intVal(wordChild(node, 'rPr') ? wordChild(wordChild(node, 'rPr')!, 'sz') : undefined);
        if (size !== undefined && size > 0) return size / 2;
    }
    return undefined;
}

interface TextSegment {
    text: string;
    bold: boolean;
}

/** Collects a paragraph's text in document order, dropping deleted (tracked-change) and field-code runs. */
function collectText(node: Element, out: TextSegment[]): void {
    for (const child of wordChildren(node)) {
        switch (child.localName) {
            case 'pPr':
            case 'rPr':
            case 'del':
            case 'moveFrom':
            case 'instrText':
            case 'delText':
            case 'proofErr':
            case 'bookmarkStart':
            case 'bookmarkEnd':
                continue;
            case 'r': {
                const rPr = wordChild(child, 'rPr');
                const bold = toggle(wordChild(rPr ?? child, 'b')) === true;
                let text = '';
                for (const runChild of wordChildren(child)) {
                    switch (runChild.localName) {
                        case 't':
                            text += runChild.textContent ?? '';
                            break;
                        case 'tab':
                            text += '\t';
                            break;
                        case 'br':
                        case 'cr':
                            text += '\n';
                            break;
                        default:
                            break;
                    }
                }
                if (text) out.push({ text, bold });
                continue;
            }
            default:
                // Hyperlinks, content controls, smart tags and other wrappers all hold runs.
                collectText(child, out);
        }
    }
}

function readParagraph(paragraph: Element, page: number, styles: Map<string, StyleInfo>, defaultSize?: number) {
    const pPr = wordChild(paragraph, 'pPr');
    const pStyleId = val(wordChild(pPr ?? paragraph, 'pStyle'));
    const style = pStyleId ? styles.get(pStyleId) : undefined;

    const segments: TextSegment[] = [];
    collectText(paragraph, segments);
    const text = cleanDocumentText(segments.map((s) => s.text).join(''));

    const outline = intVal(wordChild(pPr ?? paragraph, 'outlineLvl'));
    const headingLevel =
        style?.headingLevel ?? (outline !== undefined && outline >= 0 && outline < 6 ? outline + 1 : undefined);

    const numPr = wordChild(pPr ?? paragraph, 'numPr');
    const numId = intVal(wordChild(numPr ?? paragraph, 'numId'));
    const numbering = numPr && numId !== 0;
    const listLevel = numbering ? (intVal(wordChild(numPr!, 'ilvl')) ?? 0) : undefined;

    const runProps = wordChild(pPr ?? paragraph, 'rPr');
    const sizeHalfPoints = intVal(wordChild(runProps ?? paragraph, 'sz'));
    const paragraphBold = toggle(wordChild(runProps ?? paragraph, 'b'));

    const block: DocumentParagraph = { kind: 'paragraph', page, text };
    if (style?.name ?? pStyleId) block.style = style?.name ?? pStyleId;
    if (headingLevel !== undefined) block.headingLevel = headingLevel;
    if (segments.length > 0 && segments.every((s) => s.bold)) block.bold = true;
    else if (paragraphBold === true) block.bold = true;
    // Word's builtin headings are bold through their style, not through the runs' own properties.
    else if (style?.bold === true) block.bold = true;
    if (sizeHalfPoints !== undefined && sizeHalfPoints > 0) block.fontSizePt = sizeHalfPoints / 2;
    else if (style?.fontSizePt !== undefined) block.fontSizePt = style.fontSizePt;
    else if (defaultSize !== undefined) block.fontSizePt = defaultSize;
    if (listLevel !== undefined) block.listLevel = listLevel;
    return block;
}

/** Collects a cell's paragraphs, descending into content controls that wrap them. */
function cellParagraphs(node: Element): Element[] {
    const paragraphs: Element[] = [];
    for (const child of wordChildren(node)) {
        if (child.localName === 'p') paragraphs.push(child);
        else if (child.localName === 'sdt') paragraphs.push(...cellParagraphs(wordChild(child, 'sdtContent') ?? child));
    }
    return paragraphs;
}

function readTable(table: Element, page: number): DocumentTable {
    const rows: DocumentTableCell[][] = [];
    for (const row of wordChildren(table)) {
        if (row.localName !== 'tr') continue;
        const cells: DocumentTableCell[] = [];
        for (const cell of wordChildren(row)) {
            if (cell.localName !== 'tc') continue;
            const paragraphs: string[] = [];
            for (const child of cellParagraphs(cell)) {
                const segments: TextSegment[] = [];
                collectText(child, segments);
                const text = cleanDocumentText(segments.map((s) => s.text).join(''));
                if (text) paragraphs.push(text);
            }
            const gridSpan = intVal(wordChild(wordChild(cell, 'tcPr') ?? cell, 'gridSpan'));
            const parsed: DocumentTableCell = { text: paragraphs.join('\n') };
            if (gridSpan !== undefined && gridSpan > 1) parsed.colspan = gridSpan;
            cells.push(parsed);
        }
        if (cells.length > 0) rows.push(cells);
    }
    return { kind: 'table', page, rows };
}

/** Walks the body in reading order, descending into content controls (which wrap real content). */
function readBlocks(
    node: Element,
    page: number,
    styles: Map<string, StyleInfo>,
    defaultSize?: number
): DocumentBlock[] {
    const blocks: DocumentBlock[] = [];
    for (const child of wordChildren(node)) {
        switch (child.localName) {
            case 'p':
                blocks.push(readParagraph(child, page, styles, defaultSize));
                break;
            case 'tbl':
                blocks.push(readTable(child, page));
                break;
            case 'sdt':
                blocks.push(...readBlocks(wordChild(child, 'sdtContent') ?? child, page, styles, defaultSize));
                break;
            case 'sdtContent':
                blocks.push(...readBlocks(child, page, styles, defaultSize));
                break;
            default:
                break;
        }
    }
    return blocks;
}

async function readEntry(zip: JSZip, path: string): Promise<string | undefined> {
    const entry = zip.file(path);
    return entry ? entry.async('string') : undefined;
}

/**
 * Reads a Word document into blocks. Header/footer parts and comments are deliberately ignored: a test
 * lives in the body, and page furniture is noise the detector would have to filter out again.
 */
export async function docxToBlocks(data: ArrayBuffer | Uint8Array | Blob): Promise<DocumentModel> {
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(data as never);
    } catch {
        throw new DocumentReadError('unreadable', 'not a Word package');
    }
    const documentXml = await readEntry(zip, 'word/document.xml');
    if (!documentXml) throw new DocumentReadError('unreadable', 'word/document.xml is missing');
    const stylesXml = await readEntry(zip, 'word/styles.xml');

    let styles: Map<string, StyleInfo>;
    let defaultSize: number | undefined;
    let doc: Document;
    try {
        styles = readStyles(stylesXml);
        defaultSize = readDefaultFontSize(stylesXml);
        doc = parseXml(documentXml);
    } catch (err) {
        if (err instanceof DocumentReadError) throw err;
        throw new DocumentReadError('unreadable', err instanceof Error ? err.message : String(err));
    }

    const body = allElements(doc).find((el) => el.localName === 'body');
    if (!body) throw new DocumentReadError('unreadable', 'word/document.xml has no body');

    return { source: 'docx', pageCount: 1, blocks: readBlocks(body, 1, styles, defaultSize) };
}
