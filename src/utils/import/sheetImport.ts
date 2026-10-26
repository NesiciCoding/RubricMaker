/**
 * Recognises tiered rubric sheets in DOCX (mammoth HTML) and PDF (positioned text): per criterion a
 * column per tier, bands marked by a short code ("IO:", "B:", "E:") and the band's statements below
 * it. Both front ends produce a SheetDraft, which becomes a tiered rubric.
 */
import { DEFAULT_FORMAT, type RubricCriterion, type RubricTier, type SchoolYear, type VoTrack } from '../../types';
import { SCHOOL_YEARS, SCHOOL_YEAR_HAS_TRACK } from '../../data/schoolYears';
import { nanoid } from '../nanoid';
import { distributeWeights } from '../rubricWeights';
import { bandPreset, syncBandLevels } from '../tieredRubric';
import type { ImportWarning } from '../questionBankImport';
import type { ParsedRubric } from '../rubricImport';

export interface SheetDraft {
    title?: string;
    requirements: string[];
    /** One per tier column, left to right; empty when the sheet names none. */
    tierNames: string[];
    /** Band codes in the order the sheet lists them (worst first). */
    bandCodes: string[];
    criteria: {
        title: string;
        /** [tier column][band][statement] */
        cells: string[][][];
    }[];
    warnings: ImportWarning[];
}

const BAND_MARKER = /^\s*([A-Za-z][A-Za-z0-9+-]{0,3})\s*:\s*$/;
const REQUIREMENTS_HEADING = /\b(verplicht\w*|eisen|voorwaarden|requirements?|vereisten)\b/i;
const CHECKBOX_GLYPHS = /^[\s☐☑☒□■▢◻◼⬜••▪·-]+/u;

export const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim();
const cleanStatement = (s: string) => cleanText(s.replace(CHECKBOX_GLYPHS, ''));
const isPipeHeader = (s: string) => (s.match(/\|/g) ?? []).length >= 2;

export function bandMarker(text: string): string | null {
    return BAND_MARKER.exec(text)?.[1] ?? null;
}

// ─── Ligature repair ───────────────────────────────────────────────────────────

// Word exports that embed Calibri without a ToUnicode map for its ligature glyphs read back as
// "beva.en" (tt), "HeeD" (ft) and "Gramma6ca" / "alOjd" (ti).
const LIGATURE_FIXES: [RegExp, string][] = [
    [/(?<=\p{Ll})\.(?=\p{Ll})/gu, 'tt'],
    [/(?<=\p{Ll})[O6](?=\p{Ll})/gu, 'ti'],
    [/(?<=\p{Ll})D(?=\p{Ll}|\b|$)/gu, 'ft'],
];

/** Repairs broken ligatures, but only in a text that shows the pattern often enough to be sure. */
export function repairLigatures(texts: string[]): { texts: string[]; repaired: boolean } {
    const hits = texts.reduce((n, t) => n + LIGATURE_FIXES.reduce((m, [re]) => m + (t.match(re)?.length ?? 0), 0), 0);
    if (hits < 3) return { texts, repaired: false };
    return {
        texts: texts.map((t) => LIGATURE_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), t)),
        repaired: true,
    };
}

// ─── Requirements, title, tiers ────────────────────────────────────────────────

/** Numbered requirements from the lines after a "Verplichte eisen"-style heading. */
export function parseRequirements(lines: string[]): { requirements: string[]; used: Set<number> } {
    const used = new Set<number>();
    const start = lines.findIndex((l) => REQUIREMENTS_HEADING.test(l) && !/^\s*\d+\./.test(l));
    if (start < 0) return { requirements: [], used };
    used.add(start);
    let joined = '';
    for (let i = start + 1; i < lines.length; i++) {
        const l = lines[i];
        // A numbered item, or a continuation line of one; stop at the next field or table header.
        if (/^\s*\d+\.\s/.test(l) || (joined && !/:/.test(l) && !isPipeHeader(l) && !bandMarker(l))) {
            joined += ` ${l}`;
            used.add(i);
        } else break;
    }
    const requirements = joined
        .replace(/\|/g, ' ')
        .split(/(?:^|\s)\d+\.\s+/)
        .map(cleanText)
        .filter(Boolean);
    return { requirements, used };
}

/** The tier names of a "| Onderdeel | Mavo | Havo | VWO |" line: its last `count` cells. */
export function tierNamesFromPipeLine(line: string, count: number): string[] {
    const cells = line.split('|').map(cleanText).filter(Boolean);
    return cells.length >= count ? cells.slice(-count) : [];
}

const TRACK_PATTERNS: [RegExp, VoTrack][] = [
    [/\bbb\b|basis/i, 'vmbo-bb'],
    [/\bkb\b|kader/i, 'vmbo-kb'],
    [/mavo|\btl\b|\bgl\b|theoretisch|vmbo/i, 'vmbo-tl'],
    [/havo/i, 'havo'],
    [/vwo|atheneum|gymnasium/i, 'vwo'],
];

export function trackFromName(name: string): VoTrack | undefined {
    return TRACK_PATTERNS.find(([re]) => re.test(name))?.[1];
}

/** "Y1", "jaar 2", "klas 3", "leerjaar 1", "groep 8" in a title → that school year. */
export function yearFromText(text: string): SchoolYear | undefined {
    const groep = /\bgroep\s*([78])\b/i.exec(text);
    if (groep) return `groep-${groep[1]}` as SchoolYear;
    const jaar = /\b(?:y|year|jaar|leerjaar|klas|kl)\s*([1-6])\b/i.exec(text);
    const year = jaar && (`jaar-${jaar[1]}` as SchoolYear);
    return year && SCHOOL_YEARS.includes(year) ? year : undefined;
}

// ─── Draft → rubric ────────────────────────────────────────────────────────────

/** A recognised sheet as an importable tiered rubric. */
export function draftToParsedRubric(draft: SheetDraft, fallbackName: string): ParsedRubric {
    const warnings = [...draft.warnings];
    const columns = Math.max(draft.tierNames.length, ...draft.criteria.map((c) => c.cells.length));
    const title = draft.title?.trim() || fallbackName;

    let year = yearFromText(title) ?? yearFromText(fallbackName);
    if (!year) {
        year = 'jaar-1';
        warnings.push({ key: 'importRubric.warn_sheet_year' });
    }
    const tiers: RubricTier[] = Array.from({ length: columns }, (_, i) => {
        const name = draft.tierNames[i]?.trim();
        const track = name && SCHOOL_YEAR_HAS_TRACK[year] ? trackFromName(name) : undefined;
        return { id: nanoid(), year, ...(track && { track }), ...(name && { label: name }) };
    });
    if (draft.tierNames.length < columns) warnings.push({ key: 'importRubric.warn_sheet_tier_names' });

    // Preset labels and colours for the familiar IO / B / E codes; any other code keeps only its code.
    const preset = bandPreset(draft.bandCodes.length);
    const bands = draft.bandCodes.map((code, i) => {
        const known = preset.find((p) => p.code.toLowerCase() === code.toLowerCase());
        return { ...preset[i], code, label: known?.label ?? '' };
    });

    const criteria: RubricCriterion[] = distributeWeights(
        draft.criteria.map((c, ci) => {
            const base = syncBandLevels(
                { id: nanoid(), title: c.title || `${ci + 1}`, description: '', weight: 0, levels: [] },
                bands
            );
            return {
                ...base,
                levels: base.levels.map((level) => {
                    const bi = bands.findIndex((b) => b.id === level.bandId);
                    return {
                        ...level,
                        subItems: tiers.flatMap((tier, ti) =>
                            (c.cells[ti]?.[bi] ?? []).map((label) => ({ id: nanoid(), label, tierId: tier.id }))
                        ),
                    };
                }),
            };
        })
    );
    if (draft.criteria.some((c) => !c.title)) warnings.push({ key: 'importRubric.warn_sheet_criterion_names' });

    const confidence = warnings.length === 0 ? 'high' : 'medium';

    return {
        name: title,
        subject: '',
        description: '',
        criteria,
        confidence,
        warnings,
        format: { ...DEFAULT_FORMAT, levelOrder: 'worst-first' },
        tiered: {
            tiers,
            bands,
            ...(draft.requirements.length && {
                requirements: draft.requirements.map((text) => ({ id: nanoid(), text })),
            }),
        },
    };
}

/**
 * Folds band sequences into criteria. Each column keeps its own place: a band code it has already
 * seen in its current criterion moves it to the next criterion, so columns can be read one after
 * another (PDF) or row by row (DOCX).
 */
class CriterionBuilder {
    criteria: { title: string; cells: string[][][] }[] = [];
    readonly codes: string[] = [];
    private readonly at: number[];
    private readonly seen: Set<string>[];

    constructor(private readonly columns: number) {
        this.at = Array.from({ length: columns }, () => -1);
        this.seen = Array.from({ length: columns }, () => new Set());
    }

    /** Opens band `code` in a column; returns its statement list and whether a criterion began. */
    band(column: number, code: string): { statements: string[]; started: boolean } {
        if (!this.codes.includes(code)) this.codes.push(code);
        const started = this.at[column] < 0 || this.seen[column].has(code);
        if (started) {
            this.at[column]++;
            this.seen[column] = new Set();
            while (this.criteria.length <= this.at[column])
                this.criteria.push({ title: '', cells: Array.from({ length: this.columns }, () => []) });
        }
        this.seen[column].add(code);
        const cells = this.criteria[this.at[column]].cells[column];
        const bi = this.codes.indexOf(code);
        while (cells.length <= bi) cells.push([]);
        return { statements: cells[bi], started };
    }

    criterionOf(column: number) {
        return this.criteria[this.at[column]];
    }
}

// ─── DOCX (mammoth HTML) ───────────────────────────────────────────────────────

interface GridCell {
    paras: string[];
    origin: boolean;
    header: boolean;
}

function cellParagraphs(cell: Element): string[] {
    const paras = [...cell.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')];
    const texts = (paras.length ? paras : [cell]).map((p) => cleanText(p.textContent ?? ''));
    return texts.filter(Boolean);
}

/** A table as a grid, with row- and column-spanning cells repeated in every slot they cover. */
function tableGrid(table: Element): GridCell[][] {
    const grid: GridCell[][] = [];
    [...table.querySelectorAll('tr')].forEach((tr, r) => {
        grid[r] ??= [];
        let c = 0;
        for (const td of tr.querySelectorAll(':scope > td, :scope > th')) {
            while (grid[r][c]) c++;
            const rowspan = Number(td.getAttribute('rowspan')) || 1;
            const colspan = Number(td.getAttribute('colspan')) || 1;
            const paras = cellParagraphs(td);
            for (let dr = 0; dr < rowspan; dr++)
                for (let dc = 0; dc < colspan; dc++) {
                    grid[r + dr] ??= [];
                    grid[r + dr][c + dc] = { paras, origin: dr === 0 && dc === 0, header: td.tagName === 'TH' };
                }
            c += colspan;
        }
    });
    return grid;
}

type Block = { kind: 'line'; text: string; used?: boolean } | { kind: 'sheet'; grid: GridCell[][] };

/** Parses mammoth's HTML of a DOCX; null when it holds no tiered sheet. */
export function parseSheetHtml(html: string): SheetDraft | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks: Block[] = [];
    for (const el of doc.body.children) {
        if (el.tagName === 'TABLE') {
            const grid = tableGrid(el);
            const isSheet = grid.some((row) => row.some((cell) => cell?.paras[0] && bandMarker(cell.paras[0])));
            if (isSheet) blocks.push({ kind: 'sheet', grid });
            // Panels (title, requirements, the student/tier/verdict bar) read as lines.
            else
                for (const row of grid)
                    for (const cell of row)
                        if (cell?.origin) for (const p of cell.paras) blocks.push({ kind: 'line', text: p });
        } else {
            const paras = el.matches('ul, ol')
                ? [...el.children].map((li) => li.textContent ?? '')
                : [el.textContent ?? ''];
            for (const p of paras) if (cleanText(p)) blocks.push({ kind: 'line', text: cleanText(p) });
        }
    }
    const sheets = blocks.filter((b): b is Extract<Block, { kind: 'sheet' }> => b.kind === 'sheet');
    if (sheets.length === 0) return null;

    const lines = blocks.filter((b): b is Extract<Block, { kind: 'line' }> => b.kind === 'line');
    const { requirements, used } = parseRequirements(lines.map((l) => l.text));
    used.forEach((i) => (lines[i].used = true));
    const titleLine = lines.find((l) => !l.used && !isPipeHeader(l.text));
    if (titleLine) titleLine.used = true;

    // Tier columns are the ones that carry band markers; the column left of them names the criterion.
    const bandCols = (grid: GridCell[][]) =>
        [
            ...new Set(
                grid.flatMap((row) =>
                    row.flatMap((cell, c) => (cell?.paras[0] && bandMarker(cell.paras[0]) ? [c] : []))
                )
            ),
        ].sort((a, b) => a - b);
    const columns = Math.max(...sheets.map((s) => bandCols(s.grid).length));
    const builder = new CriterionBuilder(columns);
    let tierNames: string[] = [];
    const isNameCandidate = (l: Extract<Block, { kind: 'line' }>) =>
        !l.used && !isPipeHeader(l.text) && !/:/.test(l.text) && !bandMarker(l.text) && l.text.length <= 80;

    for (const [bi, block] of blocks.entries()) {
        if (block.kind !== 'sheet') continue;
        const cols = bandCols(block.grid);
        const nameCol = cols[0] > 0 ? cols[0] - 1 : -1;
        const firstNew = builder.criteria.length;
        let lists: (string[] | null)[] = cols.map(() => null);

        for (const row of block.grid) {
            const cells = cols.map((c) => row[c]);
            const markers = cells.map((cell) => (cell?.paras[0] ? bandMarker(cell.paras[0]) : null));
            if (markers.every((m) => !m)) {
                // Rows before the first band are the column headers.
                if (lists.every((l) => !l)) {
                    if (
                        !tierNames.length &&
                        cells.every((cell) => cell?.paras.length === 1 && cell.paras[0].length <= 40)
                    )
                        tierNames = cells.map((cell) => cell!.paras[0]);
                    continue;
                }
                cells.forEach((cell, i) => cell && lists[i]?.push(...cell.paras.map(cleanStatement).filter(Boolean)));
                continue;
            }
            lists = cells.map((cell, i) => (markers[i] ? builder.band(i, markers[i]!).statements : lists[i]));
            const crit = builder.criterionOf(0);
            if (crit && !crit.title) {
                const named = nameCol >= 0 ? (row[nameCol]?.paras.join(' ') ?? '') : '';
                // A text box anchored in the first band cell (Word's floating label) follows the code.
                const extra = (cells[0]?.paras.slice(1) ?? []).filter((p) => !isPipeHeader(p));
                const pipe = (cells[0]?.paras ?? []).find(isPipeHeader);
                if (pipe && !tierNames.length) tierNames = tierNamesFromPipeLine(pipe, cols.length);
                crit.title = cleanText(named || extra[0] || '');
            }
        }

        // Criteria still unnamed take the free line next to their table: before it if unclaimed, else after.
        const unnamed = builder.criteria.slice(firstNew).filter((c) => !c.title);
        if (unnamed.length === 1) {
            const prev = blocks[bi - 1];
            const next = blocks[bi + 1];
            const pick = [prev, next].find(
                (b): b is Extract<Block, { kind: 'line' }> => b?.kind === 'line' && isNameCandidate(b)
            );
            if (pick) {
                unnamed[0].title = pick.text;
                pick.used = true;
            }
        }
    }

    if (!tierNames.length) {
        const pipe = lines.find((l) => isPipeHeader(l.text) && tierNamesFromPipeLine(l.text, columns).length);
        if (pipe) tierNames = tierNamesFromPipeLine(pipe.text, columns);
    }

    return finishDraft(builder, { title: titleLine?.text, requirements, tierNames: tierNames.filter(Boolean) });
}

function finishDraft(
    builder: CriterionBuilder,
    head: Pick<SheetDraft, 'title' | 'requirements' | 'tierNames'>,
    warnings: ImportWarning[] = []
): SheetDraft | null {
    const criteria = builder.criteria
        .map((c) => ({ title: c.title, cells: c.cells.map((col) => builder.codes.map((_, bi) => col[bi] ?? [])) }))
        .filter((c) => c.cells.some((col) => col.some((band) => band.length > 0)));
    if (criteria.length === 0 || builder.codes.length === 0) return null;
    return { ...head, bandCodes: builder.codes, criteria, warnings };
}

// ─── PDF (positioned text) ─────────────────────────────────────────────────────

export interface PdfTextItem {
    page: number;
    /** Left edge, in points. */
    x: number;
    /** Distance from the top of the page, in points. */
    y: number;
    str: string;
}

interface PdfLine {
    page: number;
    x: number;
    y: number;
    text: string;
}

/** Merges items on the same baseline (±2pt) into lines, top to bottom, left to right. */
function toLines(items: PdfTextItem[], gap = Infinity): PdfLine[] {
    const sorted = [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    const lines: (PdfLine & { right: number })[] = [];
    for (const it of sorted) {
        const last = lines[lines.length - 1];
        if (last && last.page === it.page && Math.abs(last.y - it.y) <= 2 && it.x - last.right < gap) {
            last.text += ` ${it.str}`;
            last.right = it.x + it.str.length * 5;
        } else lines.push({ page: it.page, x: it.x, y: it.y, text: it.str, right: it.x + it.str.length * 5 });
    }
    return lines.map(({ page, x, y, text }) => ({ page, x, y, text: cleanText(text) })).filter((l) => l.text);
}

/** Parses the positioned text of a PDF; null when it holds no tiered sheet. */
export function parseSheetPdf(rawItems: PdfTextItem[]): SheetDraft | null {
    const warnings: ImportWarning[] = [];
    const { texts, repaired } = repairLigatures(rawItems.map((i) => i.str));
    if (repaired) warnings.push({ key: 'importRubric.warn_sheet_ligatures' });
    // Bare "|" items are the drawn separators of a typed-out header line, not content.
    const items = rawItems
        .map((it, i) => ({ ...it, str: texts[i] }))
        .filter((it) => it.str.trim() && it.str.trim() !== '|');

    // Columns: where band markers sit, clustered by x.
    const markers = items.filter((it) => bandMarker(it.str));
    if (markers.length < 2) return null;
    const colXs: number[] = [];
    for (const x of markers.map((m) => m.x).sort((a, b) => a - b)) {
        if (!colXs.length || x - colXs[colXs.length - 1] > 12) colXs.push(x);
    }
    const left = colXs[0] - 8;
    const columnOf = (x: number) => {
        if (x < left) return -1;
        let col = 0;
        while (col + 1 < colXs.length && x >= colXs[col + 1] - 8) col++;
        return col;
    };

    // Everything above the first marker of page 1 and left of the columns is the sheet's head.
    const firstMarker = [...markers].sort((a, b) => a.page - b.page || a.y - b.y)[0];
    const headItems = items.filter((it) => it.page === firstMarker.page && it.y < firstMarker.y - 4);
    const headLines = toLines(headItems, 40);
    // The column headers are the spanning line nearest above the first band (not the info bar).
    const tierLine = headLines.findLast(
        (l) =>
            new Set(
                headItems
                    .filter((it) => Math.abs(it.y - l.y) <= 2 && columnOf(it.x) >= 0 && it.str.trim() !== '|')
                    .map((it) => columnOf(it.x))
            ).size === colXs.length
    );
    const tierNames = tierLine
        ? colXs.map((_, c) =>
              cleanText(
                  headItems
                      .filter((it) => Math.abs(it.y - tierLine.y) <= 2 && columnOf(it.x) === c)
                      .map((it) => it.str.replace(/\|/g, ''))
                      .join(' ')
              )
          )
        : [];
    const headText = toLines(headItems).map((l) => l.text);
    const { requirements, used } = parseRequirements(headText);
    const title = headText.find((t, i) => !used.has(i) && !isPipeHeader(t));

    // Per column, walk its lines top to bottom: a marker opens a band; a line indented past the
    // band's left edge, or after a wider gap than the lines before, opens a new statement.
    const builder = new CriterionBuilder(colXs.length);
    const criterionStarts: { page: number; y: number }[] = [];
    const bodyItems = items.filter((it) => !headItems.includes(it) && columnOf(it.x) >= 0);
    for (let c = 0; c < colXs.length; c++) {
        const lines = toLines(bodyItems.filter((it) => columnOf(it.x) === c)).filter(
            // Column headers repeated on later pages sit outside any band.
            (l) => !(tierNames[c] && cleanText(l.text.replace(/\|/g, '')) === tierNames[c])
        );
        const text = lines.filter((l) => !bandMarker(l.text));
        // Wrapped lines sit at the column's left edge; a statement's first line may be indented past
        // it (a hanging checkbox) and sits further below the previous line than a wrapped line does.
        const edge = Math.min(...text.map((l) => l.x));
        const pitch = Math.min(
            ...text.slice(1).flatMap((l, i) => (l.page === text[i].page && l.y > text[i].y ? [l.y - text[i].y] : []))
        );
        let band: string[] | null = null;
        let prev: PdfLine | null = null;
        for (const line of lines) {
            const code = bandMarker(line.text);
            if (code) {
                const opened = builder.band(c, code);
                band = opened.statements;
                if (c === 0 && opened.started) criterionStarts.push({ page: line.page, y: line.y });
                prev = null;
                continue;
            }
            if (!band) continue;
            const gap = prev && prev.page === line.page ? line.y - prev.y : Infinity;
            const startsNew = !prev || line.x > edge + 6 || gap > pitch * 1.35;
            if (startsNew) band.push(line.text);
            else band[band.length - 1] = `${band[band.length - 1]} ${line.text}`;
            prev = line;
        }
    }

    // Criterion names: the text left of the columns, from each criterion's first marker to the next.
    const sideLines = toLines(items.filter((it) => !headItems.includes(it) && columnOf(it.x) < 0));
    criterionStarts.forEach((start, i) => {
        const next = criterionStarts[i + 1];
        const inRange = (l: PdfLine) =>
            (l.page > start.page || (l.page === start.page && l.y >= start.y - 30)) &&
            (!next || l.page < next.page || (l.page === next.page && l.y < next.y - 30));
        const name = sideLines.filter(
            (l) =>
                inRange(l) &&
                !isPipeHeader(l.text) &&
                !tierNames.includes(l.text) &&
                !/^(onderdeel|criterium|criterion)$/i.test(l.text)
        );
        builder.criteria[i].title = cleanText(name.map((l) => l.text).join(' '));
    });

    for (const crit of builder.criteria)
        for (const col of crit.cells)
            for (const bandList of col) bandList.forEach((s, i) => (bandList[i] = cleanStatement(s)));

    return finishDraft(builder, { title, requirements, tierNames: tierNames.filter(Boolean) }, warnings);
}
