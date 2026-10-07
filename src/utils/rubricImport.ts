/**
 * rubricImport.ts
 * Parses a .docx or .pdf file and extracts rubric data (criteria + levels)
 * using heuristic table detection.
 */

import type { LinkedStandard, Rubric, RubricCriterion, RubricFormat, ScoringMode } from '../types';
import { nanoid } from './nanoid';
import { encodeUrlSafeBase64, decodeUrlSafeBase64 } from './urlSafeBase64';
import type { ImportWarning } from './questionBankImport';

/** Shape of a rubric JSON export — loosely typed since it's untrusted file input. */
interface RawRubricJson {
    name?: string;
    subject?: string;
    description?: string;
    criteria?: Array<{
        title?: string;
        description?: string;
        weight?: number;
        linkedStandard?: Partial<LinkedStandard>;
        linkedStandards?: Partial<LinkedStandard>[];
        levels?: Array<{
            label?: string;
            minPoints?: number;
            maxPoints?: number;
            description?: string;
            subItems?: Array<{
                label?: string;
                points?: number;
                linkedStandards?: Partial<LinkedStandard>[];
            }>;
        }>;
    }>;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedRubric {
    name: string;
    subject: string;
    description: string;
    criteria: RubricCriterion[];
    /** Number of cells successfully parsed (quality indicator) */
    confidence: 'high' | 'medium' | 'low';
    /** i18n keys (namespace `importRubric`) with interpolation params. */
    warnings: ImportWarning[];
}

interface RawTable {
    headers: string[]; // first row (level names)
    rows: string[][]; // [criterionName, desc1, desc2, ...]
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
        return emptyResult([{ key: 'importRubric.warn_no_table' }]);
    }

    // Pick the largest table (most likely the rubric)
    let best: Element = tables[0];
    let bestCells = 0;
    tables.forEach((t) => {
        const cells = t.querySelectorAll('td, th').length;
        if (cells > bestCells) {
            bestCells = cells;
            best = t;
        }
    });

    const rawTable = extractTableFromHtml(best);
    return buildParsedRubric(rawTable, file.name.replace(/\.[^.]+$/, ''));
}

export function extractTableFromHtml(table: Element): RawTable {
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach((tr) => {
        const cells: string[] = [];
        tr.querySelectorAll('td, th').forEach((td) => {
            /* v8 ignore next -- DOM textContent is always a string, so the ?? '' fallback is unreachable */
            cells.push(td.textContent?.trim() ?? '');
        });
        if (cells.some((c) => c.length > 0)) rows.push(cells);
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

    // Use the worker bundled with the app — Vite resolves this to the hashed
    // asset path at build time, avoiding any external CDN dependency.
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

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
            const y = Math.round(item.transform[5]);
            if (!lineMap.has(y)) lineMap.set(y, []);
            lineMap.get(y)!.push(item.str);
        }

        // Sort lines top-to-bottom (PDF Y increases upward)
        const sorted = [...lineMap.entries()].sort((a, b) => b[0] - a[0]);
        for (const [, parts] of sorted) {
            const line = parts.join(' ').trim();
            if (line) allLines.push(line);
        }
    }

    if (allLines.length === 0) {
        return emptyResult([{ key: 'importRubric.warn_no_pdf_text' }]);
    }

    const rawTable = detectTableFromLines(allLines);
    return buildParsedRubric(rawTable, file.name.replace(/\.[^.]+$/, ''));
}

/**
 * Heuristic: find lines that look like a row with a criterion name followed by
 * multiple level descriptions. We look for a "wide row" pattern where the first
 * column is a short label and subsequent columns are longer descriptions.
 */
export function detectTableFromLines(lines: string[]): RawTable {
    // First pass: look for a header line (short label cols like "Excellent Good Adequate Poor")
    const LEVEL_KEYWORDS =
        /\b(excellent|good|adequate|poor|satisfactory|needs improvement|beginning|developing|proficient|advanced|unsatisfactory|outstanding|distinguished|basic|emerging|mastering|insufficient|sufficient|fair|very good|meets|exceeds|below|approaching|not yet|limited|partial|full|complete|1|2|3|4|5|6|7|8|9|10)\b/i;

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
        return { headers: [], rows: lines.map((l) => [l]) };
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

export function splitCells(line: string): string[] {
    // Split on 2+ spaces, tabs, or pipe characters
    return line
        .split(/\t|\|{1,2}|  +/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

// ─── Build ParsedRubric from RawTable ─────────────────────────────────────────

/** Quality rank of common level names (higher = better), used to tell ascending from descending tables. */
const LEVEL_RANKS: [RegExp, number][] = [
    [
        /\b(excellent|outstanding|distinguished|exemplary|exceeds|exceptional|advanced|mastering|mastery|very good|high|highest|uitstekend|zeer goed)\b/i,
        5,
    ],
    [/\b(good|proficient|meets|accomplished|strong|goed|ruim voldoende)\b/i, 4],
    [/\b(satisfactory|sufficient|adequate|competent|complete|full|voldoende)\b/i, 3],
    [/\b(fair|developing|approaching|partial|basic|emerging|average|matig)\b/i, 2],
    [
        /\b(poor|weak|beginning|needs improvement|below|unsatisfactory|insufficient|limited|not yet|inadequate|incomplete|missing|low|lowest|onvoldoende|slecht|zwak)\b/i,
        1,
    ],
];

function levelRank(label: string): number | null {
    for (const [re, rank] of LEVEL_RANKS) if (re.test(label)) return rank;
    const numbered = label.match(/\b(?:level|band|niveau|stage|score)\s*(\d+)\b/i);
    return numbered ? Number(numbered[1]) : null;
}

const HEADER_POINTS_RE =
    /\(?\s*(\d+(?:[.,]\d+)?)\s*(?:[-–—]|to)?\s*(\d+(?:[.,]\d+)?)?\s*(?:pts?|points?|punten|pt|p)\b\.?\s*\)?/i;
const BARE_NUMBER_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(?:[-–—]\s*(\d+(?:[.,]\d+)?))?\s*$/;
const WEIGHT_RE = /\(?\s*(\d+(?:[.,]\d+)?)\s*%\s*\)?/;

const toNum = (v: string) => parseFloat(v.replace(',', '.'));

/** Splits a header like "Weak (1-2 pts)" or "4" into a clean label and its point range, when present. */
export function parseLevelHeader(header: string): { label: string; points: { min: number; max: number } | null } {
    const bare = header.match(BARE_NUMBER_RE);
    if (bare) {
        const a = toNum(bare[1]);
        const b = bare[2] ? toNum(bare[2]) : a;
        return { label: header.trim(), points: { min: Math.min(a, b), max: Math.max(a, b) } };
    }
    const m = header.match(HEADER_POINTS_RE);
    if (!m) return { label: header.trim(), points: null };
    const a = toNum(m[1]);
    const b = m[2] ? toNum(m[2]) : a;
    const label = header.replace(m[0], ' ').replace(/\s+/g, ' ').trim() || header.trim();
    return { label, points: { min: Math.min(a, b), max: Math.max(a, b) } };
}

/** Splits a criterion cell like "Content 40%" or "Language (60%)" into its title and weight, when present. */
export function parseCriterionCell(cell: string): { title: string; weight: number | null } {
    const m = cell.match(WEIGHT_RE);
    if (!m) return { title: cell.trim(), weight: null };
    const title = cell.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    return { title: title || cell.trim(), weight: toNum(m[1]) };
}

/** Integer weights summing to 100 (largest remainder), proportional to `raw`. */
function normaliseWeights(raw: number[]): number[] {
    const total = raw.reduce((a, b) => a + b, 0);
    if (total <= 0) return normaliseWeights(raw.map(() => 1));
    const exact = raw.map((w) => (w / total) * 100);
    const floored = exact.map(Math.floor);
    let remainder = 100 - floored.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((x, y) => y.frac - x.frac);
    for (const { i } of order) {
        if (remainder <= 0) break;
        floored[i] += 1;
        remainder -= 1;
    }
    return floored;
}

export function buildParsedRubric(raw: RawTable, defaultName: string): ParsedRubric {
    const warnings: ImportWarning[] = [];

    if (raw.headers.length === 0 || raw.rows.length === 0) {
        return emptyResult([{ key: 'importRubric.warn_no_structure' }]);
    }

    // Determine level labels from header row (skip first col which is "Criterion")
    const firstHeader = raw.headers[0].toLowerCase();
    const criterionColIdx =
        firstHeader.includes('criterion') || firstHeader.includes('criteria') || firstHeader.length < 30 ? 0 : -1;

    const levelHeaders = (criterionColIdx === 0 ? raw.headers.slice(1) : raw.headers).map(parseLevelHeader);

    if (levelHeaders.length === 0) {
        return emptyResult([{ key: 'importRubric.warn_no_levels' }]);
    }

    const total = levelHeaders.length;
    const withPoints = levelHeaders.filter((h) => h.points).length;
    // Rank by header points when every level has them, otherwise by level keywords.
    const ranks = levelHeaders.map((h) => (withPoints === total ? h.points!.max : levelRank(h.label)));
    const known = ranks.filter((r): r is number => r !== null);
    const ascending = known.length >= 2 && known[known.length - 1] > known[0];
    const orderKnown = known.length >= 2 && known[known.length - 1] !== known[0];
    let ambiguous = false;
    if (withPoints > 0 && withPoints < total) warnings.push({ key: 'importRubric.warn_points_partial' });
    if (withPoints < total && !orderKnown && total > 1) {
        ambiguous = true;
        warnings.push({ key: 'importRubric.warn_order_guessed' });
    }
    const levelPoints = levelHeaders.map((h, i) => {
        if (h.points) return h.points;
        const pts = ascending ? i + 1 : total - i;
        return { min: pts, max: pts };
    });

    const descStart = criterionColIdx === 0 ? 1 : 0;
    const expectedCells = descStart + total;
    let mismatched = false;
    const parsedRows: { title: string; weight: number | null; row: string[] }[] = [];

    for (const row of raw.rows) {
        if (row.length === 0 || !row[0]) continue;
        const filled = row.filter((c) => c.trim().length > 0).length;
        if (total >= 2 && filled === 1) {
            // A merged (colspan) row such as a section heading — not a criterion.
            warnings.push({ key: 'importRubric.warn_merged_row', params: { title: row[0] } });
            mismatched = true;
            continue;
        }
        if (row.length !== expectedCells) {
            mismatched = true;
            warnings.push({
                key: 'importRubric.warn_cell_count',
                params: { title: row[0], found: Math.max(0, row.length - descStart), expected: total },
            });
        }
        const { title, weight } = parseCriterionCell(row[0]);
        parsedRows.push({ title, weight, row });
    }

    if (parsedRows.length === 0) {
        return emptyResult([...warnings, { key: 'importRubric.warn_no_criteria' }]);
    }

    const given = parsedRows.map((r) => r.weight);
    const givenCount = given.filter((w) => w !== null).length;
    let rawWeights: number[];
    if (givenCount === 0) {
        rawWeights = given.map(() => 1);
    } else if (givenCount === given.length) {
        rawWeights = given as number[];
        const sum = rawWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.5)
            warnings.push({ key: 'importRubric.warn_weights_scaled', params: { total: sum } });
    } else {
        const sum = given.reduce<number>((a, b) => a + (b ?? 0), 0);
        const remaining = Math.max(0, 100 - sum);
        const share = remaining / (given.length - givenCount);
        rawWeights = given.map((w) => w ?? share);
        warnings.push({ key: 'importRubric.warn_weights_partial', params: { remaining: Math.round(remaining) } });
    }
    const weights = normaliseWeights(rawWeights);

    const criteria: RubricCriterion[] = parsedRows.map(({ title, row }, idx) => ({
        id: nanoid(),
        title,
        description: '',
        weight: weights[idx],
        levels: levelHeaders.map((h, i) => ({
            id: nanoid(),
            label: h.label,
            minPoints: levelPoints[i].min,
            maxPoints: levelPoints[i].max,
            description: row[descStart + i] ?? '',
            subItems: [],
        })),
    }));

    if (criteria.length < 2) warnings.push({ key: 'importRubric.warn_one_criterion' });
    if (total < 2) warnings.push({ key: 'importRubric.warn_one_level' });

    const confidence: ParsedRubric['confidence'] =
        criteria.length >= 2 && total >= 2 && !mismatched && !ambiguous ? 'high' : 'medium';

    return {
        name: defaultName,
        subject: '',
        description: '',
        criteria,
        confidence,
        warnings,
    };
}

function emptyResult(warnings: ImportWarning[]): ParsedRubric {
    return {
        name: '',
        subject: '',
        description: '',
        criteria: [],
        confidence: 'low',
        warnings,
    };
}

// ─── JSON Parsing ──────────────────────────────────────────────────────────────

export async function parseJsonToRubric(file: File): Promise<ParsedRubric> {
    try {
        const text = await file.text();
        const data = JSON.parse(text) as RawRubricJson;

        if (!data || !Array.isArray(data.criteria)) {
            return emptyResult([{ key: 'importRubric.warn_invalid_json' }]);
        }

        // Deep clone and regenerate all IDs to prevent collisions when importing into the same workspace
        const criteria: RubricCriterion[] = data.criteria.map((c) => ({
            id: nanoid(),
            title: c.title || 'Untitled Criterion',
            description: c.description || '',
            weight: typeof c.weight === 'number' ? c.weight : 0,
            linkedStandard: c.linkedStandard ? ({ ...c.linkedStandard } as LinkedStandard) : undefined,
            linkedStandards: Array.isArray(c.linkedStandards)
                ? c.linkedStandards.map((s) => ({ ...s }) as LinkedStandard)
                : undefined,
            levels: (c.levels || []).map((l) => ({
                id: nanoid(),
                label: l.label || 'Level',
                minPoints: typeof l.minPoints === 'number' ? l.minPoints : 0,
                maxPoints: typeof l.maxPoints === 'number' ? l.maxPoints : 0,
                description: l.description || '',
                subItems: (l.subItems || []).map((si) => ({
                    id: nanoid(),
                    label: si.label || '',
                    points: typeof si.points === 'number' ? si.points : 0,
                    linkedStandards: Array.isArray(si.linkedStandards)
                        ? si.linkedStandards.map((s) => ({ ...s }) as LinkedStandard)
                        : undefined,
                })),
            })),
        }));

        return {
            name: data.name || file.name.replace(/\.[^.]+$/, ''),
            subject: data.subject || '',
            description: data.description || '',
            criteria,
            confidence: 'high',
            warnings: [],
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return emptyResult([{ key: 'importRubric.warn_json_failed', params: { message } }]);
    }
}

// ─── Share Codes ───────────────────────────────────────────────────────────────

/** Encodes a rubric into a compact shareable text code (base64 JSON). */
export function encodeRubricShareCode(rubric: Rubric): string {
    const shareable = {
        name: rubric.name,
        subject: rubric.subject,
        description: rubric.description,
        criteria: rubric.criteria,
        gradeScaleId: rubric.gradeScaleId,
        scoringMode: rubric.scoringMode,
        totalMaxPoints: rubric.totalMaxPoints,
        format: rubric.format,
    };
    return encodeUrlSafeBase64(JSON.stringify(shareable));
}

/** Decodes a share code back into a ParsedRubric (ready for import). */
export function decodeRubricShareCode(code: string): ParsedRubric & {
    gradeScaleId?: string;
    scoringMode?: ScoringMode;
    totalMaxPoints?: number;
    format?: RubricFormat;
} {
    const json = decodeUrlSafeBase64(code);
    const data = JSON.parse(json);
    if (!Array.isArray(data.criteria)) throw new Error('Invalid share code: missing criteria');
    return {
        name: data.name || '',
        subject: data.subject || '',
        description: data.description || '',
        criteria: data.criteria,
        confidence: 'high',
        warnings: [],
        gradeScaleId: data.gradeScaleId,
        scoringMode: data.scoringMode,
        totalMaxPoints: data.totalMaxPoints,
        format: data.format,
    };
}
