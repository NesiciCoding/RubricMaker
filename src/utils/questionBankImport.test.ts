import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQuestionBankJson, exportQuestionBankJson, parseQuestionBankFile } from './questionBankImport';
import type { QuestionBankItem } from '../types';

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

    it('parses an eloRating and ignores a non-numeric one', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    { question: { prompt: 'Rated question', type: 'open', eloRating: 950 } },
                    { question: { prompt: 'Unrated question', type: 'open', eloRating: 'high' } },
                ],
            })
        );
        expect(result.items[0].question!.eloRating).toBe(950);
        expect(result.items[1].question!.eloRating).toBeUndefined();
    });

    it('rejects a non-finite eloRating (e.g. 1e999, which JSON.parse coerces to Infinity)', () => {
        // Authored as a raw JSON string, not JSON.stringify(...) — Infinity can't round-trip through
        // JSON.stringify (it serializes to "null"), so this is the only way to exercise the case.
        const result = parseQuestionBankJson('{"items":[{"question":{"prompt":"Q","type":"open","eloRating":1e999}}]}');
        expect(result.items[0].question!.eloRating).toBeUndefined();
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

    it('normalizes every optional field with its fallback', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        question: {
                            prompt: 'Everything at once',
                            type: 'matching',
                            options: [{ isCorrect: true, imageUrl: 'https://example.com/pic.png' }, { text: '' }],
                            expectedAnswer: 'Fallback answer',
                            expectedNumericValue: 42,
                            numericTolerance: 0.5,
                            matchingPairs: [{}, { left: 'Cat', right: 'Meow' }],
                            orderItems: [{}, { text: 'First' }],
                            categories: [{ label: 'Verb' }, {}],
                            categorizeItems: [{ text: '', categoryId: '0' }, { categoryId: 'Verb' }],
                            hotTextPassage: '<p>Passage</p>',
                            hotTextCorrectIndices: [0, 2],
                            partialCredit: true,
                            linkedStandards: [
                                {},
                                { guid: 'G1', description: 'd', standardSetTitle: 's', jurisdictionTitle: 'j' },
                            ],
                            linkedCefrDescriptors: [{}, { descriptorId: 'd1', level: 'B1', skill: 'listening' }],
                            imageUrl: 'https://example.com/q.png',
                            audioUrl: 'https://example.com/q.mp3',
                            hint: 'Think harder',
                            maxRecordingSeconds: 30,
                        },
                    },
                    {
                        // Categories present but no categorizeItems → defaults to []
                        question: {
                            prompt: 'No categorize items',
                            type: 'categorize',
                            categories: [{ label: 'Verb' }],
                        },
                    },
                ],
            })
        );

        const q = result.items[0].question!;
        expect(q.expectedAnswer).toBe('Fallback answer');
        expect(q.expectedNumericValue).toBe(42);
        expect(q.numericTolerance).toBe(0.5);
        expect(q.options?.[0].imageUrl).toBe('https://example.com/pic.png');
        expect(q.options?.[1].text).toBe('');
        expect(q.matchingPairs?.[0]).toMatchObject({ left: '', right: '' });
        expect(q.orderItems?.[0].text).toBe('');
        expect(q.categories?.[1].label).toBe('');
        expect(q.categorizeItems?.[0]).toMatchObject({ text: '', categoryId: q.categories?.[0].id });
        expect(q.hotTextPassage).toBe('<p>Passage</p>');
        expect(q.hotTextCorrectIndices).toEqual([0, 2]);
        expect(q.partialCredit).toBe(true);
        expect(q.linkedStandards?.[0]).toMatchObject({
            guid: '',
            description: '',
            standardSetTitle: '',
            jurisdictionTitle: '',
        });
        expect(q.linkedCefrDescriptors?.[0]).toMatchObject({ descriptorId: '', level: 'A1', skill: 'reading' });
        expect(q.imageUrl).toBe('https://example.com/q.png');
        expect(q.audioUrl).toBe('https://example.com/q.mp3');
        expect(q.hint).toBe('Think harder');
        expect(q.maxRecordingSeconds).toBe(30);
        // No unknown-category warning: '0' and 'Verb' both resolve
        expect(result.warnings).toEqual([]);

        expect(result.items[1].question!.categorizeItems).toEqual([]);
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

    it('omits linkedCefrDescriptors entirely when every descriptor is invalid', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        question: {
                            prompt: 'Hi',
                            type: 'open',
                            linkedCefrDescriptors: [{ descriptorId: 'bad', level: 'Z9', skill: 'telepathy' }],
                        },
                    },
                ],
            })
        );
        const question = result.items[0].question!;
        expect(question.linkedCefrDescriptors).toBeUndefined();
        expect(result.warnings.filter((w) => w.key === 'questionBank.import_warn_invalid_descriptor')).toHaveLength(1);
    });

    it('parses a section bundle with its nested questions', () => {
        const result = parseQuestionBankJson(
            JSON.stringify({
                items: [
                    {
                        kind: 'section',
                        cefrLevel: 'A1',
                        cefrSkill: 'reading',
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
        expect(item.cefrSkill).toBe('reading');
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

    it('parses a valid cefrSkill and warns on an unrecognized one, without dropping the item', () => {
        const ok = parseQuestionBankJson(
            JSON.stringify({ items: [{ cefrSkill: 'listening', question: { prompt: 'Hi', type: 'open' } }] })
        );
        expect(ok.items[0].cefrSkill).toBe('listening');
        expect(ok.warnings).toEqual([]);

        const grammar = parseQuestionBankJson(
            JSON.stringify({ items: [{ cefrSkill: 'grammar', question: { prompt: 'Hi', type: 'open' } }] })
        );
        expect(grammar.items[0].cefrSkill).toBe('grammar');
        expect(grammar.warnings).toEqual([]);

        const bad = parseQuestionBankJson(
            JSON.stringify({ items: [{ cefrSkill: 'telepathy', question: { prompt: 'Hi', type: 'open' } }] })
        );
        expect(bad.items).toHaveLength(1);
        expect(bad.items[0].cefrSkill).toBeUndefined();
        expect(bad.warnings[0].key).toBe('questionBank.import_warn_unknown_cefr_skill');
        expect(bad.warnings[0].params).toEqual({ item: 'Item 1', skill: 'telepathy' });
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

describe('exportQuestionBankJson', () => {
    it('round-trips a question item and a section item through export then import', () => {
        const items: QuestionBankItem[] = [
            {
                id: 'item-1',
                createdAt: '2026-01-01T00:00:00.000Z',
                tags: ['grammar', 'a1'],
                cefrLevel: 'A1',
                question: {
                    id: 'q-1',
                    prompt: 'She ___ to school every day.',
                    type: 'multiple-choice',
                    points: 2,
                    options: [
                        { id: 'o-1', text: 'go', isCorrect: false },
                        { id: 'o-2', text: 'goes', isCorrect: true },
                    ],
                },
            },
            {
                id: 'item-2',
                createdAt: '2026-01-02T00:00:00.000Z',
                updatedAt: '2026-01-03T00:00:00.000Z',
                kind: 'section',
                tags: ['reading'],
                section: {
                    title: 'A short passage',
                    content: 'Once upon a time...',
                    questions: [{ id: 'q-2', prompt: 'Who is the story about?', type: 'open', points: 1 }],
                },
            },
        ];

        const json = exportQuestionBankJson(items);
        expect(json).not.toContain('item-1');
        expect(json).not.toContain('2026-01-01');

        const result = parseQuestionBankJson(json);
        expect(result.warnings).toEqual([]);
        expect(result.items).toHaveLength(2);

        const [first, second] = result.items;
        expect(first.tags).toEqual(['grammar', 'a1']);
        expect(first.cefrLevel).toBe('A1');
        expect(first.question!.prompt).toBe('She ___ to school every day.');
        expect(first.question!.options?.[1].isCorrect).toBe(true);

        expect(second.kind).toBe('section');
        expect(second.section!.title).toBe('A short passage');
        expect(second.section!.questions).toHaveLength(1);
        expect(second.section!.questions[0].prompt).toBe('Who is the story about?');
    });
});

describe('public/sample-question-bank.json', () => {
    it('parses with no warnings and carries an eloRating on every question', () => {
        const text = readFileSync(resolve(__dirname, '../../public/sample-question-bank.json'), 'utf8');
        const result = parseQuestionBankJson(text);

        expect(result.warnings).toEqual([]);
        expect(result.items.length).toBeGreaterThan(0);

        const allQuestions = result.items.flatMap((item) =>
            item.kind === 'section' && item.section ? item.section.questions : item.question ? [item.question] : []
        );
        expect(allQuestions.length).toBeGreaterThan(0);
        expect(allQuestions.every((q) => typeof q.eloRating === 'number')).toBe(true);
    });
});

describe('parseQuestionBankFile', () => {
    const makeFile = (name: string, content: string, size?: number): File => {
        const blob = new Blob([content]);
        return new File([blob], name, { type: 'application/json' });
    };

    it('rejects a non-JSON file extension with a warning', async () => {
        const result = await parseQuestionBankFile(makeFile('bank.csv', 'a,b\nc,d'));
        expect(result.items).toEqual([]);
        expect(result.warnings[0].key).toBe('questionBank.import_warn_unsupported_file_type');
        expect(result.warnings[0].params).toEqual({ ext: 'csv' });
    });

    it('rejects a file over the size cap with a warning', async () => {
        const big = new File([new Blob(['x'])], 'bank.json', { type: 'application/json' });
        Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
        const result = await parseQuestionBankFile(big);
        expect(result.items).toEqual([]);
        expect(result.warnings[0].key).toBe('questionBank.import_warn_file_too_large');
    });

    it('parses a valid JSON file', async () => {
        const result = await parseQuestionBankFile(
            makeFile('bank.json', JSON.stringify({ items: [{ question: { prompt: 'Hi', type: 'open' } }] }))
        );
        expect(result.warnings).toEqual([]);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].question!.prompt).toBe('Hi');
    });
});
