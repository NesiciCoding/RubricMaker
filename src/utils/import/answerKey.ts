/**
 * answerKey.ts
 * Reads an answer key out of a document and pairs it with a detected draft.
 *
 * A key is nearly always a table — item number, answer, points — and the columns are named rather
 * than positional in one of several languages, so the header row is what identifies it. The pairing
 * then matches by item number and falls back to position, which keeps a key usable when the paper's
 * numbering restarts per assignment (as it normally does).
 *
 * What a key adds is not just the answer: it is also the only place a multi-gap cloze is told apart
 * from a single-gap one ("do… have" fills two blanks), and the place a grader's note lives
 * ("sportschoenen (sneakers niet goedkeuren als vertaling)").
 */

import type { ImportWarning } from '../questionBankImport';
import type { DocumentBlock, DocumentModel, DocumentTable } from './documentModel';
import type { DraftItem, TestDraft } from './testStructure';

export interface KeyEntry {
    /** The item number as printed in the key. */
    number?: string;
    /** Every accepted answer, in the key's order. */
    answers: string[];
    /** One answer per gap, for a cloze that fills several blanks. */
    gapAnswers?: string[];
    points?: number;
    /** A grader's note, stripped of its brackets. */
    note?: string;
}

export interface KeySection {
    /** The key's own title for the block ("ASSIGNMENT 1 (7p total)"), when the table carries one. */
    title?: string;
    entries: KeyEntry[];
    /** The total the title states. */
    pointsTotal?: number;
}

export interface AnswerKey {
    sections: KeySection[];
    /** Tables that looked like a key but yielded no item rows. */
    tables: number;
}

const KEY_HEADER =
    /\b(answer|answers|antwoord|antwoorden|key|solution|oplossing|points to be|punten to be|puntenwaardering|toegekend)\b/i;
const POINTS_HEADER = /\b(points?|punten|pnt|score)\b/i;
const ORDER_HEADER = /\b(question|vraag|nr|no\.?|number|item)\b/i;
const TOTAL_IN_TITLE = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:p|pt|pnt|punten|points?)\b[^)]*\)/i;
const PAREN_NOTE = /\(([^()]{4,})\)/;
const GAP_SEPARATOR = /\s*(?:…|\.{3}|-{2,})\s*/;
const ALTERNATIVE_SEPARATOR = /\s*,\s*|\s+\/\s+/;

const normalized = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Splits "don't have, do not have" into alternatives and keeps a single answer intact. */
export function splitAlternatives(raw: string): string[] {
    const text = normalized(raw);
    if (!text) return [];
    // Slash always separates alternatives ("her/hers"); a comma inside one answer ("Yes, I do")
    // must not split it. Only treat a comma list as alternatives when every part has at least
    // two words — a single leading "Yes" is a clause, not a list entry.
    if (/\//.test(text)) {
        const parts = text.split(ALTERNATIVE_SEPARATOR).map(normalized).filter(Boolean);
        if (parts.length > 1 && parts.every((part) => part.split(' ').length <= 4)) return parts;
        return [text];
    }
    const commaParts = text
        .split(/\s*,\s*/)
        .map(normalized)
        .filter(Boolean);
    if (
        commaParts.length > 1 &&
        commaParts.every((part) => {
            const wc = part.split(' ').length;
            return wc >= 2 && wc <= 4;
        })
    )
        return commaParts;
    return [text];
}

function parseEntry(cells: string[], columns: { order?: number; answer: number; points?: number }): KeyEntry | null {
    const answer = cells[columns.answer];
    if (!answer) return null;

    let text = normalized(answer);
    const entry: KeyEntry = { answers: [] };

    const number = columns.order !== undefined ? cells[columns.order] : undefined;
    if (number && /^\d{1,3}$/.test(number.trim())) entry.number = number.trim();

    // "sportschoenen (sneakers niet goedkeuren als vertaling)" — the bracket is instructions, not an answer.
    const note = PAREN_NOTE.exec(text);
    if (note && (note[1].split(' ').length >= 3 || /niet|not|geen/i.test(note[1]))) {
        entry.note = note[1].trim();
        text = normalized(text.replace(note[0], ''));
    }

    // "do… have" states one answer per blank; a cloze needs that split to build its gaps.
    const gaps = text.split(GAP_SEPARATOR).map(normalized).filter(Boolean);
    if (gaps.length > 1) {
        entry.gapAnswers = gaps;
        entry.answers = [gaps.join(' ')];
    } else {
        entry.answers = splitAlternatives(text);
    }

    if (columns.points !== undefined) {
        const rawPoints = cells[columns.points];
        const points = rawPoints ? Number.parseFloat(rawPoints.replace(',', '.').replace(/[^\d.]/g, '')) : NaN;
        if (Number.isFinite(points) && points > 0) entry.points = points;
    }

    return entry;
}

function headerColumns(
    table: DocumentTable
): { headerRow: number; order?: number; answer: number; points?: number } | null {
    for (let rowIndex = 0; rowIndex < Math.min(3, table.rows.length); rowIndex += 1) {
        const cells = table.rows[rowIndex].map((cell) => cell.text.trim());
        // A one-cell row is the table's own title ("ANSWER KEY"), not a header with columns.
        if (cells.length < 2) continue;
        const answer = cells.findIndex((cell) => KEY_HEADER.test(cell));
        if (answer === -1) continue;
        const order = cells.findIndex((cell) => ORDER_HEADER.test(cell));
        const points = cells.findIndex((cell) => POINTS_HEADER.test(cell));
        return {
            headerRow: rowIndex,
            answer,
            ...(order !== -1 ? { order } : {}),
            ...(points !== -1 ? { points } : {}),
        };
    }
    return null;
}

/** The title a key table carries in its first row ("ASSIGNMENT 1 (7p total)"), when it has one. */
function tableTitle(table: DocumentTable, headerRow: number): { title?: string; total?: number } {
    if (headerRow === 0) return {};
    const cells = table.rows[0].map((cell) => cell.text.trim()).filter(Boolean);
    if (cells.length !== 1) return {};
    const title = cells[0];
    const total = TOTAL_IN_TITLE.exec(title);
    return {
        title,
        ...(total ? { total: Number.parseFloat(total[1].replace(',', '.')) } : {}),
    };
}

/**
 * Reads every key table in a document. A table counts as a key when one of its top rows names an
 * answer column; the caller decides what to do with the sections it produces.
 */
export function extractAnswerKey(model: DocumentModel): AnswerKey {
    const sections: KeySection[] = [];
    let heading: string | undefined;
    let tables = 0;

    const blocks: DocumentBlock[] = model.blocks;
    for (const block of blocks) {
        if (block.kind !== 'table') {
            // A key may title its blocks with a heading above the table instead of inside it.
            if (
                block.text &&
                /^(assignment|opdracht|taak|part|onderdeel)\b/i.test(block.text) &&
                block.text.length < 120
            ) {
                heading = block.text;
            }
            continue;
        }

        const columns = headerColumns(block);
        if (!columns) continue;
        tables += 1;

        const fromTable = tableTitle(block, columns.headerRow);
        const entries: KeyEntry[] = [];
        for (const row of block.rows.slice(columns.headerRow + 1)) {
            const entry = parseEntry(
                row.map((cell) => cell.text.trim()),
                columns
            );
            if (entry) entries.push(entry);
        }
        if (entries.length === 0) continue;

        const section: KeySection = { entries };
        const title = fromTable.title ?? heading;
        if (title) section.title = title;
        const total = fromTable.total ?? (title ? TOTAL_IN_TITLE.exec(title)?.[1] : undefined);
        if (total !== undefined) {
            section.pointsTotal =
                typeof total === 'number' ? total : Number.parseFloat(String(total).replace(',', '.'));
        }
        sections.push(section);
        heading = undefined;
    }

    return { sections, tables };
}

/** Moves a number the paper did not print, or a disagreement with the key, into the warning list. */
function reconcilePoints(item: DraftItem, entry: KeyEntry, warnings: ImportWarning[]) {
    if (entry.points === undefined) return;
    if (item.points === undefined) {
        item.points = entry.points;
        return;
    }
    if (Math.abs(item.points - entry.points) > 0.001) {
        warnings.push({
            key: 'importTest.warn_key_points_mismatch',
            params: { item: item.label, printed: item.points, key: entry.points },
        });
    }
}

function sectionNumber(title: string | undefined): string | undefined {
    if (!title) return undefined;
    const match = /(\d{1,3})/.exec(title);
    return match ? match[1].replace(/^0+/, '') || '0' : undefined;
}

function resolveSectionIndex(draft: TestDraft, keyTitle: string | undefined, fallback: number): number | undefined {
    if (!keyTitle) return fallback;
    const keyNum = sectionNumber(keyTitle);
    if (!keyNum) return fallback;
    const candidates: number[] = [];
    draft.sections.forEach((section, index) => {
        if (sectionNumber(section.title) === keyNum) candidates.push(index);
    });
    if (candidates.length === 1) return candidates[0];
    // No match or ambiguous: fall back to order only when the fallback section carries the same
    // number; otherwise the caller warns and skips so a key is never applied to the wrong assignment.
    const fallbackNum = sectionNumber(draft.sections[fallback]?.title);
    if (candidates.length === 0 && fallbackNum === keyNum) return fallback;
    return undefined;
}

/**
 * Copies the key onto a draft: answers, gap splits, points and grader notes, matched per section by
 * item number and then by position. Reports rather than guesses when a section's counts disagree —
 * a key paired one row off would grade every question after it wrongly.
 */
export function applyAnswerKey(draft: TestDraft, key: AnswerKey): ImportWarning[] {
    const warnings: ImportWarning[] = [];

    key.sections.forEach((section, sectionIndex) => {
        const resolved = resolveSectionIndex(draft, section.title, sectionIndex);
        const title =
            (resolved !== undefined ? draft.sections[resolved]?.title : undefined) ??
            section.title ??
            `Section ${sectionIndex + 1}`;
        if (resolved === undefined) {
            warnings.push({
                key: 'importTest.warn_key_section_mismatch',
                params: { section: section.title ?? title, items: 0, answers: section.entries.length },
            });
            return;
        }
        const items = draft.items.filter((item) => item.sectionIndex === resolved);

        if (items.length === 0) {
            if (section.entries.length > 0) {
                warnings.push({
                    key: 'importTest.warn_key_without_items',
                    params: { section: title, answers: section.entries.length },
                });
            }
            return;
        }
        if (items.length !== section.entries.length) {
            warnings.push({
                key: 'importTest.warn_key_section_mismatch',
                params: { section: title, items: items.length, answers: section.entries.length },
            });
            return;
        }

        // Reserve numbered matches before positional fallback so two entries never share one item.
        const used = new Set<DraftItem>();
        const byNumber = new Map<string, DraftItem[]>();
        for (const item of items) {
            if (item.number) {
                const list = byNumber.get(item.number) ?? [];
                list.push(item);
                byNumber.set(item.number, list);
            }
        }
        const assigned = new Map<KeyEntry, DraftItem>();
        for (const entry of section.entries) {
            if (!entry.number) continue;
            const candidates = (byNumber.get(entry.number) ?? []).filter((item) => !used.has(item));
            if (candidates.length > 0) {
                const item = candidates[0];
                used.add(item);
                assigned.set(entry, item);
            }
        }
        const free = items.filter((item) => !used.has(item));
        let cursor = 0;
        for (const entry of section.entries) {
            if (assigned.has(entry)) continue;
            // Entries with a number that matched nothing keep their number for the warning context
            // but must not steal the positional slot of another entry.
            if (entry.number) {
                warnings.push({
                    key: 'importTest.warn_key_without_items',
                    params: { section: title, answers: 1 },
                });
                continue;
            }
            const item = free[cursor];
            cursor += 1;
            if (!item) continue;
            used.add(item);
            assigned.set(entry, item);
        }

        for (const [entry, item] of assigned) {
            item.answers = entry.answers;
            if (entry.gapAnswers) item.gapAnswers = entry.gapAnswers;
            if (entry.note) item.keyNote = entry.note;
            reconcilePoints(item, entry, warnings);
        }
    });

    return warnings;
}
