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
        expect(result.warnings[0].key).toBe('questionBank.import_warn_parse_failed');
        expect(result.warnings[0].params?.message).toBeTruthy();
    });

    it('rejects a payload without an items array', () => {
        const result = parseQuestionBankJson(JSON.stringify({ foo: 'bar' }));
        expect(result.items).toEqual([]);
        expect(result.warnings[0].key).toBe('questionBank.import_warn_invalid_format');
    });

    it('rejects a non-object top-level payload', () => {
        const result = parseQuestionBankJson(JSON.stringify([1, 2, 3]));
        expect(result.items).toEqual([]);
        expect(result.warnings[0].key).toBe('questionBank.import_warn_invalid_format');
    });

    it('skips a null/non-object item in the items array and warns, without crashing', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [null, 'oops', { question: { prompt: 'Hi', type: 'open' } }] })
        );
        expect(result.items).toHaveLength(1);
        expect(result.warnings.filter((w) => w.key === 'questionBank.import_warn_malformed_item')).toHaveLength(2);
    });

    it('skips items with no prompt and warns', () => {
        const result = parseQuestionBankJson(JSON.stringify({ items: [{ question: { type: 'open' } }] }));
        expect(result.items).toEqual([]);
        expect(result.warnings[0].key).toBe('questionBank.import_warn_missing_prompt');
    });

    it('defaults an unknown type to multiple-choice and warns', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ question: { prompt: 'Hi', type: 'essay' } }] })
        );
        expect(result.items[0].question!.type).toBe('multiple-choice');
        expect(result.warnings[0].key).toBe('questionBank.import_warn_unknown_type');
        expect(result.warnings[0].params).toEqual({ item: 'Item 1', type: 'essay' });
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
        expect(result.warnings[0].key).toBe('questionBank.import_warn_no_correct_option');
    });

    it('warns when a true-false question is missing correctBoolean', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ question: { prompt: 'True or false?', type: 'true-false' } }] })
        );
        expect(result.warnings[0].key).toBe('questionBank.import_warn_missing_correct_boolean');
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
        expect(result.warnings[0].key).toBe('questionBank.import_warn_unknown_category');
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

    it('drops a linkedCefrDescriptor with an invalid level or skill and warns, keeping valid ones', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        question: {
                            prompt: 'Hi',
                            type: 'open',
                            linkedCefrDescriptors: [
                                { descriptorId: 'bad-level', level: 'Z9', skill: 'reading' },
                                { descriptorId: 'bad-skill', level: 'A1', skill: 'telepathy' },
                                { descriptorId: 'good', level: 'A1', skill: 'reading' },
                            ],
                        },
                    },
                ],
            })
        );
        const question = result.items[0].question!;
        expect(question.linkedCefrDescriptors).toHaveLength(1);
        expect(question.linkedCefrDescriptors?.[0].descriptorId).toBe('good');
        expect(result.warnings.filter((w) => w.key === 'questionBank.import_warn_invalid_descriptor')).toHaveLength(2);
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
        expect(result.warnings[0].key).toBe('questionBank.import_warn_missing_title');
    });

    it('skips a section bundle with no valid questions and warns, without swallowing per-question warnings', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [{ kind: 'section', section: { title: 'Empty section', questions: [{ type: 'open' }] } }],
            })
        );
        expect(result.items).toEqual([]);
        expect(result.warnings).toContainEqual({
            key: 'questionBank.import_warn_missing_prompt',
            params: { item: 'Item 1 question 1' },
        });
        expect(result.warnings.some((w) => w.key === 'questionBank.import_warn_no_valid_questions')).toBe(true);
    });

    it('treats a non-array section.questions as empty rather than crashing', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ kind: 'section', section: { title: 'Bad shape', questions: 'oops' } }] })
        );
        expect(result.items).toEqual([]);
        expect(result.warnings[0].key).toBe('questionBank.import_warn_no_valid_questions');
    });

    it('warns on an unrecognized cefrLevel and drops it, without dropping the item', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({ items: [{ cefrLevel: 'Z9', question: { prompt: 'Hi', type: 'open' } }] })
        );
        expect(result.items).toHaveLength(1);
        expect(result.items[0].cefrLevel).toBeUndefined();
        expect(result.warnings[0].key).toBe('questionBank.import_warn_unknown_cefr_level');
        expect(result.warnings[0].params).toEqual({ item: 'Item 1', level: 'Z9' });
    });

    it('caps the number of processed items and warns about the truncation', () => {
        const items = Array.from({ length: 505 }, (_, i) => ({ question: { prompt: `Q${i}`, type: 'open' } }));
        const result = parseQuestionBankJson(JSON.stringify({ items }));
        expect(result.items).toHaveLength(500);
        expect(result.warnings[0]).toEqual({
            key: 'questionBank.import_warn_too_many_items',
            params: { max: 500, dropped: 5 },
        });
    });
});
