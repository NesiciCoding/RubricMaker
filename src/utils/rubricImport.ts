/**
 * rubricImport.ts
 * Parses a .docx or .pdf file and extracts rubric data (criteria + levels)
 * using heuristic table detection.
 */

import type { RubricCriterion, RubricLevel } from '../types';
import { nanoid } from './nanoid';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedRubric {
    name: string;
    subject: string;
    description: string;
    criteria: RubricCriterion[];
    /** Number of cells successfully parsed (quality indicator) */
    confidence: 'high' | 'medium' | 'low';
    warnings: string[];
}

interface RawTable {
    headers: string[];   // first row (level names)
    rows: string[][];    // [criterionName, desc1, desc2, ...]
}

// ─── DOCX Parsing ──────────────────────────────────────────────────────────────

export async function parseDocxToRubric(file: File): Promise<ParsedRubric> {
    // Dynamically import mammoth (large lib, lazy-loaded)
    const mammoth = await import('mammoth');

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });

    const parser = new DOMParser();
    const doc = parser.parseFromString(result.value, 'text/html');

    const tables = doc.querySelectorAll('table');
    if (tables.length === 0) {
        return emptyResult(['No table found in document. Make sure your rubric uses a table layout.']);
    }

    // Pick the largest table (most likely the rubric)
    let best: Element = tables[0];
    let bestCells = 0;
    tables.forEach(t => {
        const cells = t.querySelectorAll('td, th').length;
        if (cells > bestCells) { bestCells = cells; best = t; }
    });

    const rawTable = extractTableFromHtml(best);
    return buildParsedRubric(rawTable, file.name.replace(/\.[^.]+$/, ''));
}

function extractTableFromHtml(table: Element): RawTable {
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach(tr => {
        const cells: string[] = [];
        tr.querySelectorAll('td, th').forEach(td => {
            cells.push(td.textContent?.trim() ?? '');
        });
        if (cells.some(c => c.length > 0)) rows.push(cells);
    });

    if (rows.length < 2) return { headers: [], rows: [] };

    return {
        headers: rows[0],
        rows: rows.slice(1),
    };
}

// ─── PDF Parsing ───────────────────────────────────────────────────────────────

export async function parsePdfToRubric(file: File): Promise<ParsedRubric> {
    // Dynamically import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');

    // Set up worker – use CDN to avoid bundling the large worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const allLines: string[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();

        // Group text items by approximate Y position (same line)
        const lineMap = new Map<number, string[]>();
        for (const item of content.items) {
            if (!('str' in item)) continue;
            const y = Math.round((item as any).transform[5]);
            if (!lineMap.has(y)) lineMap.set(y, []);
            lineMap.get(y)!.push((item as any).str);
        }

        // Sort lines top-to-bottom (PDF Y increases upward)
        const sorted = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);
        for (const [, parts] of sorted) {
            const line = parts.join(' ').trim();
            if (line) allLines.push(line);
        }
    }

    if (allLines.length === 0) {
        return emptyResult(['Could not extract any text from PDF. The file may be image-based (scanned).']);
    }

    const rawTable = detectTableFromLines(allLines);
    return buildParsedRubric(rawTable, file.name.replace(/\.[^.]+$/, ''));
}

/**
 * Heuristic: find lines that look like a row with a criterion name followed by
 * multiple level descriptions. We look for a "wide row" pattern where the first
 * column is a short label and subsequent columns are longer descriptions.
 */
function detectTableFromLines(lines: string[]): RawTable {
    // First pass: look for a header line (short label cols like "Excellent Good Adequate Poor")
    const LEVEL_KEYWORDS = /\b(excellent|good|adequate|poor|satisfactory|needs improvement|beginning|developing|proficient|advanced|unsatisfactory|outstanding|distinguished|basic|emerging|mastering|insufficient|sufficient|fair|very good|meets|exceeds|below|approaching|not yet|limited|partial|full|complete|1|2|3|4|5|6|7|8|9|10)\b/i;

    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const matches = lines[i].match(new RegExp(LEVEL_KEYWORDS.source, 'gi'));
        if (matches && matches.length >= 2) {
            headerIdx = i;
            break;
        }
    }

    if (headerIdx === -1) {
        // Fallback: split all lines into chunks of equal size
        return { headers: [], rows: lines.map(l => [l]) };
    }

    // Parse header line: split by multiple spaces or common delimiters
    const headerLine = lines[headerIdx];
    const headers = splitCells(headerLine);

    // Subsequent lines form the body rows
    const bodyLines = lines.slice(headerIdx + 1);
    const numCols = headers.length;
    const rows: string[][] = [];

    let current: string[] = [];
    for (const line of bodyLines) {
        const cells = splitCells(line);
        if (cells.length >= numCols - 1) {
            if (current.length) rows.push(current);
            current = cells;
        } else if (current.length) {
            // Continuation of previous row
            current[current.length - 1] += ' ' + line;
        }
    }
    if (current.length) rows.push(current);

    return { headers, rows };
}

function splitCells(line: string): string[] {
    // Split on 2+ spaces, tabs, or pipe characters
    return line.split(/\t|\|{1,2}|  +/).map(s => s.trim()).filter(s => s.length > 0);
}

// ─── Build ParsedRubric from RawTable ─────────────────────────────────────────

function buildParsedRubric(raw: RawTable, defaultName: string): ParsedRubric {
    const warnings: string[] = [];

    if (raw.headers.length === 0 || raw.rows.length === 0) {
        return emptyResult(['Could not detect a rubric table structure in the document.']);
    }

    // Determine level labels from header row (skip first col which is "Criterion")
    const firstHeader = raw.headers[0].toLowerCase();
    const criterionColIdx = firstHeader.includes('criterion') || firstHeader.includes('criteria')
        || firstHeader.length < 30
        ? 0
        : -1;

    const levelLabels = criterionColIdx === 0
        ? raw.headers.slice(1)
        : raw.headers;

    if (levelLabels.length === 0) {
        return emptyResult(['Found a table but could not detect level columns.']);
    }

    // Default increasing point values based on number of levels
    const defaultPoints = (idx: number, total: number) => total - idx; // e.g. 4,3,2,1 for 4 levels

    const criteria: RubricCriterion[] = [];

    for (const row of raw.rows) {
        if (row.length === 0) continue;

        const criterionName = criterionColIdx === 0 ? row[0] : row[0];
        const descStart = criterionColIdx === 0 ? 1 : 0;

        const levels: RubricLevel[] = levelLabels.map((label, i) => {
            const pts = defaultPoints(i, levelLabels.length);
            return {
                id: nanoid(),
                label,
                minPoints: pts,
                maxPoints: pts,
                description: row[descStart + i] ?? '',
                subItems: [],
            };
        });

        if (criterionName) {
            criteria.push({
                id: nanoid(),
                title: criterionName,
                description: '',
                weight: Math.round(100 / raw.rows.length),
                levels,
            });
        }
    }

    if (criteria.length === 0) {
        return emptyResult(['Table found but no criteria could be extracted.']);
    }

    if (criteria.length < 2) warnings.push('Only one criterion was detected — the document may not be a standard rubric.');
    if (levelLabels.length < 2) warnings.push('Only one level was detected — columns may not have been parsed correctly.');

    const confidence: ParsedRubric['confidence'] =
        criteria.length >= 2 && levelLabels.length >= 2 ? 'high' :
            criteria.length >= 1 && levelLabels.length >= 1 ? 'medium' : 'low';

    return {
        name: defaultName,
        subject: '',
        description: '',
        criteria,
        confidence,
        warnings,
    };
}

function emptyResult(warnings: string[]): ParsedRubric {
    return {
        name: '',
        subject: '',
        description: '',
        criteria: [],
        confidence: 'low',
        warnings,
    };
}
