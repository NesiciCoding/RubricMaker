/**
 * Format-agnostic content/geometry helpers shared by the HTML/PDF and DOCX exam-document
 * exporters (booklet, attachment, answer sheet, grading sheet). Kept separate from rendering so
 * a future scan-ingestion step can consume `answerSheetGeometry`/`fiducialMarkers` directly
 * instead of reverse-engineering positions from a rendered PDF.
 */
import type { Test, TestQuestion, TestSection } from '../types';
import { renderClozeSegments, parseHotTextFragments } from './clozeParse';
import { stripHtmlTags } from './exportDataPrep';
import { seededShuffle } from './seededShuffle';
import type { DocxStyleTemplateOverrides } from './docxExport';

export interface NumberedQuestion {
    question: TestQuestion;
    /** 1-based, continuous across the whole test — matches CITO's running question numbering. */
    number: number;
}

export interface ExamSectionGroup {
    /** null = questions with no section (or a stale/removed sectionId), grouped last. */
    section: TestSection | null;
    questions: NumberedQuestion[];
}

/** Groups a test's questions by section in section-declaration order, numbering continuously — the CITO "Tekst 1 / Tekst 2" layout. */
export function groupQuestionsBySection(test: Test): ExamSectionGroup[] {
    const sections = test.sections ?? [];
    const groups: ExamSectionGroup[] = [];
    let counter = 0;
    const numbered = (questions: TestQuestion[]): NumberedQuestion[] =>
        questions.map((question) => ({ question, number: ++counter }));

    for (const section of sections) {
        groups.push({ section, questions: numbered(test.questions.filter((q) => q.sectionId === section.id)) });
    }
    const sectionIds = new Set(sections.map((s) => s.id));
    const ungrouped = test.questions.filter((q) => !q.sectionId || !sectionIds.has(q.sectionId));
    if (ungrouped.length > 0) groups.push({ section: null, questions: numbered(ungrouped) });
    return groups;
}

/** CITO-style margin label, e.g. "3p" for a 3-point question. */
export function pointLabel(points: number): string {
    return `${points}p`;
}

export function optionLetter(index: number): string {
    return String.fromCharCode(65 + index);
}

/** Number of independently-gradable sub-items in a multi-part question, or null when the type has none (single-shot scoring). */
export function subItemCount(question: TestQuestion): number | null {
    switch (question.type) {
        case 'matching':
            return question.matchingPairs?.length || null;
        case 'ordering':
            return question.orderItems?.length || null;
        case 'categorize':
            return question.categorizeItems?.length || null;
        case 'cloze':
        case 'cloze-dropdown':
            return renderClozeSegments(question.prompt).filter((s) => s.type === 'gap').length || null;
        case 'hot-text':
            return question.hotTextCorrectIndices?.length || null;
        default:
            return null;
    }
}

export interface PartialCreditRow {
    /** Number of sub-items correct. */
    correct: number;
    points: number;
}

/**
 * Best-effort partial-credit ladder for multi-part questions, derived as `maxPoints - misses`
 * (floored at 0), shown for correct counts from all-correct down to a bare majority — the same
 * shape as CITO's own "indien X goed -> Y punten" tables. This is a heuristic, not a stored
 * answer-key ladder (RubricMaker only models a `partialCredit` boolean, not per-step scores), so
 * it may not match a hand-authored CITO ladder exactly.
 */
export function partialCreditLadder(question: TestQuestion): PartialCreditRow[] | null {
    if (question.partialCredit === false) return null;
    const n = subItemCount(question);
    if (!n || n <= 1 || question.points <= 1) return null;
    const half = Math.ceil(n / 2);
    const ladder: PartialCreditRow[] = [];
    for (let correct = n; correct >= half; correct--) {
        ladder.push({ correct, points: Math.max(0, question.points - (n - correct)) });
    }
    return ladder;
}

/** Plain, unmarked reading of a hot-text passage (fragment brackets stripped) — used as the booklet fallback quote. */
export function hotTextFallbackText(question: TestQuestion): string {
    return parseHotTextFragments(stripHtmlTags(question.hotTextPassage ?? ''))
        .map((s) => s.text)
        .join('');
}

export interface HotTextMirrorPart {
    text: string;
    /** Present for a selectable fragment; its 1-based display number (matches hotTextCorrectIndices + 1). */
    number?: number;
}

/** Passage broken into text/fragment parts with each fragment's display number, for the "mirror the selectable text" booklet mode. */
export function hotTextMirrorParts(question: TestQuestion): HotTextMirrorPart[] {
    return parseHotTextFragments(stripHtmlTags(question.hotTextPassage ?? '')).map((s) =>
        s.type === 'fragment' ? { text: s.text, number: s.index + 1 } : { text: s.text }
    );
}

export interface ClozeBlankPart {
    text: string;
    /** Present for a gap (never its answer text — the booklet must not leak it); 1-based, matches the gap's index in subItemCount()/the grading ladder. */
    blankNumber?: number;
}

/** Cloze/cloze-dropdown prompt broken into text/blank parts, blanks left empty (never the model answer) for booklet printing. */
export function clozeBookletParts(question: TestQuestion): ClozeBlankPart[] {
    return renderClozeSegments(question.prompt).map((s) =>
        s.type === 'gap' ? { text: '', blankNumber: s.gap.index + 1 } : { text: s.text }
    );
}

export interface MatchingBookletData {
    /** Left-hand terms, in their stored (numbered) order. */
    left: string[];
    /** Right-hand descriptions as a lettered word bank, shuffled so column position doesn't reveal the pairing. */
    rightOptions: { letter: string; text: string }[];
}

/** Matching question split into a numbered left column and a shuffled, lettered right-hand word bank — printing pairs in stored order would trivially leak the answer via row position. */
export function matchingBookletData(question: TestQuestion): MatchingBookletData {
    const pairs = question.matchingPairs ?? [];
    const shuffledRight = seededShuffle(pairs, `${question.id}:right`);
    return {
        left: pairs.map((p) => p.left),
        rightOptions: shuffledRight.map((p, i) => ({ letter: optionLetter(i), text: p.right })),
    };
}

/** Ordering items shuffled for booklet display — the stored array order IS the correct order, so printing it as-is would leak the answer. */
export function orderingBookletItems(question: TestQuestion): { letter: string; text: string }[] {
    const items = seededShuffle(question.orderItems ?? [], question.id);
    return items.map((item, i) => ({ letter: optionLetter(i), text: item.text }));
}

export interface CategorizeBookletData {
    items: string[];
    categories: string[];
}

/** Categorize items + the category labels to sort them into — item order carries no answer information (each item's correct bucket is independent), so no shuffling is needed. */
export function categorizeBookletData(question: TestQuestion): CategorizeBookletData {
    return {
        items: (question.categorizeItems ?? []).map((i) => i.text),
        categories: (question.categories ?? []).map((c) => c.label),
    };
}

/** How a question's answer space should be laid out on the answer sheet. */
export type AnswerSpaceKind = 'choice' | 'short' | 'long' | 'numeric' | 'subitems' | 'none';

export interface AnswerSpaceSpec {
    kind: AnswerSpaceKind;
    /** For 'choice': one entry per selectable option (A, B, C, ...). */
    optionLetters?: string[];
    /** For 'choice': true when more than one option may be correct (multiple-response) — rendered as squares instead of circles. */
    multiSelect?: boolean;
    /** For 'subitems': how many independently-answered sub-lines to draw (matches subItemCount()). */
    subItemCount?: number;
}

/**
 * Maps a question type to how much/what kind of writing space it needs on the answer sheet:
 * empty bubbles for choice questions, two lines for a short answer, a half-page box for a long
 * open answer, a single short line for a number, and one numbered sub-line per gradable part for
 * multi-part types (cloze, matching, ordering, categorize, hot-text) — mirroring how CITO
 * sub-numbers answer rows for exactly these question shapes.
 */
export function answerSpaceFor(question: TestQuestion): AnswerSpaceSpec {
    switch (question.type) {
        case 'multiple-choice':
            return { kind: 'choice', optionLetters: (question.options ?? []).map((_, i) => optionLetter(i)) };
        case 'multiple-response':
            return {
                kind: 'choice',
                optionLetters: (question.options ?? []).map((_, i) => optionLetter(i)),
                multiSelect: true,
            };
        case 'true-false':
            return { kind: 'choice', optionLetters: ['A', 'B'] };
        case 'short-answer':
            return { kind: 'short' };
        case 'open':
            return { kind: 'long' };
        case 'numeric':
            return { kind: 'numeric' };
        case 'cloze':
        case 'cloze-dropdown':
        case 'matching':
        case 'ordering':
        case 'categorize':
        case 'hot-text':
            return { kind: 'subitems', subItemCount: subItemCount(question) ?? 1 };
        case 'audio-response':
            return { kind: 'none' };
        default:
            return { kind: 'short' };
    }
}

/** Options shared by every exam document builder/renderer. */
export interface TestExamExportOptions {
    /** Base export font — mirrors RubricFormat.fontFamily / rubric export's font pipeline. */
    fontFamily?: string;
    fontSize?: number;
    styleTemplate?: DocxStyleTemplateOverrides;
    /** Whether the attachment (reading passages) is its own document or appended inline in the booklet. */
    attachmentMode: 'inline' | 'separate';
    /** Hot-text questions: mirror the full selectable passage with numbered fragments, vs. a plain quoted excerpt. */
    hotTextMirror: boolean;
    /** Fiducial markers + a per-page QR header on answer sheets, for a future scan-ingestion pipeline. Off by default. */
    scanMarkers: boolean;
}

export const DEFAULT_EXAM_EXPORT_OPTIONS: TestExamExportOptions = {
    attachmentMode: 'separate',
    hotTextMirror: false,
    scanMarkers: false,
};

// --- Answer-sheet geometry -------------------------------------------------
// Millimetre coordinates on an A4 page, origin at the top-left. Centralized here so a future
// OCR/ingestion step can read the exact same geometry the renderer used, instead of guessing.

export const EXAM_PAGE_MM = { width: 210, height: 297, margin: 10 };

export interface FiducialMarker {
    corner: 'top-left' | 'top-right' | 'bottom-left';
    x: number;
    y: number;
    size: number;
}

/** Three corner registration squares (top-left, top-right, bottom-left) for deskew/perspective correction of a scanned sheet. */
export function fiducialMarkers(): FiducialMarker[] {
    const size = 8;
    const inset = 6;
    const { width, height } = EXAM_PAGE_MM;
    return [
        { corner: 'top-left', x: inset, y: inset, size },
        { corner: 'top-right', x: width - inset - size, y: inset, size },
        { corner: 'bottom-left', x: inset, y: height - inset - size, size },
    ];
}

export interface AnswerBlockGeometry {
    questionId: string;
    number: number;
    space: AnswerSpaceSpec;
    x: number;
    y: number;
    width: number;
    /** Estimated block height in mm, from ANSWER_SPACE_HEIGHT_MM — a content-flow hint, not a page-break-aware final coordinate (a 'long' block's actual printed height depends on where the page breaks). */
    height: number;
}

const ANSWER_SHEET_HEADER_HEIGHT_MM = 40;

/** Height of the ruled writing box for a 'long' (open-answer) question, in mm — shared by both renderers so the HTML box and the DOCX lined table stay the same size. */
export const LONG_ANSWER_HEIGHT_MM = 130;
/** Spacing between ruled lines inside a 'long' answer box and between numbered 'subitems' lines, in mm — shared by both renderers. */
export const ANSWER_LINE_SPACING_MM = 7;
/** Fixed physical width of every MC/choice bubble cell, in mm — constant regardless of how many options a question has, so a scanning pipeline can assume one cell width across the whole answer sheet instead of a table-relative one that shrinks as option count grows. */
export const CHOICE_CELL_WIDTH_MM = 11;

/** Estimated mm height per AnswerSpaceKind, used only to compute the running `y` flow hint below. */
const ANSWER_SPACE_HEIGHT_MM: Record<AnswerSpaceKind, number> = {
    choice: 12,
    short: 18,
    long: LONG_ANSWER_HEIGHT_MM,
    numeric: 12,
    subitems: 8,
    none: 8,
};

function blockHeightMm(space: AnswerSpaceSpec): number {
    if (space.kind === 'subitems') return 6 + (space.subItemCount ?? 1) * ANSWER_SPACE_HEIGHT_MM.subitems;
    return ANSWER_SPACE_HEIGHT_MM[space.kind];
}

/**
 * Content-aware, per-question layout of the answer sheet: each question gets an AnswerSpaceSpec
 * (empty bubbles, short lines, a half-page box, ...) plus an approximate mm position/height. The
 * `y` values assume a simple single-column top-to-bottom flow and do NOT simulate page breaks, so
 * they're a structural hint for a future OCR pass (roughly where things are, in question order)
 * rather than exact final print coordinates.
 */
export function answerSheetGeometry(test: Test): AnswerBlockGeometry[] {
    const { margin, width } = EXAM_PAGE_MM;
    const blocks: AnswerBlockGeometry[] = [];
    let y = ANSWER_SHEET_HEADER_HEIGHT_MM;
    for (const group of groupQuestionsBySection(test)) {
        for (const { question, number } of group.questions) {
            const space = answerSpaceFor(question);
            const height = blockHeightMm(space);
            blocks.push({ questionId: question.id, number, space, x: margin, y, width: width - margin * 2, height });
            y += height;
        }
    }
    return blocks;
}

export interface AnswerSheetQrPayload {
    testId: string;
    studentId?: string;
    sheetType: 'answer';
    pageIndex: number;
}

/** JSON payload encoded into an answer sheet's per-page QR marker, for a future scan-ingestion step to identify the sheet. */
export function answerSheetQrPayload(testId: string, pageIndex: number, studentId?: string): string {
    const payload: AnswerSheetQrPayload = { testId, studentId, sheetType: 'answer', pageIndex };
    return JSON.stringify(payload);
}
