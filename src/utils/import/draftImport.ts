/**
 * draftImport.ts
 * The last step of a document import: a typed draft becomes an ImportedTest, and the reader explains
 * what it recognised while doing it.
 *
 * Everything before this module is detection — text, sections, items, answers, types. This is the one
 * place that knows what RubricMaker stores: fresh ids, points on every question, options with exactly
 * one of them marked, and section content as HTML. Keeping the conversion in one function is what lets
 * the review step show the same thing the import will really save.
 */

import { nanoid } from '../nanoid';
import { escapeHtml } from '../exportDataPrep';
import type { ImportedTest } from '../testImport';
import type { ImportWarning } from '../questionBankImport';
import type { TestQuestion, TestQuestionType, TestSection } from '../../types';
import type { DocumentModel, DocumentReadNote } from './documentModel';
import { DocumentReadError } from './documentModel';
import { DOCUMENT_IMPORT_MAX_BYTES, extractDocumentBlocks } from './extractBlocks';
import { applyAnswerKey, extractAnswerKey } from './answerKey';
import { detectTestStructure } from './testStructure';
import { typeTestDraft, type TypedDraft, type TypedItem } from './questionTypes';

/** What one section of a detected document holds, for the review step. */
export interface DocumentReviewSection {
    title: string;
    items: number;
    points: number;
}

/** A key cell that explains the marking rather than answering; RubricMaker has nowhere to store it. */
export interface DocumentReviewNote {
    item: string;
    note: string;
}

/** What the reader recognised, shown before the teacher confirms the import. */
export interface DocumentReview {
    title: string;
    /** How sure the detector is that this is a paper: `low` means it found items but little else. */
    confidence: TypedDraft['confidence'];
    sections: DocumentReviewSection[];
    /** Questions per inferred type — the part a teacher is most likely to want to check. */
    types: Partial<Record<TestQuestionType, number>>;
    points: number;
    notes: DocumentReviewNote[];
    /** Caveats the reader hit while opening the file (\"this PDF has no text layer\"). */
    readNotes: DocumentReadNote[];
}

/** What one document import yields: a test to add, or the warnings explaining why there is none. */
export interface DocumentTestImport {
    tests: ImportedTest[];
    review?: DocumentReview;
    warnings: ImportWarning[];
}

/** A question with no points marker is still worth something; one is the paper's own default. */
const DEFAULT_POINTS = 1;

function questionFromItem(item: TypedItem, sectionId: string | undefined): TestQuestion {
    const question: TestQuestion = {
        id: nanoid(),
        prompt: item.prompt,
        type: item.type,
        points: item.points ?? DEFAULT_POINTS,
        ...(sectionId ? { sectionId } : {}),
    };

    if (item.options && item.options.length > 0) {
        question.options = item.options.map((text, index) => ({
            id: nanoid(),
            text,
            // A key that named none of the printed options leaves every option unmarked, which the
            // test's own issue check reports rather than this importer inventing a correct answer.
            isCorrect: index === item.correctOptionIndex,
        }));
    }
    if (item.expectedAnswers && item.expectedAnswers.length > 0) question.expectedAnswers = item.expectedAnswers;
    if (item.correctBoolean !== undefined) question.correctBoolean = item.correctBoolean;
    if (item.answerTolerance) question.answerTolerance = item.answerTolerance;
    return question;
}

/** Section instructions are printed text, so they are escaped into the one paragraph they belong in. */
function sectionFromDraft(section: TypedDraft['sections'][number]): TestSection {
    return {
        id: nanoid(),
        title: section.title,
        ...(section.instruction ? { content: `<p>${escapeHtml(section.instruction)}</p>` } : {}),
    };
}

/**
 * Builds the test, the review summary and the key notes that cannot be stored. Items that landed outside
 * any section are kept — they are still questions a teacher can move — and simply carry no sectionId.
 */
export interface DraftConversion {
    test: ImportedTest;
    review: DocumentReview;
}

export function testFromDraft(
    draft: TypedDraft,
    fallbackName = '',
    readNotes: DocumentReadNote[] = []
): DraftConversion {
    const name = draft.title || fallbackName || 'Imported test';
    const sections = draft.sections.map(sectionFromDraft);
    const sectionIds = sections.map((section) => section.id);

    const questions = draft.items.map((item) => questionFromItem(item, sectionIds[item.sectionIndex] ?? undefined));

    const test: ImportedTest = {
        name,
        requireSEB: false,
        shuffleQuestions: false,
        questions,
        ...(sections.length > 0 ? { sections } : {}),
    };

    const types: Partial<Record<TestQuestionType, number>> = {};
    for (const item of draft.items) types[item.type] = (types[item.type] ?? 0) + 1;

    const review: DocumentReview = {
        title: name,
        confidence: draft.confidence,
        sections: draft.sections.map((section, index) => {
            const items = draft.items.filter((item) => item.sectionIndex === index);
            return {
                title: section.title,
                items: items.length,
                points: items.reduce((sum, item) => sum + (item.points ?? DEFAULT_POINTS), 0),
            };
        }),
        types,
        points: questions.reduce((sum, question) => sum + question.points, 0),
        notes: draft.items.flatMap((item) => (item.keyNote ? [{ item: item.label, note: item.keyNote }] : [])),
        readNotes,
    };

    return { test, review };
}

/** Turns a reader failure into the warning the import dialog shows, with what the teacher can act on. */
function readFailureWarning(file: File, error: DocumentReadError): ImportWarning {
    switch (error.reason) {
        case 'too_large':
            return {
                key: 'importTest.warn_file_too_large',
                params: {
                    sizeMb: (file.size / 1024 / 1024).toFixed(1),
                    maxMb: DOCUMENT_IMPORT_MAX_BYTES / 1024 / 1024,
                },
            };
        case 'unsupported':
            return { key: 'importTest.warn_unsupported_file_type', params: { ext: extensionOf(file.name) } };
        case 'no_text':
            return { key: 'importTest.warn_document_no_text' };
        case 'unreadable':
        default:
            return { key: 'importTest.warn_document_unreadable' };
    }
}

function extensionOf(name: string): string {
    return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

/**
 * Reads a .docx or .pdf all the way to an importable test. A file that cannot be read comes back as a
 * warning rather than an exception: every failure here is something the dialog explains.
 */
export async function importTestDocument(file: File): Promise<DocumentTestImport> {
    let model: DocumentModel;
    try {
        model = await extractDocumentBlocks(file);
    } catch (err) {
        if (err instanceof DocumentReadError) return { tests: [], warnings: [readFailureWarning(file, err)] };
        throw err;
    }

    const fallbackName = file.name.replace(/\.[^.]+$/, '');
    const draft = detectTestStructure(model, fallbackName);
    // The key is read from the same file: a teacher's key usually sits below the paper, and a document
    // with no key tables simply pairs nothing.
    const keyWarnings = applyAnswerKey(draft, extractAnswerKey(model));
    const typed = typeTestDraft(draft);
    // A file with no items is a key on its own (or a scan of one): importing it would add an empty
    // test to the workspace, so the warnings that say why are the whole result.
    if (typed.items.length === 0) return { tests: [], warnings: [...typed.warnings, ...keyWarnings] };
    const { test, review } = testFromDraft(typed, fallbackName, model.notes ?? []);

    return { tests: [test], review, warnings: [...typed.warnings, ...keyWarnings] };
}
