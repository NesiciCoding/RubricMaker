import { describe, expect, it } from 'vitest';
import { detectTestStructure, headingScore } from './testStructure';
import type { DocumentBlock, DocumentModel, DocumentParagraph, DocumentTable } from './documentModel';

const p = (text: string, extra: Partial<DocumentParagraph> = {}): DocumentParagraph => ({
    kind: 'paragraph',
    page: 1,
    text,
    ...extra,
});

const table = (rows: string[][], extra: Partial<DocumentTable> = {}): DocumentTable => ({
    kind: 'table',
    page: 1,
    rows: rows.map((cells) => cells.map((text) => ({ text }))),
    ...extra,
});

const pdf = (blocks: DocumentBlock[], pageCount = 1): DocumentModel => ({ source: 'pdf', pageCount, blocks });
const docx = (blocks: DocumentBlock[]): DocumentModel => ({ source: 'docx', pageCount: 1, blocks });

/** A digital paper as pdf.js hands it over: flat lines, bigger headings, "(1p)" markers. */
const flatPaper = (pageCount = 3): DocumentModel =>
    pdf(
        [
            p('Vocabulary and grammar test', { fontSizePt: 24 }),
            p('PART 1: GRAMMAR', { fontSizePt: 18, page: 2 }),
            p('Assignment 1 | TO BE (2p in totaal te behalen)', { fontSizePt: 13, page: 2 }),
            p('Lees de zinnen hieronder en vul de juiste vorm van to be in.', { fontSizePt: 12, page: 2 }),
            p('1. (+) She _____ tall. (1p)', { fontSizePt: 12, page: 2, x: 89 }),
            p('2. (-) They __________ busy. (1p)', { fontSizePt: 12, page: 2, x: 89 }),
            p('Assignment 2 | TO HAVE (2p in totaal te behalen)', { fontSizePt: 13, page: 3 }),
            p('1. (?) _____ you _____ a sister? (1p)', { fontSizePt: 12, page: 3, x: 89 }),
            p('2. That book is not mine; it is _______. her/ hers (1p)', { fontSizePt: 12, page: 3, x: 89 }),
        ],
        pageCount
    );

describe('detectTestStructure — flat pdf layout', () => {
    it('finds the title, every heading and every item', () => {
        const draft = detectTestStructure(flatPaper());

        expect(draft.title).toBe('Vocabulary and grammar test');
        // "PART 1: GRAMMAR" is a band between assignments, not a section: it holds no items.
        expect(draft.sections.map((s) => s.title)).toEqual([
            'Assignment 1 | TO BE (2p in totaal te behalen)',
            'Assignment 2 | TO HAVE (2p in totaal te behalen)',
        ]);
        expect(draft.items.map((i) => i.text)).toEqual([
            '(+) She _____ tall.',
            '(-) They __________ busy.',
            '(?) _____ you _____ a sister?',
            'That book is not mine; it is _______.',
        ]);
        expect(draft.items.map((i) => i.points)).toEqual([1, 1, 1, 1]);
        expect(draft.items.map((i) => i.sectionIndex)).toEqual([0, 0, 1, 1]);
        expect(draft.confidence).toBe('high');
        expect(draft.warnings).toEqual([]);
    });

    it('keeps the instruction with its section and the ordinal with its label', () => {
        const draft = detectTestStructure(flatPaper());

        expect(draft.sections[0].instruction).toBe('Lees de zinnen hieronder en vul de juiste vorm van to be in.');
        expect(draft.items[0].number).toBe('1');
        expect(draft.items[0].label).toBe('Assignment 1 | TO BE (2p in totaal te behalen) · 1');
    });

    it('counts blank runs and splits off a printed option pair', () => {
        const draft = detectTestStructure(flatPaper());

        expect(draft.items.map((i) => i.blanks)).toEqual([1, 1, 2, 1]);
        expect(draft.items[3].inlineOptions).toEqual(['her', 'hers']);
    });

    it('reads a three-way printed choice as three options, not the last pair of them', () => {
        const model = pdf([
            p('Vocabulary and grammar test', { fontSizePt: 24 }),
            p('Assignment 5 | A, AN, THE (6p in totaal te behalen)', { fontSizePt: 13 }),
            p('1. _______ school I go to is called Academie Tien.  a/an/the (1p)', { fontSizePt: 12 }),
        ]);
        const draft = detectTestStructure(model);

        expect(draft.items[0].inlineOptions).toEqual(['a', 'an', 'the']);
        expect(draft.items[0].text).toBe('_______ school I go to is called Academie Tien.');
    });

    it('leaves a plain slash in the prompt alone', () => {
        const model = pdf([
            p('Vocabulary and grammar test', { fontSizePt: 24 }),
            p('Assignment 1 | READING (1p in totaal te behalen)', { fontSizePt: 13 }),
            p('1. Read the text and answer the question in one or two sentences. (1p)', { fontSizePt: 12 }),
        ]);
        const draft = detectTestStructure(model);

        expect(draft.items[0].inlineOptions).toBeUndefined();
        expect(draft.items[0].text).toBe('Read the text and answer the question in one or two sentences.');
    });
});

describe('detectTestStructure — the paper’s own name', () => {
    const headedPaper = (firstHeading: string): DocumentModel =>
        docx([
            p(firstHeading, { headingLevel: 1, style: 'heading 1' }),
            p('Assignment 1 | TO BE (1p in totaal te behalen)', { headingLevel: 1, style: 'heading 1' }),
            p('1. She _____ tall. (1p)'),
            p('Assignment 2 | TO HAVE (1p in totaal te behalen)', { headingLevel: 1, style: 'heading 1' }),
            p('1. They _____ busy. (1p)'),
        ]);

    it('takes the title from a heading the Word file styled as one', () => {
        const draft = detectTestStructure(headedPaper('Vocabulary and grammar test'), 'Vocabulary Y1');

        expect(draft.title).toBe('Vocabulary and grammar test');
        // The title is not a section: it holds no items.
        expect(draft.sections.map((s) => s.title)).toEqual([
            'Assignment 1 | TO BE (1p in totaal te behalen)',
            'Assignment 2 | TO HAVE (1p in totaal te behalen)',
        ]);
    });

    it('keeps the file name when the first heading is an assignment', () => {
        const draft = detectTestStructure(
            headedPaper('Assignment 1 | TO BE (1p in totaal te behalen)'),
            'Vocabulary Y1'
        );

        expect(draft.title).toBe('Vocabulary Y1');
    });

    it('does not mistake a points band or a part heading for the title', () => {
        const points = detectTestStructure(headedPaper('Grammar (6p in totaal te behalen)'), 'Vocabulary Y1');
        expect(points.title).toBe('Vocabulary Y1');

        const part = detectTestStructure(headedPaper('PART 1: GRAMMAR'), 'Vocabulary Y1');
        expect(part.title).toBe('Vocabulary Y1');
    });
});

describe('detectTestStructure — word layout', () => {
    it('uses Word headings and numbered lists, which never print their ordinals', () => {
        const model = docx([
            p('Y1 vocabulary and grammar', { fontSizePt: 20 }),
            p('Assignment 1 — to be (3p in totaal te behalen)', { headingLevel: 2, style: 'heading 2' }),
            p('Vul de juiste vorm in.', { listFormat: 'bullet', listLevel: 0 }),
            p('She _____ tall.', { listFormat: 'numbered', listLevel: 0 }),
            p('They _____ busy.', { listFormat: 'numbered', listLevel: 0 }),
            p('Assignment 2 — to have (1p in totaal te behalen)', { headingLevel: 2, style: 'heading 2' }),
            p('_____ you _____ a sister?', { listFormat: 'numbered', listLevel: 0 }),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.sections).toHaveLength(2);
        expect(draft.items.map((i) => i.text)).toEqual([
            'She _____ tall.',
            'They _____ busy.',
            '_____ you _____ a sister?',
        ]);
        expect(draft.items.map((i) => i.number)).toEqual(['1', '2', '1']);
        expect(draft.sections[0].instruction).toBe('Vul de juiste vorm in.');
        expect(draft.items.map((i) => i.points)).toEqual([1.5, 1.5, 1]);
        expect(draft.warnings).toEqual([
            {
                key: 'importTest.warn_points_from_section_total',
                params: { section: 'Assignment 1 — to be (3p in totaal te behalen)' },
            },
            {
                key: 'importTest.warn_points_from_section_total',
                params: { section: 'Assignment 2 — to have (1p in totaal te behalen)' },
            },
        ]);
    });

    it('treats bulleted paragraphs as instruction, not as items', () => {
        const model = docx([
            p('Assignment 1', { headingLevel: 2 }),
            p('De toets bestaat uit 8 opdrachten.', { listFormat: 'bullet', listLevel: 0 }),
            p('1. She _____ tall.'),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.items).toHaveLength(1);
        expect(draft.sections[0].instruction).toBe('De toets bestaat uit 8 opdrachten.');
    });
});

describe('detectTestStructure — table layout', () => {
    it('reads rows whose first cell is the item number', () => {
        const model = docx([
            p('Vocabulary test', { fontSizePt: 18 }),
            table([
                ['#', 'Item', 'Points'],
                ['1', 'She _____ tall.', '1'],
                ['2', 'They _____ busy.', '2'],
            ]),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.items.map((i) => i.text)).toEqual(['She _____ tall.', 'They _____ busy.']);
        expect(draft.items.map((i) => i.points)).toEqual([1, 2]);
        expect(draft.items[0].tableCells).toEqual(['1', 'She _____ tall.', '1']);
        expect(draft.items[0].sectionIndex).toBe(-1);
        expect(draft.warnings).toContainEqual({ key: 'importTest.warn_no_sections' });
    });

    it('sets an answer-key table aside instead of reading it as items', () => {
        const model = docx([
            p('Assignment 1', { headingLevel: 2 }),
            // The title row is part of the table, so the header is the second row — as in a real key.
            table([
                ['ASSIGNMENT 1 (7p total)'],
                ['QUESTION', 'ANSWER', 'POINTS TO BE AWARDED'],
                ['1', 'is', '1'],
                ['2', 'are not', '1'],
            ]),
            p('1. She _____ tall. (1p)'),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.items).toHaveLength(1);
        expect(draft.items[0].text).toBe('She _____ tall.');
    });
});

describe('detectTestStructure — degradation', () => {
    it('does not turn a cover line into an empty section', () => {
        const model = pdf([
            p('Vocabulary and grammar test', { fontSizePt: 24 }),
            p('Y1 | T1 26-27 | 50 MINUTEN', { fontSizePt: 18 }),
            p('MAVO | HAVO | VWO', { fontSizePt: 18 }),
            p('Naam: _________________________', { fontSizePt: 18 }),
            p('Assignment 1 (1p in totaal)', { headingLevel: 2, page: 2 }),
            p('1. She _____ tall. (1p)', { page: 2 }),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.title).toBe('Vocabulary and grammar test');
        expect(draft.sections.map((s) => s.title)).toEqual(['Assignment 1 (1p in totaal)']);
        expect(draft.items[0].sectionIndex).toBe(0);
    });

    it('ignores running headers and page numbers', () => {
        const model = pdf(
            [
                p('Vocabulary and grammar test', { fontSizePt: 20, page: 1 }),
                p('Vocabulary and grammar test', { fontSizePt: 12, page: 2 }),
                p('Vocabulary and grammar test', { fontSizePt: 12, page: 3 }),
                p('2', { page: 2 }),
                p('Assignment 1 (1p in totaal)', { headingLevel: 2, page: 2 }),
                p('1. She _____ tall. (1p)', { page: 2 }),
            ],
            3
        );

        const draft = detectTestStructure(model);

        expect(draft.sections.map((s) => s.title)).toEqual(['Assignment 1 (1p in totaal)']);
        expect(draft.items).toHaveLength(1);
        expect(draft.warnings).toEqual([]);
    });

    it('reports a heading total that disagrees with the printed markers', () => {
        const model = docx([
            p('Assignment 1 (7p in totaal te behalen)', { headingLevel: 2 }),
            p('1. She _____ tall. (1p)'),
            p('2. They _____ busy. (1p)'),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.warnings).toContainEqual({
            key: 'importTest.warn_section_points_mismatch',
            params: { section: 'Assignment 1 (7p in totaal te behalen)', stated: 7, counted: 2 },
        });
    });

    it('keeps items without a section, and says so', () => {
        const model = docx([
            p('Vocabulary test', { fontSizePt: 18 }),
            p('1. She _____ tall.'),
            p('2. They _____ busy.'),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.sections).toEqual([]);
        expect(draft.items.map((i) => i.sectionIndex)).toEqual([-1, -1]);
        expect(draft.warnings).toContainEqual({ key: 'importTest.warn_no_sections' });
        expect(draft.warnings).toContainEqual({
            key: 'importTest.warn_points_unknown',
            params: { section: 'Imported test' },
        });
        expect(draft.confidence).toBe('medium');
    });

    it('says so when there is nothing to import', () => {
        const draft = detectTestStructure(pdf([p('Some prose with no items at all.', { fontSizePt: 12 })]));

        expect(draft.items).toEqual([]);
        expect(draft.warnings).toContainEqual({ key: 'importTest.warn_no_items' });
        expect(draft.confidence).toBe('low');
    });

    it('joins a wrapped prompt to the item above it but not to a finished one', () => {
        const model = docx([
            p('Assignment 1', { headingLevel: 2 }),
            p('1. She is tall and she is'),
            p('very happy today. (1p)'),
            p('2. They _____ busy. (1p)'),
            p('A second line that belongs to nobody.'),
        ]);

        const draft = detectTestStructure(model);

        expect(draft.items[0].text).toBe('She is tall and she is very happy today.');
        expect(draft.items[1].text).toBe('They _____ busy.');
        expect(draft.sections[0].instruction).toBe('A second line that belongs to nobody.');
    });
});

describe('headingScore', () => {
    it('separates headings from prose without knowing the template', () => {
        const body = [p('She is tall.', { fontSizePt: 12 }), p('They are busy.', { fontSizePt: 12 })];

        expect(headingScore(p('ASSIGNMENT 2 | TO HAVE', { fontSizePt: 12 }), 12)).toBeGreaterThanOrEqual(3);
        expect(headingScore(p('Assignment 3 (7p in totaal)', { fontSizePt: 12 }), 12)).toBeGreaterThanOrEqual(3);
        expect(headingScore(p('A heading', { headingLevel: 2 }), 12)).toBeGreaterThanOrEqual(3);
        expect(
            headingScore(
                p(
                    'Lees de zinnen hieronder en vul de juiste vorm van het werkwoord in op de lege plekken in de zinnen hieronder.',
                    { fontSizePt: 12 }
                ),
                12
            )
        ).toBeLessThan(3);
        expect(headingScore(body[0], 12)).toBeLessThan(3);
    });
});
