import { describe, expect, it } from 'vitest';
import { parseQuestionBankJson } from './questionBankImport';

describe('parseQuestionBankJson', () => {
    it('parses a well-formed multiple-choice item', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        tags: ['grammar', 'a1'],
                        question: {
                            prompt: 'She ___ to school every day.',
                            type: 'multiple-choice',
                            points: 2,
                            options: [
                                { text: 'go', isCorrect: false },
                                { text: 'goes', isCorrect: true },
                            ],
                        },
                    },
                ],
            })
        );

        expect(result.warnings).toEqual([]);
        expect(result.items).toHaveLength(1);
        const [{ question, tags }] = result.items;
        expect(tags).toEqual(['grammar', 'a1']);
        expect(question!.type).toBe('multiple-choice');
        expect(question!.points).toBe(2);
        expect(question!.options).toHaveLength(2);
        expect(question!.options?.[1].isCorrect).toBe(true);
        expect(question!.id).toBeTruthy();
        expect(question!.options?.every((o) => o.id)).toBe(true);
    });

    it('rejects invalid JSON', () => {
        const result = parseQuestionBankJson('not json');
        expect(result.items).toEqual([]);
        expect(result.warnings[0]).toMatch(/Failed to parse JSON/);
    });

    it('rejects a payload without an items array', () => {
        const result = parseQuestionBankJson(JSON.stringify({ foo: 'bar' }));
        expect(result.items).toEqual([]);
        expect(result.warnings[0]).toMatch(/expected a top-level "items" array/);
    });

    it('skips items with no prompt and warns', () => {
        const result = parseQuestionBankJson(JSON.stringify({ items: [{ question: { type: 'open' } }] }));
        expect(result.items).toEqual([]);
        expect(result.warnings[0]).toMatch(/missing prompt/);
    });

    it('defaults an unknown type to multiple-choice and warns', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ question: { prompt: 'Hi', type: 'essay' } }] })
        );
        expect(result.items[0].question!.type).toBe('multiple-choice');
        expect(result.warnings[0]).toMatch(/unknown type "essay"/);
    });

    it('warns when a multiple-choice question has no correct option', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        question: {
                            prompt: 'Pick one',
                            type: 'multiple-choice',
                            options: [{ text: 'a' }, { text: 'b' }],
                        },
                    },
                ],
            })
        );
        expect(result.warnings[0]).toMatch(/no correct option marked/);
    });

    it('warns when a true-false question is missing correctBoolean', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ question: { prompt: 'True or false?', type: 'true-false' } }] })
        );
        expect(result.warnings[0]).toMatch(/missing correctBoolean/);
    });

    it('resolves categorize items against categories by index and by label', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        question: {
                            prompt: 'Sort the words',
                            type: 'categorize',
                            categories: [{ label: 'Verb' }, { label: 'Noun' }],
                            categorizeItems: [
                                { text: 'run', categoryId: '0' },
                                { text: 'dog', categoryId: 'Noun' },
                            ],
                        },
                    },
                ],
            })
        );
        const question = result.items[0].question!;
        expect(question.categories).toHaveLength(2);
        expect(question.categorizeItems?.[0].categoryId).toBe(question.categories?.[0].id);
        expect(question.categorizeItems?.[1].categoryId).toBe(question.categories?.[1].id);
        expect(result.warnings).toEqual([]);
    });

    it('warns when a categorize item references an unknown category', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        question: {
                            prompt: 'Sort the words',
                            type: 'categorize',
                            categories: [{ label: 'Verb' }],
                            categorizeItems: [{ text: 'dog', categoryId: 'Noun' }],
                        },
                    },
                ],
            })
        );
        expect(result.warnings[0]).toMatch(/unknown category/);
    });

    it('carries through CEFR and grammar links, tags, and explanation', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        tags: ['reading', 'slo:35b'],
                        question: {
                            prompt: 'What is her name?',
                            type: 'short-answer',
                            expectedAnswers: ['Shannon'],
                            explanation: 'She writes about her dog.',
                            linkedGrammarItemId: 'gr-present-simple-affirmative',
                            linkedCefrDescriptors: [
                                {
                                    descriptorId: 'r-a1-1',
                                    level: 'A1',
                                    skill: 'reading',
                                    descriptionEn: 'x',
                                    descriptionNl: 'y',
                                },
                            ],
                            linkedStandards: [
                                {
                                    guid: 'ABC',
                                    description: 'Kerndoel 35B',
                                    standardSetTitle: 'SLO-Doelen',
                                    jurisdictionTitle: 'Academie Tien',
                                },
                            ],
                        },
                    },
                ],
            })
        );
        const { question, tags } = result.items[0];
        expect(tags).toEqual(['reading', 'slo:35b']);
        expect(question!.expectedAnswers).toEqual(['Shannon']);
        expect(question!.linkedGrammarItemId).toBe('gr-present-simple-affirmative');
        expect(question!.linkedCefrDescriptors?.[0].descriptorId).toBe('r-a1-1');
        expect(question!.linkedStandards?.[0].standardSetTitle).toBe('SLO-Doelen');
    });

    it('parses a section bundle with its nested questions', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        kind: 'section',
                        cefrLevel: 'A1',
                        tags: ['reading', 'text-1'],
                        section: {
                            title: 'Tekst 1 — Chat profiles',
                            content: '<p>Five teen chat profiles...</p>',
                            questions: [
                                {
                                    prompt: 'Who likes dancing?',
                                    type: 'short-answer',
                                    points: 0.5,
                                    expectedAnswers: ['Shannon'],
                                },
                                {
                                    prompt: 'Who is from the US?',
                                    type: 'short-answer',
                                    points: 0.5,
                                    expectedAnswers: ['Alex'],
                                },
                            ],
                        },
                    },
                ],
            })
        );

        expect(result.warnings).toEqual([]);
        expect(result.items).toHaveLength(1);
        const item = result.items[0];
        expect(item.kind).toBe('section');
        expect(item.cefrLevel).toBe('A1');
        expect(item.question).toBeUndefined();
        expect(item.section?.title).toBe('Tekst 1 — Chat profiles');
        expect(item.section?.content).toBe('<p>Five teen chat profiles...</p>');
        expect(item.section?.questions).toHaveLength(2);
        expect(item.section?.questions[0].id).toBeTruthy();
        expect(item.section?.questions[1].id).toBeTruthy();
        expect(item.section?.questions[0].id).not.toBe(item.section?.questions[1].id);
    });

    it('skips a section bundle with no title and warns', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ kind: 'section', section: { questions: [{ prompt: 'Q', type: 'open' }] } }] })
        );
        expect(result.items).toEqual([]);
        expect(result.warnings[0]).toMatch(/missing a title/);
    });

    it('skips a section bundle with no valid questions and warns, without swallowing per-question warnings', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [{ kind: 'section', section: { title: 'Empty section', questions: [{ type: 'open' }] } }],
            })
        );
        expect(result.items).toEqual([]);
        expect(result.warnings).toContain('Item 1 question 1: skipped — missing prompt.');
        expect(result.warnings.some((w) => /no valid questions/.test(w))).toBe(true);
    });

    it('warns on an unrecognized cefrLevel and drops it, without dropping the item', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ cefrLevel: 'Z9', question: { prompt: 'Hi', type: 'open' } }] })
        );
        expect(result.items).toHaveLength(1);
        expect(result.items[0].cefrLevel).toBeUndefined();
        expect(result.warnings[0]).toMatch(/unknown cefrLevel "Z9"/);
    });
});
