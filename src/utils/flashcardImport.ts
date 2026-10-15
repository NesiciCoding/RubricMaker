import Papa from 'papaparse';

/** A card parsed from an import file; the caller assigns ids. */
export interface ParsedFlashcard {
    front: string;
    back: string;
    example?: string;
    phonetic?: string;
    partOfSpeech?: string;
}

/** Thrown for legacy .xls and other unreadable formats so the UI can show a targeted hint. */
export class UnsupportedFlashcardFileError extends Error {
    constructor(public readonly extension: string) {
        super(`Unsupported flashcard file type: ${extension}`);
    }
}

type Cellish = string | number | boolean | Date | null | undefined;

function toText(cell: Cellish): string {
    if (cell === null || cell === undefined) return '';
    /* v8 ignore next -- cells only ever come from CSV/txt string parsing, never Date values */
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    return String(cell).trim();
}

// Column-header words. The English set covers most exports; the localised set covers the
// app's other UI languages (NL/FR/DE/ES) so a "Woord,Vertaling" header is skipped too.
const HEADER_FRONT =
    /^(front|term|word|question|phrase|voorkant|woord|begrip|vraag|terme|mot|question|phrase|vorderseite|wort|begriff|frage|frente|palabra|término|pregunta)$/i;
const HEADER_BACK =
    /^(back|definition|translation|answer|meaning|achterkant|vertaling|definitie|betekenis|antwoord|arrière|traduction|définition|réponse|sens|rückseite|übersetzung|bedeutung|antwort|reverso|traducción|definición|respuesta|significado)$/i;

// A bilingual deck often labels its columns with language names ("Nederlands,English").
// That only counts as a header when BOTH cells are language names, so a genuine first card
// such as ("Frans", "French") survives a single-cell match.
const LANGUAGE_NAME =
    /^(english|engels|anglais|englisch|inglés|dutch|nederlands|néerlandais|niederländisch|neerlandés|french|frans|français|französisch|francés|german|duits|allemand|deutsch|alemán|spanish|spaans|espagnol|spanisch|español|italian|italiaans|italien|italienisch|italiano|portuguese|portugees|portugais|portugiesisch|portugués)$/i;

function isHeaderRow(front: string, back: string): boolean {
    return (
        HEADER_FRONT.test(front) || HEADER_BACK.test(back) || (LANGUAGE_NAME.test(front) && LANGUAGE_NAME.test(back))
    );
}

export function cardsFromRows(rows: Cellish[][]): ParsedFlashcard[] {
    const cards: ParsedFlashcard[] = [];
    const seen = new Set<string>();
    rows.forEach((row, i) => {
        const front = toText(row[0]);
        const back = toText(row[1]);
        if (!front || !back) return;
        if (i === 0 && isHeaderRow(front, back)) return;
        const example = toText(row[2]);
        // Optional trailing columns (back-compat: absent in 2/3-column files).
        const phonetic = toText(row[3]);
        const partOfSpeech = toText(row[4]);
        // Skip rows that repeat an earlier one verbatim, so a file listing the same card
        // twice does not import it twice.
        const rowKey = [front, back, example, phonetic, partOfSpeech].join('\u0000');
        if (seen.has(rowKey)) return;
        seen.add(rowKey);
        cards.push({
            front,
            back,
            ...(example ? { example } : {}),
            ...(phonetic ? { phonetic } : {}),
            ...(partOfSpeech ? { partOfSpeech } : {}),
        });
    });
    return cards;
}

export function parseCsvText(text: string): ParsedFlashcard[] {
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return cardsFromRows(result.data);
}

// Order matters: tab and semicolon are unambiguous separators; " - " and ":" are
// fallbacks for word lists pasted from documents ("apple - appel", "apple: appel").
const LINE_SEPARATORS = ['\t', ';', ' - ', ' – ', ':'];

export function splitLine(line: string): string[] | null {
    for (const sep of LINE_SEPARATORS) {
        const idx = line.indexOf(sep);
        if (idx > 0 && idx < line.length - sep.length) {
            return [line.slice(0, idx), line.slice(idx + sep.length)];
        }
    }
    return null;
}

/** Free text (DOCX/TXT): one card per line, front/back split on the first separator found. */
export function parseLines(text: string): ParsedFlashcard[] {
    const rows = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^(?:[-•*]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
        .map((l) => splitLine(l))
        .filter((r): r is string[] => r !== null);
    return cardsFromRows(rows);
}

export async function parseFlashcardFile(file: File): Promise<ParsedFlashcard[]> {
    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    switch (ext) {
        case 'csv':
            return parseCsvText(await file.text());
        case 'txt':
            return parseLines(await file.text());
        case 'xlsx': {
            const { readSheet } = await import('read-excel-file/browser');
            const rows = await readSheet(file);
            return cardsFromRows(rows as unknown as Cellish[][]);
        }
        case 'docx': {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
            return parseLines(result.value);
        }
        default:
            throw new UnsupportedFlashcardFileError(ext);
    }
}
