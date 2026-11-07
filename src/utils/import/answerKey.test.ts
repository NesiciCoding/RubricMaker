import { describe, expect, it } from 'vitest';
import { applyAnswerKey, extractAnswerKey } from './answerKey';
import { detectTestStructure, type TestDraft } from './testStructure';
import type { DocumentBlock, DocumentModel, DocumentTable } from './documentModel';

const table = (rows: string[][], extra: Partial<DocumentTable> = {}): DocumentTable => ({
    kind: 'table',
    page: 1,
    rows: rows.map((cells) => cells.map((text) => ({ text }))),
    ...extra,
});

const model = (blocks: DocumentBlock[]): DocumentModel => ({ source: 'docx', pageCount: 1, blocks });

/** A key as it is actually exported: a title row inside the table, then a named header row. */
const keyModel = (): DocumentModel =>
    model([
        table([
            ['ASSIGNMENT 1 | TO BE (4p total)'],
            ['QUESTION', 'ANSWER', 'POINTS TO BE AWARDED'],
            ['1', 'is', '1'],
            ['2', "don't have, do not have", '1'],
            ['3', 'do… have', '1'],
            ['4', 'sportschoenen (sneakers niet goedkeuren als vertaling)', '1'],
        ]),
    ]);

describe('extractAnswerKey', () => {
    it('reads the title, the answers and the points out of a key table', () => {
        const key = extractAnswerKey(keyModel());

        expect(key.tables).toBe(1);
        expect(key.sections).toHaveLength(1);
        expect(key.sections[0].title).toBe('ASSIGNMENT 1 | TO BE (4p total)');
        expect(key.sections[0].pointsTotal).toBe(4);
        expect(key.sections[0].entries.map((entry) => entry.number)).toEqual(['1', '2', '3', '4']);
        expect(key.sections[0].entries.map((entry) => entry.points)).toEqual([1, 1, 1, 1]);
    });

    it('keeps alternatives and splits a multi-gap answer', () => {
        const [first, second, third] = extractAnswerKey(keyModel()).sections[0].entries;

        expect(first.answers).toEqual(['is']);
        expect(second.answers).toEqual(["don't have", 'do not have']);
        expect(third.gapAnswers).toEqual(['do', 'have']);
        expect(third.answers).toEqual(['do have']);
    });

    it('moves a grader’s instruction out of the answer', () => {
        const entry = extractAnswerKey(keyModel()).sections[0].entries[3];

        expect(entry.answers).toEqual(['sportschoenen']);
        expect(entry.note).toBe('sneakers niet goedkeuren als vertaling');
    });

    it('ignores tables that never name an answer column', () => {
        const key = extractAnswerKey(
            model([
                table([
                    ['Niveau', 'IO', 'B', 'E'],
                    ['Mavo', '<34', '34', '39'],
                ]),
            ])
        );

        expect(key.sections).toEqual([]);
        expect(key.tables).toBe(0);
    });

    it('takes the block title from a heading above the table when the table has none', () => {
        const key = extractAnswerKey(
            model([
                { kind: 'paragraph', page: 1, text: 'Assignment 2 | TO HAVE (3p total)' },
                table([
                    ['QUESTION', 'ANSWER', 'POINTS'],
                    ['1', 'has', '1'],
                ]),
            ])
        );

        expect(key.sections[0].title).toBe('Assignment 2 | TO HAVE (3p total)');
        expect(key.sections[0].pointsTotal).toBe(3);
    });
});

describe('applyAnswerKey', () => {
    const paper: DocumentModel = model([
        { kind: 'paragraph', page: 1, text: 'Vocabulary test', fontSizePt: 20 },
        { kind: 'paragraph', page: 1, text: 'Assignment 1', headingLevel: 2 },
        { kind: 'paragraph', page: 1, text: '1. She _____ tall.' },
        { kind: 'paragraph', page: 1, text: '2. They _____ busy.' },
        { kind: 'paragraph', page: 1, text: '3. _____ you _____ a sister?' },
    ]);

    const withDraft = (blocks: DocumentBlock[]): TestDraft => detectTestStructure(model(blocks));

    it('fills answers, gaps and points onto the matching items', () => {
        const draft = withDraft([
            { kind: 'paragraph', page: 1, text: 'Vocabulary test', fontSizePt: 20 },
            { kind: 'paragraph', page: 1, text: 'Assignment 1', headingLevel: 2 },
            { kind: 'paragraph', page: 1, text: '1. She _____ tall.' },
            { kind: 'paragraph', page: 1, text: '2. They _____ busy.' },
            { kind: 'paragraph', page: 1, text: '3. _____ you _____ a sister?' },
        ]);
        const key = extractAnswerKey(
            model([
                table([
                    ['ANSWER KEY'],
                    ['QUESTION', 'ANSWER', 'POINTS'],
                    ['1', 'is', '1'],
                    ['2', 'are not', '1'],
                    ['3', 'do… have', '2'],
                ]),
            ])
        );

        const warnings = applyAnswerKey(draft, key);

        expect(draft.items.map((item) => item.answers)).toEqual([['is'], ['are not'], ['do have']]);
        expect(draft.items[2].gapAnswers).toEqual(['do', 'have']);
        expect(draft.items.map((item) => item.points)).toEqual([1, 1, 2]);
        expect(warnings).toEqual([]);
    });

    it('matches by item number even when the key lists them out of order', () => {
        const draft = withDraft([
            { kind: 'paragraph', page: 1, text: 'Assignment 1', headingLevel: 2 },
            { kind: 'paragraph', page: 1, text: '1. She _____ tall.' },
            { kind: 'paragraph', page: 1, text: '2. They _____ busy.' },
        ]);
        const key = extractAnswerKey(
            model([
                table([
                    ['QUESTION', 'ANSWER'],
                    ['2', 'are not'],
                    ['1', 'is'],
                ]),
            ])
        );

        applyAnswerKey(draft, key);

        expect(draft.items[0].answers).toEqual(['is']);
        expect(draft.items[1].answers).toEqual(['are not']);
    });

    it('reports a count mismatch instead of shifting every answer by one', () => {
        const draft = detectTestStructure(paper);
        const key = extractAnswerKey(
            model([
                table([
                    ['QUESTION', 'ANSWER'],
                    ['1', 'is'],
                ]),
            ])
        );

        const warnings = applyAnswerKey(draft, key);

        expect(warnings).toContainEqual({
            key: 'importTest.warn_key_section_mismatch',
            params: { section: 'Assignment 1', items: 3, answers: 1 },
        });
    });

    it('reports a key that disagrees with the points printed on the paper', () => {
        const draft = withDraft([
            { kind: 'paragraph', page: 1, text: 'Assignment 1', headingLevel: 2 },
            { kind: 'paragraph', page: 1, text: '1. She _____ tall. (2p)' },
        ]);
        const key = extractAnswerKey(
            model([
                table([
                    ['QUESTION', 'ANSWER', 'POINTS'],
                    ['1', 'is', '1'],
                ]),
            ])
        );

        const warnings = applyAnswerKey(draft, key);

        expect(draft.items[0].points).toBe(2);
        expect(warnings).toContainEqual({
            key: 'importTest.warn_key_points_mismatch',
            params: { item: 'Assignment 1 · 1', printed: 2, key: 1 },
        });
    });
});
