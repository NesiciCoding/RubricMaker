/**
 * testStructure.ts
 * Finds a test's skeleton in a DocumentModel: the title, the sections, the numbered items, what each
 * item asks and how many points it is worth.
 *
 * Nothing here matches a template. Detection is cue-based and scored — a Word outline level, a font
 * two points larger than the body, a bold run, an "ASSIGNMENT" keyword, a points total in parentheses,
 * a leading ordinal — so a paper with a different exporter and different wording still lands.
 *
 * A missing cue degrades into a warning rather than losing content: items survive with no section and
 * points survive as "unknown", and the dialog's review step shows the teacher what to fix. That is
 * what makes an unknown layout workable instead of fatal.
 */

import type { ImportWarning } from '../questionBankImport';
import type { DocumentBlock, DocumentModel, DocumentParagraph, DocumentTable } from './documentModel';

export interface DraftItem {
    /** As printed, for warnings: "Assignment 1 · 7". */
    label: string;
    /** Index into `sections`; -1 when the document never marked a section. */
    sectionIndex: number;
    /** The ordinal as printed, without its dot or bracket. */
    number?: string;
    /** The prompt, with the ordinal, the points marker and a trailing cue or option pair removed. */
    text: string;
    points?: number;
    /** A trailing parenthetical that is not the points marker: "(Anna)", "(+)", "(informeel)". */
    cue?: string;
    /** A trailing "a/ b" pair — the paper's way of printing a circle-the-answer item. */
    inlineOptions?: string[];
    /** How many blank runs the prompt contains, which is what a cloze needs to know. */
    blanks: number;
    /** For an item that came from a table row: the row's cells, so a later phase can read columns. */
    tableCells?: string[];
    /** Every accepted answer, once a key has been paired in. */
    answers?: string[];
    /** One answer per blank, for a cloze that fills more than one gap. */
    gapAnswers?: string[];
    /** The key's grading note, e.g. that a near-synonym must not be accepted. */
    keyNote?: string;
}

export interface DraftSection {
    title: string;
    /** The text between the heading and the first item, joined. */
    instruction?: string;
    /** The points total the heading states, when it states one. */
    pointsTotal?: number;
    page: number;
}

export interface TestDraft {
    title?: string;
    sections: DraftSection[];
    items: DraftItem[];
    warnings: ImportWarning[];
    confidence: 'high' | 'medium' | 'low';
}

const ITEM_START = /^(\d{1,3})\s*[.)]\s+(?=\S)/;
const SECTION_KEYWORD = /^(assignment|opdracht|taak|task|part|deel|onderdeel|section|oefening|exercise)\b/i;
/** "(1p)", "(2 punten)", "(1 point)" at the end of an item. */
const POINTS_SUFFIX = /\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:p|pt|pnt|punten|points?)\b[^)]*\)\s*$/i;
/** The same marker anywhere in a heading. */
const ANY_POINTS = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:p|pt|pnt|punten|points?)\b([^)]*)\)/i;
/** A points marker that also says "in total": "(7p in totaal te behalen)", "(6p total)". */
const TOTAL_WORDS = /\b(totaal|total|behalen|behaalbaar|samen)\b/i;
/** A trailing "(Anna)" cue: anything short that is not the points marker and not a number. */
const TRAILING_CUE = /\(\s*([^()]{1,40}?)\s*\)\s*$/;
/**
 * A trailing run of answers printed next to the gap: "her/ hers" for a pair, "a/an/the" for a
 * three-way choice. Reading only the last pair would leave "a/" behind in the prompt.
 */
const TRAILING_OPTIONS = /((?:[\p{L}][\p{L}'-]*)(?:\s*\/\s*[\p{L}][\p{L}'-]*)+)\s*$/u;
/** What a paper prints where an answer goes: an underline, a dotted leader or a row of middots. */
export const BLANK_RUN = /_{2,}|\.{4,}|…{2,}|·{3,}/gu;
const BARE_NUMBER = /^\d{1,3}$/;
const FORM_FIELD = /^(naam|name|klas|class|datum|date|groep|group|leerling|student|cursist|cijfer)\b\s*[:：]/i;
const BULLET = /^\s*[•·▪\-–—*]\s+/u;
/** A table header that says this table is the answer key, not the paper. */
export const KEY_HEADER =
    /\b(answer|answers|antwoord|antwoorden|key|solution|oplossing|points to be|punten to be|puntenwaardering|toegekend)\b/i;
/** A line that ends a sentence, so the next paragraph is unlikely to be a wrapped continuation. */
const ENDS_SENTENCE = /[.?!:;)"'”’]\s*$/;

const allCaps = (text: string): boolean => /\p{Lu}{3}/u.test(text) && text === text.toUpperCase();

function toNumber(raw: string): number {
    return Number.parseFloat(raw.replace(',', '.'));
}

function countBlanks(text: string): number {
    return [...text.matchAll(new RegExp(BLANK_RUN.source, 'gu'))].length;
}

/** The body font size: what most paragraphs use, which is what "bigger" is measured against. */
function bodyFontSize(paragraphs: DocumentParagraph[]): number {
    const counts = new Map<number, number>();
    for (const p of paragraphs) {
        if (p.fontSizePt === undefined || ITEM_START.test(p.text)) continue;
        const size = Math.round(p.fontSizePt);
        counts.set(size, (counts.get(size) ?? 0) + 1);
    }
    let best = 0;
    let bestCount = 0;
    for (const [size, count] of counts) {
        if (count > bestCount) {
            best = size;
            bestCount = count;
        }
    }
    return best;
}

/** How strongly a paragraph claims to be a section heading. Three or more is a heading. */
export function headingScore(paragraph: DocumentParagraph, bodySize: number): number {
    const text = paragraph.text;
    if (!text || ITEM_START.test(text) || FORM_FIELD.test(text) || BARE_NUMBER.test(text)) return 0;
    if (paragraph.listFormat === 'numbered' && paragraph.headingLevel === undefined && !SECTION_KEYWORD.test(text)) {
        return 0;
    }

    let score = 0;
    if (paragraph.headingLevel !== undefined) score += 3;
    if (paragraph.style && /heading|title|kop/i.test(paragraph.style)) score += 2;
    if (paragraph.bold) score += 1;
    if (bodySize > 0 && paragraph.fontSizePt !== undefined && paragraph.fontSizePt >= bodySize + 0.5) score += 2;
    if (SECTION_KEYWORD.test(text)) score += 2;
    if (allCaps(text)) score += 1;
    if (ANY_POINTS.test(text)) score += 2;
    // A long paragraph is prose — an instruction or a reading passage — not a heading.
    if (text.length > 120) score -= 2;
    if (BULLET.test(text)) score -= 2;
    return score;
}

function isHeading(paragraph: DocumentParagraph, bodySize: number): boolean {
    return headingScore(paragraph, bodySize) >= 3;
}

/** Drops running headers/footers and page numbers, which repeat and would otherwise look like content. */
function withoutFurniture(paragraphs: DocumentParagraph[], pageCount: number): Set<DocumentParagraph> {
    const occurrences = new Map<string, number>();
    for (const p of paragraphs) occurrences.set(p.text, (occurrences.get(p.text) ?? 0) + 1);

    return new Set(
        paragraphs.filter((p) => {
            if (BARE_NUMBER.test(p.text)) return false;
            if (pageCount < 2) return true;
            const seen = occurrences.get(p.text) ?? 0;
            // The same short line on most pages is a running header, a footer or a page label.
            return !(seen >= Math.max(2, pageCount - 1) && p.text.length <= 80);
        })
    );
}

function pointsFromSuffix(text: string): { text: string; points?: number } {
    const match = POINTS_SUFFIX.exec(text);
    if (!match) return { text };
    return { text: text.slice(0, match.index).trim(), points: toNumber(match[1]) };
}

/** The points total a section heading states, and whether the wording says it is the assignment's total. */
function pointsInHeading(text: string): number | undefined {
    const match = ANY_POINTS.exec(text);
    if (!match) return undefined;
    const isTotal = TOTAL_WORDS.test(`${match[2] ?? ''} ${text}`);
    return isTotal ? toNumber(match[1]) : undefined;
}

function isKeyTable(table: DocumentTable): boolean {
    // A key table often starts with its own title row ("ASSIGNMENT 1"), so the header can be one or
    // two rows down. Checking the top three rows is what tells "ANSWER" from an item table.
    const header = table.rows
        .slice(0, 3)
        .map((row) => row.map((cell) => cell.text).join(' '))
        .join(' ');
    return KEY_HEADER.test(header);
}

/** Splits the trailing cue and option pair off an item, leaving the prompt itself. */
function splitExtras(rawText: string): { text: string; cue?: string; inlineOptions?: string[] } {
    let text = rawText.trim();
    let cue: string | undefined;
    let inlineOptions: string[] | undefined;

    const options = TRAILING_OPTIONS.exec(text);
    if (options) {
        const parts = options[1].split(/\s*\/\s*/);
        // A path, a date or a fraction is not a run of answer options.
        if (parts.length >= 2 && parts.every((part) => part.length <= 20 && !/\d/.test(part))) {
            inlineOptions = parts;
            text = text.slice(0, options.index).trim();
        }
    }

    const trailing = TRAILING_CUE.exec(text);
    if (trailing) {
        const inner = trailing[1];
        // "(1)" or "(2 punten)" would be a points marker; a cue is words or symbols.
        if (!/^\d+(?:[.,]\d+)?\s*(?:p|pt|punten|points?)?$/i.test(inner)) {
            cue = inner;
            text = text.slice(0, trailing.index).trim();
        }
    }

    return { text, cue, inlineOptions };
}

/** Writes a parsed prompt onto an item, so a continuation re-parses exactly like a first line. */
function assignPrompt(item: DraftItem, raw: string): void {
    const { text: withoutPoints, points } = pointsFromSuffix(raw);
    const extras = splitExtras(withoutPoints);
    item.text = extras.text;
    item.blanks = countBlanks(extras.text);
    delete item.cue;
    delete item.inlineOptions;
    if (points !== undefined) item.points = points;
    if (extras.cue) item.cue = extras.cue;
    if (extras.inlineOptions) item.inlineOptions = extras.inlineOptions;
}

function itemFromText(raw: string, sectionIndex: number, label: string): DraftItem {
    const ordinal = ITEM_START.exec(raw);
    const item: DraftItem = { label, sectionIndex, text: '', blanks: 0 };
    assignPrompt(item, ordinal ? raw.slice(ordinal[0].length) : raw);
    if (ordinal) item.number = ordinal[1];
    return item;
}

/** A table row laid out as "1 | She _____ tall. | 1" is an item too; only key tables are set aside. */
function itemsFromTable(table: DocumentTable, sectionIndex: number, sectionTitle: string): DraftItem[] {
    const items: DraftItem[] = [];
    for (const row of table.rows) {
        const cells = row.map((cell) => cell.text.trim());
        if (!cells.length || !BARE_NUMBER.test(cells[0])) continue;
        const text = cells.slice(1).find((cell) => cell && BARE_NUMBER.test(cell) === false);
        if (!text) continue;
        const item = itemFromText(`${cells[0]}. ${text}`, sectionIndex, `${sectionTitle} · ${cells[0]}`);
        const lastCell = cells[cells.length - 1];
        // A third column that is only a number is the points column in every item table there is.
        if (item.points === undefined && cells.length >= 3 && /^\d+(?:[.,]\d+)?$/.test(lastCell)) {
            item.points = toNumber(lastCell);
        }
        item.tableCells = cells;
        items.push(item);
    }
    return items;
}

/** Chooses the cover title: the largest line before the first heading that is not a form field. */
function pickTitle(paragraphs: DocumentParagraph[]): string | undefined {
    let best: { text: string; size: number } | undefined;
    for (const p of paragraphs.slice(0, 10)) {
        const text = p.text.trim();
        if (!text || text.length < 3 || text.length > 120) continue;
        if (FORM_FIELD.test(text) || BARE_NUMBER.test(text) || BULLET.test(text)) continue;
        const size = p.fontSizePt ?? 0;
        if (!best || size > best.size) best = { text, size };
    }
    return best?.text;
}

/**
 * Applies a section's stated total when its items carry no points: an assignment that says
 * "(7p in totaal)" over seven items is worth one point each, and that beats importing 52 points as
 * fifty-two ones. When the stated total and the printed markers disagree, the mismatch is reported
 * instead of silently choosing one — that check is what catches a shifted points column.
 */
function applyPoints(draft: TestDraft): void {
    const groups = new Map<number, DraftItem[]>();
    for (const item of draft.items) {
        const list = groups.get(item.sectionIndex) ?? [];
        list.push(item);
        groups.set(item.sectionIndex, list);
    }

    for (const [sectionIndex, items] of groups) {
        const section = sectionIndex >= 0 ? draft.sections[sectionIndex] : undefined;
        const title = section?.title ?? 'Imported test';
        const explicit = items.filter((item) => item.points !== undefined);
        const total = section?.pointsTotal;

        if (total !== undefined && explicit.length === items.length) {
            const sum = Math.round(explicit.reduce((acc, item) => acc + (item.points ?? 0), 0) * 100) / 100;
            if (Math.abs(sum - total) > 0.001) {
                draft.warnings.push({
                    key: 'importTest.warn_section_points_mismatch',
                    params: { section: title, stated: total, counted: sum },
                });
            }
            continue;
        }

        if (explicit.length === items.length) continue;

        if (total === undefined) {
            draft.warnings.push({ key: 'importTest.warn_points_unknown', params: { section: title } });
            continue;
        }

        const missing = items.length - explicit.length;
        const explicitSum = explicit.reduce((acc, item) => acc + (item.points ?? 0), 0);
        const share = missing > 0 ? Math.round(((total - explicitSum) / missing) * 100) / 100 : NaN;
        if (!Number.isFinite(share) || share <= 0) {
            draft.warnings.push({ key: 'importTest.warn_points_unknown', params: { section: title } });
            continue;
        }
        const even = Math.abs(share - Math.round(share * 10) / 10) < 0.001;
        if (!even) {
            draft.warnings.push({ key: 'importTest.warn_points_unknown', params: { section: title } });
            continue;
        }
        for (const item of items) if (item.points === undefined) item.points = share;
        draft.warnings.push({ key: 'importTest.warn_points_from_section_total', params: { section: title } });
    }
}

/**
 * Drops headings that never got an item under them and renumbers the rest.
 *
 * A cover line set in 18pt scores as a heading, and so does a "PART 1: GRAMMAR" band between two
 * assignments — neither is a section a teacher would recognise, and both would otherwise arrive as
 * empty sections with no questions.
 */
function pruneSectionsWithoutItems(draft: TestDraft): void {
    const keep = draft.sections.map((_, index) => draft.items.some((item) => item.sectionIndex === index));
    if (keep.every(Boolean)) return;

    const remap = new Map<number, number>();
    const sections: DraftSection[] = [];
    draft.sections.forEach((section, index) => {
        if (!keep[index]) return;
        remap.set(index, sections.length);
        sections.push(section);
    });
    for (const item of draft.items) {
        if (item.sectionIndex < 0) continue;
        item.sectionIndex = remap.get(item.sectionIndex) ?? -1;
    }
    draft.sections = sections;
}

/** True when a paragraph continues the item above it rather than starting something new. */
function looksLikeContinuation(previous: DraftItem, paragraph: DocumentParagraph): boolean {
    if (ENDS_SENTENCE.test(previous.text)) return false;
    const startsLower = /^[\p{Ll}]/u.test(paragraph.text);
    return startsLower || previous.blanks > 0 || !ENDS_SENTENCE.test(paragraph.text);
}

/**
 * Reads a document into a draft test. `fallbackName` is the file name, used for the title and for
 * warning labels when the document does not name itself.
 */
export function detectTestStructure(model: DocumentModel, fallbackName = ''): TestDraft {
    const paragraphs = model.blocks.filter((b): b is DocumentParagraph => b.kind === 'paragraph');
    const kept = withoutFurniture(paragraphs, model.pageCount);
    const bodySize = bodyFontSize(paragraphs);
    const firstHeading = paragraphs.findIndex((p) => isHeading(p, bodySize));
    const frontMatter = firstHeading === -1 ? paragraphs : paragraphs.slice(0, firstHeading);

    const draft: TestDraft = { sections: [], items: [], warnings: [], confidence: 'low' };
    const pickedTitle = pickTitle(frontMatter);
    /** A Word title is often styled as a heading, so it sits after the front matter rather than in it. */
    const leadHeading = pickedTitle ? undefined : paragraphs[firstHeading];
    const title = pickedTitle ?? (fallbackName || undefined);
    if (title) draft.title = title;

    let currentSection = -1;
    /** Ordinals Word renders but never writes: the numbered list supplies the number, we count it. */
    const listCounters = new Map<number, number>();

    const blocks: DocumentBlock[] = model.blocks;
    for (const block of blocks) {
        if (block.kind === 'table') {
            if (isKeyTable(block)) continue;
            const sectionTitle =
                currentSection >= 0 ? draft.sections[currentSection].title : (title ?? 'Imported test');
            const items = itemsFromTable(block, currentSection, sectionTitle);
            if (items.length === 0) continue;
            draft.items.push(...items);
            continue;
        }

        if (!kept.has(block) || !block.text) continue;

        if (isHeading(block, bodySize)) {
            draft.sections.push({
                title: block.text,
                page: block.page,
                ...(pointsInHeading(block.text) !== undefined ? { pointsTotal: pointsInHeading(block.text) } : {}),
            });
            currentSection = draft.sections.length - 1;
            continue;
        }

        const numbered = block.listFormat === 'numbered' && block.listLevel === 0;
        const ordinal = numbered ? null : ITEM_START.exec(block.text);
        if (ordinal || numbered) {
            const label = ordinal?.[1] ?? String((listCounters.get(currentSection) ?? 0) + 1);
            listCounters.set(currentSection, Number(label));
            // A warning names the section before the test: "Assignment 2 · 7" is findable on paper.
            const sectionTitle = currentSection >= 0 ? draft.sections[currentSection].title : undefined;
            const item = itemFromText(block.text, currentSection, `${sectionTitle ?? title ?? 'Item'} · ${label}`);
            if (numbered && !item.number) item.number = label;
            draft.items.push(item);
            continue;
        }

        const lastItem = draft.items[draft.items.length - 1];
        if (lastItem && lastItem.sectionIndex === currentSection && looksLikeContinuation(lastItem, block)) {
            // Re-parse the joined line: the points marker or the cue often sits on the wrapped half.
            assignPrompt(lastItem, `${lastItem.text} ${block.text}`);
            continue;
        }

        // Anything else under a heading is that section's instruction; on the cover it is front matter.
        if (currentSection >= 0) {
            const section = draft.sections[currentSection];
            section.instruction = section.instruction ? `${section.instruction} ${block.text}` : block.text;
        }
    }

    // The document's own name, when its title is a heading: a line above the first assignment with no
    // points, no items of its own and no "assignment" wording is the paper's title, not a section.
    if (
        leadHeading &&
        !SECTION_KEYWORD.test(leadHeading.text) &&
        !ANY_POINTS.test(leadHeading.text) &&
        draft.sections.length > 1 &&
        draft.sections[0]?.title === leadHeading.text
    ) {
        draft.title = leadHeading.text;
    }

    pruneSectionsWithoutItems(draft);

    // Items that never landed in a section are still importable — they just lose their grouping.
    if (draft.items.some((item) => item.sectionIndex < 0)) {
        draft.warnings.push({ key: 'importTest.warn_no_sections' });
    }

    applyPoints(draft);

    if (draft.items.length === 0) draft.warnings.push({ key: 'importTest.warn_no_items' });
    const everyItemHasPoints = draft.items.length > 0 && draft.items.every((item) => item.points !== undefined);
    draft.confidence =
        draft.items.length === 0 ? 'low' : everyItemHasPoints && draft.sections.length > 0 ? 'high' : 'medium';
    return draft;
}
