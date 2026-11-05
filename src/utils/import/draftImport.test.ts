import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DocumentReadError,
    type DocumentBlock,
    type DocumentModel,
    type DocumentParagraph,
    type DocumentTable,
} from './documentModel';
import { importTestDocument, testFromDraft } from './draftImport';
import { typeTestDraft } from './questionTypes';
import { detectTestStructure } from './testStructure';
import { applyAnswerKey, extractAnswerKey } from './answerKey';
import { parseTestFile } from '../testImport';

vi.mock('./extractBlocks', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./extractBlocks')>();
    return { ...actual, extractDocumentBlocks: vi.fn() };
});

const { extractDocumentBlocks } = await import('./extractBlocks');
const extractMock = vi.mocked(extractDocumentBlocks);

const p = (text: string, extra: Partial<DocumentParagraph> = {}): DocumentParagraph => ({
    kind: 'paragraph',
    page: 1,
    text,
    ...extra,
});

const table = (rows: string[][]): DocumentTable => ({
    kind: 'table',
    page: 1,
    rows: rows.map((cells) => cells.map((text) => ({ text }))),
});

const model = (blocks: DocumentBlock[], notes?: DocumentModel['notes']): DocumentModel => ({
    source: 'docx',
    pageCount: 1,
    blocks,
    ...(notes ? { notes } : {}),
});

/** A paper and its key as the reader hands them over: headings, numbered items, a key table. */
const paperAndKey = (): DocumentModel =>
    model([
        p('Vocabulary and grammar test', { fontSizePt: 24 }),
        p('Assignment 1 | TO BE (2p in totaal te behalen)', { headingLevel: 1 }),
        p('Lees de zinnen hieronder en vul de juiste vorm in.'),
        p('1. (+) She _____ tall. (1p)'),
        p('2. That book is not mine; it is _______. her/ hers (1p)'),
        p('3. Sneakers (1p)'),
        table([
            ['QUESTION', 'ANSWER', 'POINTS TO BE AWARDED'],
            ['1', 'is', '1'],
            ['2', 'hers', '1'],
            ['3', 'sportschoenen (sneakers niet goedkeuren als vertaling)', '1'],
        ]),
    ]);

const draftOf = (source: DocumentModel, fallbackName = 'paper') => {
    const draft = detectTestStructure(source, fallbackName);
    applyAnswerKey(draft, extractAnswerKey(source));
    return typeTestDraft(draft);
};

const docxFile = (name = 'Vocabulary test.docx') => new File([new Uint8Array([1, 2, 3])], name);

describe('testFromDraft', () => {
    it('turns a detected paper into an importable test', () => {
        const { test, review } = testFromDraft(draftOf(paperAndKey()), 'paper');

        expect(test.name).toBe('Vocabulary and grammar test');
        expect(test.requireSEB).toBe(false);
        expect(test.shuffleQuestions).toBe(false);
        expect(test.sections).toHaveLength(1);
        expect(test.sections?.[0].title).toBe('Assignment 1 | TO BE (2p in totaal te behalen)');
        expect(test.sections?.[0].content).toBe('<p>Lees de zinnen hieronder en vul de juiste vorm in.</p>');
        expect(test.questions.map((question) => question.type)).toEqual(['cloze', 'multiple-choice', 'short-answer']);
        expect(review.points).toBe(3);
        expect(review.types).toEqual({ cloze: 1, 'multiple-choice': 1, 'short-answer': 1 });
    });

    it('writes the cloze gaps and the key answers onto the stored question', () => {
        const { test } = testFromDraft(draftOf(paperAndKey()), 'paper');

        expect(test.questions[0].prompt).toBe('(+) She {{is}} tall.');
        expect(test.questions[0].expectedAnswers).toBeUndefined();
        expect(test.questions[2].expectedAnswers).toEqual(['sportschoenen']);
    });

    it('marks exactly the option the key named', () => {
        const { test } = testFromDraft(draftOf(paperAndKey()), 'paper');
        const choice = test.questions[1];

        expect(choice.options?.map((option) => option.text)).toEqual(['her', 'hers']);
        expect(choice.options?.map((option) => option.isCorrect)).toEqual([false, true]);
        expect(new Set(choice.options?.map((option) => option.id)).size).toBe(2);
    });

    it('gives every question and section a fresh id', () => {
        const first = testFromDraft(draftOf(paperAndKey()), 'paper').test;
        const second = testFromDraft(draftOf(paperAndKey()), 'paper').test;

        expect(first.questions[0].id).not.toBe(second.questions[0].id);
        expect(first.sections?.[0].id).not.toBe(second.sections?.[0].id);
        expect(new Set(first.questions.map((question) => question.id)).size).toBe(first.questions.length);
        expect(first.questions.every((question) => question.sectionId === first.sections?.[0].id)).toBe(true);
    });

    it('reports each section with its item count and points', () => {
        const { review } = testFromDraft(draftOf(paperAndKey()), 'paper');

        expect(review.sections).toEqual([
            { title: 'Assignment 1 | TO BE (2p in totaal te behalen)', items: 3, points: 3 },
        ]);
    });

    it('surfaces the key’s grading note, which has no field on a question to live in', () => {
        const { review } = testFromDraft(draftOf(paperAndKey()), 'paper');

        expect(review.notes).toEqual([
            {
                item: 'Assignment 1 | TO BE (2p in totaal te behalen) · 3',
                note: 'sneakers niet goedkeuren als vertaling',
            },
        ]);
    });

    it('falls back to the file name when the paper never names itself', () => {
        const source = model([
            p('Assignment 1 (1p in totaal te behalen)', { headingLevel: 1 }),
            p('1. She _____ tall. (1p)'),
        ]);
        const { test } = testFromDraft(draftOf(source, ''), 'Vocabulary test');

        expect(test.name).toBe('Vocabulary test');
    });

    it('keeps an item worth nothing at the paper’s default point', () => {
        const source = model([
            p('Assignment 1 (1p in totaal te behalen)', { headingLevel: 1 }),
            p('1. That book is not mine; it is _______. her/ hers'),
        ]);
        const { test } = testFromDraft(draftOf(source), 'paper');

        expect(test.questions[0].points).toBe(1);
    });
});

describe('importTestDocument', () => {
    beforeEach(() => {
        extractMock.mockReset();
    });

    it('reads a document into a test plus the review summary', async () => {
        extractMock.mockResolvedValue(model(paperAndKey().blocks, [{ key: 'pdf_no_text_layer' }]));

        const result = await importTestDocument(docxFile());

        expect(result.tests).toHaveLength(1);
        expect(result.review?.title).toBe('Vocabulary and grammar test');
        expect(result.review?.readNotes).toEqual([{ key: 'pdf_no_text_layer' }]);
        expect(result.warnings.filter((warning) => warning.key === 'importTest.warn_type_uncertain')).toHaveLength(0);
    });

    it('does not import an answer key on its own as an empty test', async () => {
        extractMock.mockResolvedValue(
            model([
                p('ANSWER KEY'),
                table([
                    ['QUESTION', 'ANSWER', 'POINTS TO BE AWARDED'],
                    ['1', 'is', '1'],
                ]),
            ])
        );

        const result = await importTestDocument(docxFile('key.docx'));

        expect(result.tests).toEqual([]);
        expect(result.review).toBeUndefined();
        expect(result.warnings).toContainEqual({ key: 'importTest.warn_no_items' });
    });

    it('explains a scan instead of importing nothing in silence', async () => {
        extractMock.mockRejectedValue(new DocumentReadError('no_text', 'paper.pdf'));

        const result = await importTestDocument(docxFile('paper.pdf'));

        expect(result.tests).toEqual([]);
        expect(result.review).toBeUndefined();
        expect(result.warnings).toEqual([{ key: 'importTest.warn_document_no_text' }]);
    });

    it('explains a file too large to read', async () => {
        extractMock.mockRejectedValue(new DocumentReadError('too_large', 'paper.pdf'));

        const result = await importTestDocument(docxFile('paper.pdf'));

        expect(result.warnings[0].key).toBe('importTest.warn_file_too_large');
        expect(result.warnings[0].params).toEqual({ sizeMb: '0.0', maxMb: 25 });
    });

    it('explains a package that will not open', async () => {
        extractMock.mockRejectedValue(new DocumentReadError('unreadable', 'not a zip'));

        const result = await importTestDocument(docxFile());

        expect(result.warnings).toEqual([{ key: 'importTest.warn_document_unreadable' }]);
    });

    it('lets an unexpected failure through rather than pretending the file was empty', async () => {
        extractMock.mockRejectedValue(new Error('boom'));

        await expect(importTestDocument(docxFile())).rejects.toThrow('boom');
    });

    it('is the path parseTestFile takes for a .docx', async () => {
        extractMock.mockResolvedValue(paperAndKey());

        const result = await parseTestFile(docxFile());

        expect(extractMock).toHaveBeenCalledTimes(1);
        expect(result.tests).toHaveLength(1);
        expect(result.review?.points).toBe(3);
    });
});
