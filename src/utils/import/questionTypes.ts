/**
 * questionTypes.ts
 * Turns a detected draft into questions RubricMaker can score: a type per item, a prompt with
 * `{{gap}}` markup where the paper printed a blank, and the key's answers on the field that type needs.
 *
 * A paper never states its own question types, so the type is inferred from the shape of the item:
 * a printed "her/ hers" pair is a choice, a blank inside a sentence is a gap, a bare prompt with a key
 * answer is a one-word answer, and a bare prompt without one is the teacher's to grade. The inference
 * decides how the question is scored, so anything that could reasonably go another way is flagged
 * instead of silently applied — the review step is where a teacher corrects it.
 */

import type { TestQuestion } from '../../types';
import type { ImportWarning } from '../questionBankImport';
import type { AnswerTolerance } from '../../../supabase/functions/_shared/testScoring.ts';
import { splitAlternatives } from './answerKey';
import { repairLigatures } from './sheetImport';
import { BLANK_RUN, type DraftItem, type TestDraft } from './testStructure';

/** Why an inferred type or its answers are a best guess. */
export type TypeUncertainty =
    /** No key answer reached this item, so "answer" and "grade this yourself" are indistinguishable. */
    | 'no_answer'
    /** A blank the key does not fill: the gap is real, its answer is missing. */
    | 'missing_gap_answer'
    /** The key split the answer into a different number of parts than the paper printed blanks. */
    | 'gap_count_mismatch'
    /** The key's answer matches none of the printed options, so which one is correct is unknown. */
    | 'option_answer_mismatch';

export interface TypedItem {
    /** As printed, for warnings: "Assignment 1 · 7". */
    label: string;
    sectionIndex: number;
    /** The ordinal as printed. */
    number?: string;
    type: TestQuestion['type'];
    /** The prompt as stored: cloze blanks become `{{...}}` gaps, a cue stays in parentheses. */
    prompt: string;
    points?: number;
    /** Blanks the paper printed. */
    blanks: number;
    /** Options printed as a "her/ hers" pair, in the paper's order. */
    options?: string[];
    /** Index into `options` of the answer the key gives, when it matches one. */
    correctOptionIndex?: number;
    /** Every accepted answer, for the types scored by matching a typed response. */
    expectedAnswers?: string[];
    /** For true-false items: what the key says the statement is worth. */
    correctBoolean?: boolean;
    answerTolerance?: AnswerTolerance;
    /** The key's grading note, e.g. that a near-synonym must not be accepted. */
    keyNote?: string;
    uncertain?: TypeUncertainty;
    /** Gaps the key left empty, so the review step can say how many need an answer. */
    emptyGaps: number;
}

export interface TypedDraft extends Omit<TestDraft, 'items'> {
    items: TypedItem[];
}

/** A key answer longer than this reads as prose, which exact matching cannot reasonably score. */
const PROSE_WORDS = 6;
/**
 * What a key writes in the answer column when it is explaining how to mark rather than giving an
 * answer: "1p voor het juist gebruiken van het woord…", "minimaal 5 woorden".
 */
const GRADING_INSTRUCTION =
    /(?:\b\d+\s*(?:p|pt|pnt|punten|points?)\b|\bpunt(?:en)?\s+voor\b|\bminimaal\b|\bmaximaal\b|\blet\s+op\b|\bniet\s+goedkeuren\b|\bword\s+limit\b)/i;
/** A prompt that opens with the blank asks for the first word of a sentence, which is capitalised. */
const OPENS_WITH_BLANK = /^\s*(?:_{2,}|\.{4,}|…{2,}|·{3,})/u;
const TRUE_WORDS = /^(true|waar|juist|correct)$/i;
const FALSE_WORDS = /^(false|onwaar|onjuist|incorrect|niet waar)$/i;
const APOSTROPHE = /[\p{L}]'[\p{L}]/u;
const INNER_PUNCTUATION = /[\p{L}][.,;:!?"()][\p{L}\s]|[\p{L}][.,;:!?"]\s*$/u;
/** Characters ignored when comparing a key answer with a printed option. */
const IGNORED = /[^\p{L}\p{N}]+/gu;

const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** Case-, quote- and punctuation-insensitive form, for matching an answer against an option. */
function comparable(text: string): string {
    return text.toLowerCase().replace(/[’‘`]/g, "'").replace(IGNORED, ' ').trim();
}

/** The cue the detector lifted off the end of the prompt is part of the question, so put it back. */
function withCue(text: string, cue: string | undefined): string {
    return cue ? `${text} (${cue})` : text;
}

/** Alternatives for one gap: the key may print "are not, aren't" for the single blank it fills. */
function gapAlternatives(raw: string | undefined): string[] {
    return raw ? splitAlternatives(raw) : [];
}

/**
 * One entry per blank the paper printed, in reading order. A key that splits its answer into one part
 * per blank ("do… have") is trusted; a single answer for a single blank may carry alternatives; a
 * single answer covering several blanks is split on whitespace only when the counts line up.
 */
function clozeGaps(item: DraftItem): { gaps: string[][]; mismatch: boolean } {
    const blanks = item.blanks;
    if (blanks === 0) return { gaps: [], mismatch: false };

    const parts = item.gapAnswers ?? [];
    if (parts.length === blanks) return { gaps: parts.map(gapAlternatives), mismatch: false };

    const answers = item.answers ?? [];
    if (blanks === 1) return { gaps: [answers.length > 0 ? answers : []], mismatch: false };

    if (parts.length === 0 && answers.length === 1 && words(answers[0]) === blanks) {
        return { gaps: answers[0].split(/\s+/).map((word) => [word]), mismatch: false };
    }
    // Anything else is a guess at which answer belongs to which blank, and a guess here would mark
    // every later gap in the item wrong.
    return { gaps: Array.from({ length: blanks }, () => []), mismatch: parts.length > 0 || answers.length > 0 };
}

/** Writes the gaps into the prompt, blank by blank, in the order the paper prints them. */
function fillGaps(text: string, gaps: string[][]): string {
    let index = 0;
    return text.replace(new RegExp(BLANK_RUN.source, 'gu'), () => {
        const alternatives = gaps[index] ?? [];
        index += 1;
        return `{{${alternatives.join('|')}}}`;
    });
}

function optionIndex(options: string[], answers: string[] | undefined): number | undefined {
    if (!answers || answers.length === 0) return undefined;
    const wanted = new Set(answers.map(comparable));
    const index = options.findIndex((option) => wanted.has(comparable(option)));
    return index === -1 ? undefined : index;
}

/** The leniencies a key's own wording calls for: an apostrophe or inner punctuation must not be fatal. */
function toleranceFor(answers: string[]): AnswerTolerance | undefined {
    const tolerance: AnswerTolerance = {};
    if (answers.some((answer) => APOSTROPHE.test(answer))) tolerance.contractions = true;
    if (answers.some((answer) => INNER_PUNCTUATION.test(answer))) tolerance.punctuation = true;
    const keys = Object.keys(tolerance);
    return keys.length > 0 ? tolerance : undefined;
}

/**
 * "she" in the key for "_______ is amazing at drawing." is the same answer as "She"; a key is typed
 * in lower case, but a sentence's first word is not, so the imported prompt keeps the capital.
 */
function capitaliseAtSentenceStart(answers: string[], prompt: string): string[] {
    if (!OPENS_WITH_BLANK.test(prompt)) return answers;
    return answers.map((answer) => (answer ? answer[0].toUpperCase() + answer.slice(1) : answer));
}

function booleanAnswer(answers: string[]): boolean | undefined {
    const found = new Set(answers.map((answer) => answer.trim()));
    if (found.size !== 1) return undefined;
    const [only] = [...found];
    if (TRUE_WORDS.test(only)) return true;
    if (FALSE_WORDS.test(only)) return false;
    return undefined;
}

/**
 * Infers one item's type and builds its prompt. The checks run in the order a paper prints its cues,
 * so a printed option pair wins over a blank in the same sentence (a choice can contain a blank).
 */
export function typeDraftItem(item: DraftItem): TypedItem {
    const prompt = withCue(item.text, item.cue);
    const base = {
        label: item.label,
        sectionIndex: item.sectionIndex,
        prompt,
        blanks: item.blanks,
        emptyGaps: 0,
        ...(item.number ? { number: item.number } : {}),
        ...(item.points !== undefined ? { points: item.points } : {}),
        ...(item.keyNote ? { keyNote: item.keyNote } : {}),
    };
    const answers = item.answers;

    // A printed "her/ hers" pair is a choice; the key only says which one, not that it is a choice.
    if (item.inlineOptions && item.inlineOptions.length >= 2) {
        const correct = optionIndex(item.inlineOptions, answers);
        return {
            ...base,
            type: 'multiple-choice',
            options: item.inlineOptions,
            ...(correct !== undefined ? { correctOptionIndex: correct } : { uncertain: 'option_answer_mismatch' }),
        };
    }

    if (item.blanks > 0) {
        // A trailing "(Anna)" naming the referent is how a paper prints "pick the right word", not a
        // gap to fill inside the sentence, so its single blank is answered rather than completed.
        if (item.cue && item.blanks === 1) {
            const expected = answers && answers.length > 0 ? capitaliseAtSentenceStart(answers, prompt) : undefined;
            return {
                ...base,
                type: 'short-answer',
                ...(expected ? { expectedAnswers: expected, ...toleranceField(expected) } : { uncertain: 'no_answer' }),
            };
        }
        const { gaps, mismatch } = clozeGaps(item);
        const emptyGaps = gaps.filter((alternatives) => alternatives.length === 0).length;
        return {
            ...base,
            type: 'cloze',
            prompt: fillGaps(prompt, gaps),
            emptyGaps,
            ...(mismatch
                ? { uncertain: 'gap_count_mismatch' }
                : emptyGaps > 0
                  ? { uncertain: 'missing_gap_answer' }
                  : {}),
        };
    }

    if (answers && answers.length > 0) {
        // "1p voor het juist gebruiken van het woord…" is the key telling the teacher how to mark,
        // not what to answer — it belongs on the item as a note, and the question stays open.
        if (answers.every((answer) => GRADING_INSTRUCTION.test(answer))) {
            return { ...base, type: 'open', keyNote: answers[0], uncertain: 'no_answer' };
        }
        const boolean = booleanAnswer(answers);
        if (boolean !== undefined) {
            return { ...base, type: 'true-false', correctBoolean: boolean };
        }
        if (answers.some((answer) => words(answer) > PROSE_WORDS)) {
            // A model sentence cannot be matched exactly; the teacher scores it, answer kept as a reference.
            return { ...base, type: 'open', expectedAnswers: answers };
        }
        return { ...base, type: 'short-answer', expectedAnswers: answers, ...toleranceField(answers) };
    }

    return { ...base, type: 'open', uncertain: 'no_answer' };
}

function toleranceField(answers: string[]): { answerTolerance?: AnswerTolerance } {
    const answerTolerance = toleranceFor(answers);
    return answerTolerance ? { answerTolerance } : {};
}

/**
 * Repairs the ligature damage a Word or PDF export can leave in the text ("beauWful" for "beautiful"),
 * on the reasoning that the defect is systematic: the same broken glyph is everywhere or nowhere, so
 * a document with fewer than a handful of hits is left alone rather than guessing at words.
 */
function repairDraftText(draft: TestDraft): { draft: TestDraft; warnings: ImportWarning[] } {
    const texts = [
        draft.title ?? '',
        ...draft.sections.flatMap((section) => [section.title, section.instruction ?? '']),
        ...draft.items.map((item) => item.text),
    ];
    const { texts: repaired, repaired: repairedAny } = repairLigatures(texts);
    if (!repairedAny) return { draft, warnings: [] };

    let cursor = 0;
    const title = repaired[cursor++];
    const sections = draft.sections.map((section) => {
        const repairedTitle = repaired[cursor++];
        const repairedInstruction = repaired[cursor++];
        return {
            ...section,
            title: repairedTitle,
            ...(section.instruction !== undefined ? { instruction: repairedInstruction } : {}),
        };
    });
    const items = draft.items.map((item) => ({ ...item, text: repaired[cursor++] }));

    return {
        draft: {
            ...draft,
            sections,
            items,
            ...(title ? { title } : {}),
        },
        warnings: [{ key: 'importTest.warn_ligatures' }],
    };
}

/** Types every item of a draft, repairing broken ligatures first so no broken word becomes a prompt. */
export function typeTestDraft(draft: TestDraft): TypedDraft {
    const { draft: text, warnings: repairWarnings } = repairDraftText(draft);
    const items = text.items.map(typeDraftItem);
    // The detector's own warnings (an inferred points total, a missing section) travel with the draft.
    const warnings = [...text.warnings, ...repairWarnings];

    for (const item of items) {
        if (!item.uncertain) continue;
        warnings.push({
            key: 'importTest.warn_type_uncertain',
            params: { item: item.label, type: item.type },
        });
        if (item.uncertain === 'gap_count_mismatch') {
            warnings.push({
                key: 'importTest.warn_gap_count_mismatch',
                params: { item: item.label, blanks: item.blanks, filled: item.blanks - item.emptyGaps },
            });
        }
    }

    return { ...text, items, warnings };
}
