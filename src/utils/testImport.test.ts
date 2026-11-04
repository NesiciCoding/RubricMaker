import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTestData, parseTestFile, parseTestJson } from './testImport';

const baseQuestion = { prompt: 'Q1', type: 'short-answer', points: 1, expectedAnswers: ['x'] };

function warningKeys(result: { warnings: { key: string }[] }): string[] {
    return result.warnings.map((w) => w.key);
}

describe('parseTestJson — accepted shapes', () => {
    it('parses a single exported test and keeps its questions, sections and points', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Vocabulary and grammar test',
                durationMinutes: 50,
                sections: [{ id: 's1', title: 'Assignment 1', content: '<p>Fill in</p>' }],
                questions: [
                    { ...baseQuestion, sectionId: 's1' },
                    { prompt: 'True?', type: 'true-false', points: 2, correctBoolean: false },
                ],
            })
        );

        expect(result.warnings).toEqual([]);
        expect(result.tests).toHaveLength(1);
        const test = result.tests[0];
        expect(test.name).toBe('Vocabulary and grammar test');
        expect(test.durationMinutes).toBe(50);
        expect(test.requireSEB).toBe(false);
        expect(test.shuffleQuestions).toBe(false);
        expect(test.questions).toHaveLength(2);
        expect(test.questions.reduce((sum, q) => sum + q.points, 0)).toBe(3);
        expect(test.sections).toHaveLength(1);
        expect(test.sections?.[0].title).toBe('Assignment 1');
    });

    it('gives every section and question a fresh id and re-points sectionId at the new section', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'IDs',
                sections: [
                    { id: 'old-section', title: 'S' },
                    { id: 'other-section', title: 'T' },
                ],
                questions: [
                    { ...baseQuestion, id: 'old-question', sectionId: 'old-section' },
                    { ...baseQuestion, id: 'old-question', sectionId: 'other-section' },
                ],
            })
        );

        const test = result.tests[0];
        const sectionIds = test.sections!.map((s) => s.id);
        expect(sectionIds).not.toContain('old-section');
        expect(new Set(sectionIds).size).toBe(2);
        expect(test.questions.map((q) => q.sectionId)).toEqual(sectionIds);
        expect(test.questions[0].id).not.toBe('old-question');
        expect(test.questions[0].id).not.toBe(test.questions[1].id);
    });

    it('accepts an array of tests', () => {
        const result = parseTestData([
            { name: 'A', questions: [baseQuestion] },
            { name: 'B', questions: [] },
        ]);
        expect(result.tests.map((t) => t.name)).toEqual(['A', 'B']);
        expect(warningKeys(result)).toContain('importTest.warn_test_without_questions');
    });

    it('accepts a full backup export and only takes the tests out of it', () => {
        const result = parseTestData({
            tests: [{ name: 'From backup', questions: [baseQuestion] }],
            rubrics: [{ id: 'r1', criteria: [] }],
            settings: { language: 'nl' },
        });
        expect(result.tests).toHaveLength(1);
        expect(result.tests[0].name).toBe('From backup');
    });

    it('falls back to the file name when the test has no name', async () => {
        const file = new File([JSON.stringify({ questions: [baseQuestion] })], 'my-test.json', {
            type: 'application/json',
        });
        const result = await parseTestFile(file);
        expect(result.tests[0].name).toBe('my-test');
    });

    it('drops workspace-specific fields so an import never lands in a stranger folder or sharing scope', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Filing',
                folderId: 'their-folder',
                displayOrder: 7,
                sharing: { visibility: 'students' },
                questions: [baseQuestion],
            })
        );
        const test = result.tests[0] as Record<string, unknown>;
        expect(test.folderId).toBeUndefined();
        expect(test.displayOrder).toBeUndefined();
        expect(test.sharing).toBeUndefined();
    });
});

describe('parseTestJson — rejected input', () => {
    it('reports a parse failure instead of throwing on malformed JSON', () => {
        const result = parseTestJson('{ not json');
        expect(result.tests).toEqual([]);
        expect(warningKeys(result)).toEqual(['importTest.warn_parse_failed']);
    });

    it('rejects an object that has no questions array', () => {
        const result = parseTestData({ name: 'Nope' });
        expect(result.tests).toEqual([]);
        expect(warningKeys(result)).toEqual(['importTest.warn_invalid_format']);
    });

    it('explains that a question bank file belongs on the Question Bank page', () => {
        const result = parseTestData({ items: [{ question: baseQuestion }] });
        expect(result.tests).toEqual([]);
        expect(warningKeys(result)).toEqual(['importTest.warn_looks_like_question_bank']);
    });

    it('rejects a non-JSON file by extension and an oversized file', async () => {
        const docx = await parseTestFile(new File(['x'], 'test.docx', { type: 'application/msword' }));
        expect(warningKeys(docx)).toEqual(['importTest.warn_unsupported_file_type']);

        const huge = await parseTestFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.json'));
        expect(warningKeys(huge)).toEqual(['importTest.warn_file_too_large']);
    });
});

describe('parseTestJson — per-question validation', () => {
    function parseOne(question: Record<string, unknown>) {
        return parseTestJson(JSON.stringify({ name: 'T', questions: [question] }));
    }

    it('drops a question with an unknown type', () => {
        const result = parseOne({ prompt: 'P', type: 'essay', points: 1 });
        expect(result.tests[0].questions).toEqual([]);
        expect(warningKeys(result)).toContain('importTest.warn_unknown_type');
    });

    it('drops a question without a prompt', () => {
        const result = parseOne({ type: 'short-answer', points: 1, expectedAnswers: ['x'] });
        expect(result.tests[0].questions).toEqual([]);
        expect(warningKeys(result)).toContain('importTest.warn_missing_prompt');
    });

    it('defaults invalid points to 1 and reports it', () => {
        const result = parseOne({ prompt: 'P', type: 'open', points: 0 });
        expect(result.tests[0].questions[0].points).toBe(1);
        expect(warningKeys(result)).toContain('importTest.warn_bad_points');
    });

    it('keeps a question whose section is missing from the file, but without a section', () => {
        const result = parseOne({ prompt: 'P', type: 'open', points: 1, sectionId: 'ghost' });
        expect(result.tests[0].questions[0].sectionId).toBeUndefined();
        expect(warningKeys(result)).toContain('importTest.warn_unknown_section');
    });

    it('warns about a multiple-choice question with no correct option', () => {
        const result = parseOne({
            prompt: 'P',
            type: 'multiple-choice',
            points: 1,
            options: [
                { text: 'a', isCorrect: false },
                { text: 'b', isCorrect: false },
            ],
        });
        expect(warningKeys(result)).toContain('importTest.warn_no_correct_option');
        expect(result.tests[0].questions[0].options).toHaveLength(2);
    });

    it('warns about a true-false question without correctBoolean', () => {
        const result = parseOne({ prompt: 'P', type: 'true-false', points: 1 });
        expect(warningKeys(result)).toContain('importTest.warn_missing_correct_boolean');
    });

    it('warns about a cloze prompt without a gap', () => {
        const result = parseOne({ prompt: 'No gap here', type: 'cloze', points: 1 });
        expect(warningKeys(result)).toContain('importTest.warn_cloze_without_gap');
    });

    it('re-points matrix rows and categorize items at the regenerated columns and categories', () => {
        const result = parseOne({
            prompt: 'P',
            type: 'matrix',
            points: 2,
            matrixColumns: [
                { id: 'c1', text: 'True' },
                { id: 'c2', text: 'False' },
            ],
            matrixRows: [{ id: 'r1', text: 'Statement', correctColumnId: 'c2' }],
        });
        const question = result.tests[0].questions[0];
        const columnIds = question.matrixColumns!.map((c) => c.id);
        expect(columnIds).not.toContain('c1');
        expect(question.matrixRows![0].correctColumnId).toBe(columnIds[1]);

        const categorized = parseOne({
            prompt: 'P',
            type: 'categorize',
            points: 2,
            categories: [
                { id: 'k1', label: 'Fruit' },
                { id: 'k2', label: 'Veg' },
            ],
            categorizeItems: [{ id: 'i1', text: 'Apple', categoryId: 'k1' }],
        }).tests[0].questions[0];
        const categoryIds = categorized.categories!.map((c) => c.id);
        expect(categorized.categorizeItems![0].categoryId).toBe(categoryIds[0]);
    });

    it('keeps answer tolerances it knows and ignores unknown ones', () => {
        const question = parseOne({
            prompt: 'P {{gap}}',
            type: 'cloze',
            points: 1,
            answerTolerance: { contractions: true, nonsense: true },
        }).tests[0].questions[0];
        expect(question.answerTolerance).toEqual({ contractions: true });
    });

    it('caps a huge test at 500 questions instead of freezing the tab', () => {
        const questions = Array.from({ length: 505 }, (_, i) => ({ ...baseQuestion, prompt: `Q${i}` }));
        const result = parseTestJson(JSON.stringify({ name: 'Big', questions }));
        expect(result.tests[0].questions).toHaveLength(500);
        expect(warningKeys(result)).toContain('importTest.warn_too_many_questions');
    });

    it('caps a huge batch at 25 tests', () => {
        const tests = Array.from({ length: 30 }, (_, i) => ({ name: `T${i}`, questions: [baseQuestion] }));
        const result = parseTestData(tests);
        expect(result.tests).toHaveLength(25);
        expect(warningKeys(result)).toContain('importTest.warn_too_many_tests');
    });
});

describe('parseTestJson — test-level settings', () => {
    it('keeps a valid grading norm table and drops an invalid one', () => {
        const kept = parseTestJson(
            JSON.stringify({
                name: 'Norm',
                questions: [baseQuestion],
                gradingNorm: {
                    type: 'table',
                    tiers: [{ id: 'vwo', track: 'vwo', label: 'Vwo', passFrom: 'B' }],
                    rows: [
                        { minPoints: 0, grades: { vwo: 'IO' } },
                        { minPoints: 44, grades: { vwo: 'E' } },
                    ],
                },
            })
        );
        expect(kept.tests[0].gradingNorm).toEqual({
            type: 'table',
            tiers: [{ id: 'vwo', track: 'vwo', label: 'Vwo', passFrom: 'B' }],
            rows: [
                { minPoints: 0, grades: { vwo: 'IO' } },
                { minPoints: 44, grades: { vwo: 'E' } },
            ],
        });

        const dropped = parseTestJson(
            JSON.stringify({
                name: 'Norm',
                questions: [baseQuestion],
                gradingNorm: { type: 'table', tiers: [], rows: [] },
            })
        );
        expect(dropped.tests[0].gradingNorm).toBeUndefined();
        expect(warningKeys(dropped)).toContain('importTest.warn_invalid_norm');

        const nterm = parseTestJson(
            JSON.stringify({ name: 'Norm', questions: [baseQuestion], gradingNorm: { type: 'nterm', n: 1.2 } })
        );
        expect(nterm.tests[0].gradingNorm).toEqual({ type: 'nterm', n: 1.2 });
    });

    it('keeps known mode, CEFR and engine values and ignores unknown ones', () => {
        const test = parseTestJson(
            JSON.stringify({
                name: 'Settings',
                questions: [baseQuestion],
                mode: 'practice',
                placementEngine: 'staircase',
                cefrTargetLevel: 'B1',
                cefrSkill: 'reading',
                contentArea: 'grammar',
                gradeDecimals: 2,
                passGrade: 6,
                allowMultipleAttempts: true,
            })
        ).tests[0];
        expect(test.mode).toBe('practice');
        expect(test.placementEngine).toBe('staircase');
        expect(test.cefrTargetLevel).toBe('B1');
        expect(test.cefrSkill).toBe('reading');
        expect(test.contentArea).toBe('grammar');
        expect(test.gradeDecimals).toBe(2);
        expect(test.passGrade).toBe(6);
        expect(test.allowMultipleAttempts).toBe(true);

        const invalid = parseTestJson(
            JSON.stringify({
                name: 'Settings',
                questions: [baseQuestion],
                mode: 'homework',
                cefrTargetLevel: 'Z9',
                cefrSkill: 'grammar',
                gradeDecimals: 5,
                passGrade: 42,
            })
        );
        expect(invalid.tests[0].mode).toBeUndefined();
        expect(invalid.tests[0].cefrTargetLevel).toBeUndefined();
        expect(invalid.tests[0].cefrSkill).toBeUndefined();
        expect(invalid.tests[0].gradeDecimals).toBeUndefined();
        expect(invalid.tests[0].passGrade).toBeUndefined();
        expect(warningKeys(invalid)).toEqual(
            expect.arrayContaining(['importTest.warn_unknown_cefr_level', 'importTest.warn_unknown_cefr_skill'])
        );
    });

    it('keeps a valid generator config and drops a broken one', () => {
        const kept = parseTestJson(
            JSON.stringify({
                name: 'Generator',
                questions: [],
                placementEngine: 'generator',
                generatorConfig: {
                    minCefrLevel: 'A2',
                    maxCefrLevel: 'B1',
                    minQuestions: 10,
                    maxQuestions: 20,
                    skills: ['reading'],
                    tags: ['travel'],
                },
            })
        ).tests[0];
        expect(kept.generatorConfig).toEqual({
            minCefrLevel: 'A2',
            maxCefrLevel: 'B1',
            minQuestions: 10,
            maxQuestions: 20,
            skills: ['reading'],
            tags: ['travel'],
        });

        const dropped = parseTestJson(
            JSON.stringify({
                name: 'Generator',
                questions: [],
                generatorConfig: { minCefrLevel: 'A2', maxCefrLevel: 'B1', minQuestions: 20, maxQuestions: 10 },
            })
        ).tests[0];
        expect(dropped.generatorConfig).toBeUndefined();
    });
});

describe('public/sample-test.json', () => {
    it('parses into one complete test with no warnings', () => {
        const text = readFileSync(resolve(__dirname, '../../public/sample-test.json'), 'utf8');
        const result = parseTestJson(text, 'sample-test');

        expect(result.warnings).toEqual([]);
        expect(result.tests).toHaveLength(1);
        const test = result.tests[0];
        expect(test.sections).toHaveLength(2);
        expect(test.questions).toHaveLength(4);
        expect(test.questions.reduce((sum, q) => sum + q.points, 0)).toBe(6);
        expect(test.gradingNorm?.type).toBe('table');
        expect(test.questions.map((q) => q.sectionId)).toEqual([
            test.sections![0].id,
            test.sections![0].id,
            test.sections![1].id,
            test.sections![1].id,
        ]);
    });
});

describe('parseTestJson — full fidelity', () => {
    it('keeps every test, section and question field of a fully specified file', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Everything',
                description: 'desc',
                durationMinutes: 45,
                gradeScaleId: 'gs1',
                dueDate: '2026-12-01',
                printHeader: '<h1>H</h1>',
                printIntro: '<p>I</p>',
                printFooter: '<p>F</p>',
                mode: 'placement',
                placementEngine: 'generator',
                generatorConfig: {
                    minCefrLevel: 'A2',
                    maxCefrLevel: 'B2',
                    minQuestions: 5,
                    maxQuestions: 10,
                    skills: ['reading', 'grammar'],
                    tags: ['travel'],
                    starterBankItemId: 'bank-1',
                },
                allowMultipleAttempts: true,
                cefrTargetLevel: 'B1',
                cefrSkill: 'writing',
                contentArea: 'reading',
                contentLanguage: 'nl',
                gradingNorm: { type: 'caesura', passPoints: 30 },
                gradeDecimals: 1,
                passGrade: 5.5,
                scoreOnly: true,
                requireSEB: true,
                shuffleQuestions: true,
                sections: [
                    {
                        id: 's1',
                        title: 'Passage',
                        content: '<p>c</p>',
                        audioUrl: 'a.mp3',
                        maxPlays: 2,
                        spokenText: 'read me',
                        transcript: 'tr',
                        cefrLevel: 'B1',
                        routing: { thresholdPct: 60, passSectionId: 's2', failSectionId: 's2' },
                    },
                    { id: 's2', title: 'Second' },
                ],
                questions: [
                    {
                        prompt: 'Pick one',
                        type: 'multiple-choice',
                        points: 2,
                        sectionId: 's1',
                        partialCredit: false,
                        imageUrl: 'i.png',
                        audioUrl: 'q.mp3',
                        hint: 'hint',
                        explanation: 'why',
                        linkedGrammarItemId: 'g1',
                        rubricId: 'r1',
                        eloRating: 1100,
                        maxPlays: 3,
                        maxRecordingSeconds: 90,
                        prepSeconds: 15,
                        cueBullets: ['one', 'two'],
                        spokenText: 'spoken',
                        transcript: 'question transcript',
                        options: [
                            { text: 'a', isCorrect: true, imageUrl: 'oa.png', audioUrl: 'oa.mp3', spokenText: 'ay' },
                            { text: 'b', isCorrect: false },
                        ],
                        linkedStandards: [{ guid: 'std-1', description: 'S' }],
                        linkedCefrDescriptors: [
                            {
                                descriptorId: 'd1',
                                level: 'B1',
                                skill: 'reading',
                                descriptionEn: 'x',
                                descriptionNl: 'y',
                            },
                        ],
                        frameworkDescriptors: [{ id: 'f1' }],
                    },
                    {
                        prompt: 'Pick some',
                        type: 'multiple-response',
                        points: 2,
                        options: [
                            { text: 'a', isCorrect: true },
                            { text: 'b', isCorrect: true },
                            { text: 'c', isCorrect: false },
                        ],
                    },
                    { prompt: 'True?', type: 'true-false', points: 1, correctBoolean: true },
                    {
                        prompt: 'Type it',
                        type: 'short-answer',
                        points: 1,
                        expectedAnswers: ['a', 'b'],
                        answerTolerance: { punctuation: true, spelling: true, slips: true },
                    },
                    { prompt: 'How many?', type: 'numeric', points: 1, expectedNumericValue: 42, numericTolerance: 2 },
                    {
                        prompt: 'Sort {{apple}} here',
                        type: 'cloze-bank',
                        points: 1,
                        bankDistractors: ['pear'],
                        bankUniqueUse: false,
                    },
                    { prompt: 'Choose {{the|a}}', type: 'cloze-dropdown', points: 1 },
                    { prompt: 'Type the word {{happiness}}(HAPPY)', type: 'cloze', points: 1, wordFormation: true },
                    {
                        prompt: 'Matrix',
                        type: 'matrix',
                        points: 2,
                        matrixColumns: [
                            { id: 'c1', text: 'True' },
                            { id: 'c2', text: 'False' },
                        ],
                        matrixRows: [
                            { id: 'r1', text: 'One', correctColumnId: 'c1' },
                            { id: 'r2', text: 'Two', correctColumnId: 'c2' },
                        ],
                    },
                    {
                        prompt: 'Match',
                        type: 'matching',
                        points: 2,
                        matchingPairs: [
                            { id: 'p1', left: 'L1', right: 'R1' },
                            { id: 'p2', left: 'L2', right: 'R2' },
                        ],
                    },
                    {
                        prompt: 'Order',
                        type: 'ordering',
                        points: 2,
                        orderItems: [
                            { id: 'o1', text: 'first' },
                            { id: 'o2', text: 'second' },
                        ],
                    },
                    {
                        prompt: 'Categorize',
                        type: 'categorize',
                        points: 2,
                        categories: [
                            { id: 'k1', label: 'Fruit' },
                            { id: 'k2', label: 'Veg' },
                        ],
                        categorizeItems: [{ id: 'i1', text: 'Apple', categoryId: 'k1' }],
                    },
                    {
                        prompt: 'Hot text',
                        type: 'hot-text',
                        points: 2,
                        hotTextPassage: 'Pick [[this]] not [[that]]',
                        hotTextCorrectIndices: [0, 'junk'],
                    },
                    { prompt: 'Dictate', type: 'dictation', points: 2, dictationText: 'The cat sat.' },
                    {
                        prompt: 'Rewrite',
                        type: 'key-word-transformation',
                        points: 2,
                        keyWord: 'ALTHOUGH',
                        gappedSentence: '____ it rained we went out.',
                        answerWordLimit: { min: 3, max: 6 },
                    },
                    {
                        prompt: 'Fix it',
                        type: 'error-correction',
                        points: 2,
                        errorPassage: 'He [[go|goes]] home.',
                        penaliseFalsePicks: true,
                    },
                    {
                        prompt: 'Build',
                        type: 'sentence-builder',
                        points: 2,
                        sentenceTargets: ['I like tea.'],
                        builderScoring: 'all-or-nothing',
                    },
                    {
                        prompt: 'Speak',
                        type: 'audio-response',
                        points: 3,
                        maxRecordingSeconds: 60,
                        prepSeconds: 20,
                        cueBullets: ['intro'],
                    },
                    { prompt: 'Write', type: 'open', points: 5 },
                ],
            })
        );

        expect(result.warnings).toEqual([]);
        const test = result.tests[0];
        expect(test).toMatchObject({
            name: 'Everything',
            description: 'desc',
            durationMinutes: 45,
            gradeScaleId: 'gs1',
            dueDate: '2026-12-01',
            printHeader: '<h1>H</h1>',
            printIntro: '<p>I</p>',
            printFooter: '<p>F</p>',
            mode: 'placement',
            placementEngine: 'generator',
            allowMultipleAttempts: true,
            cefrTargetLevel: 'B1',
            cefrSkill: 'writing',
            contentArea: 'reading',
            contentLanguage: 'nl',
            gradingNorm: { type: 'caesura', passPoints: 30 },
            gradeDecimals: 1,
            passGrade: 5.5,
            scoreOnly: true,
            requireSEB: true,
            shuffleQuestions: true,
        });
        expect(test.generatorConfig).toMatchObject({ starterBankItemId: 'bank-1', skills: ['reading', 'grammar'] });

        const [first, second] = test.sections!;
        expect(first).toMatchObject({
            title: 'Passage',
            content: '<p>c</p>',
            audioUrl: 'a.mp3',
            maxPlays: 2,
            spokenText: 'read me',
            transcript: 'tr',
            cefrLevel: 'B1',
            routing: { thresholdPct: 60, passSectionId: second.id, failSectionId: second.id },
        });
        expect(second.title).toBe('Second');

        expect(test.questions.map((q) => q.type)).toEqual([
            'multiple-choice',
            'multiple-response',
            'true-false',
            'short-answer',
            'numeric',
            'cloze-bank',
            'cloze-dropdown',
            'cloze',
            'matrix',
            'matching',
            'ordering',
            'categorize',
            'hot-text',
            'dictation',
            'key-word-transformation',
            'error-correction',
            'sentence-builder',
            'audio-response',
            'open',
        ]);
        expect(test.questions.reduce((sum, q) => sum + q.points, 0)).toBe(36);
        expect(test.questions[0]).toMatchObject({
            sectionId: first.id,
            partialCredit: false,
            imageUrl: 'i.png',
            audioUrl: 'q.mp3',
            hint: 'hint',
            explanation: 'why',
            linkedGrammarItemId: 'g1',
            rubricId: 'r1',
            eloRating: 1100,
            maxPlays: 3,
            maxRecordingSeconds: 90,
            prepSeconds: 15,
            cueBullets: ['one', 'two'],
            spokenText: 'spoken',
            transcript: 'question transcript',
        });
        expect(test.questions[0].options?.[0]).toMatchObject({
            text: 'a',
            isCorrect: true,
            imageUrl: 'oa.png',
            audioUrl: 'oa.mp3',
            spokenText: 'ay',
        });
        expect(test.questions[0].linkedStandards).toEqual([{ guid: 'std-1', description: 'S' }]);
        expect(test.questions[0].linkedCefrDescriptors).toHaveLength(1);
        expect(test.questions[0].frameworkDescriptors).toEqual([{ id: 'f1' }]);
        expect(test.questions[3].answerTolerance).toEqual({ punctuation: true, spelling: true, slips: true });
        expect(test.questions[4]).toMatchObject({ expectedNumericValue: 42, numericTolerance: 2 });
        expect(test.questions[5]).toMatchObject({ bankDistractors: ['pear'], bankUniqueUse: false });
        expect(test.questions[7].wordFormation).toBe(true);
        expect(test.questions[8].matrixRows?.map((r) => r.correctColumnId)).toEqual([
            test.questions[8].matrixColumns![0].id,
            test.questions[8].matrixColumns![1].id,
        ]);
        expect(test.questions[12]).toMatchObject({ hotTextPassage: 'Pick [[this]] not [[that]]' });
        expect(test.questions[12].hotTextCorrectIndices).toEqual([0]);
        expect(test.questions[13]).toMatchObject({ dictationText: 'The cat sat.' });
        expect(test.questions[14]).toMatchObject({
            keyWord: 'ALTHOUGH',
            gappedSentence: '____ it rained we went out.',
            answerWordLimit: { min: 3, max: 6 },
        });
        expect(test.questions[15]).toMatchObject({ errorPassage: 'He [[go|goes]] home.', penaliseFalsePicks: true });
        expect(test.questions[16]).toMatchObject({
            sentenceTargets: ['I like tea.'],
            builderScoring: 'all-or-nothing',
        });
        expect(test.questions[17]).toMatchObject({
            maxRecordingSeconds: 60,
            prepSeconds: 20,
            cueBullets: ['intro'],
        });
    });

    it('warns about routing, columns, categories and CEFR values it cannot use, but keeps the content', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Broken bits',
                sections: [
                    {
                        title: 'S',
                        cefrLevel: 'Z9',
                        routing: { thresholdPct: 'high', passSectionId: 'a', failSectionId: 'b' },
                    },
                ],
                questions: [
                    {
                        prompt: 'M',
                        type: 'matrix',
                        points: 1,
                        matrixColumns: [{ id: 'c1', text: 'True' }],
                        matrixRows: [{ text: 'Row', correctColumnId: 'ghost' }],
                    },
                    {
                        prompt: 'C',
                        type: 'categorize',
                        points: 1,
                        categories: [{ id: 'k1', label: 'Fruit' }],
                        categorizeItems: [{ text: 'Apple', categoryId: 'ghost' }],
                    },
                ],
            })
        );

        expect(warningKeys(result)).toEqual(
            expect.arrayContaining([
                'importTest.warn_unknown_cefr_level',
                'importTest.warn_invalid_routing',
                'importTest.warn_unknown_column',
                'importTest.warn_unknown_category',
            ])
        );
        expect(result.tests[0].sections?.[0].routing).toBeUndefined();
        expect(result.tests[0].sections?.[0].cefrLevel).toBeUndefined();
        expect(result.tests[0].questions).toHaveLength(2);
    });

    it('skips a non-object entry in a list and reports an empty file', () => {
        const withJunk = parseTestData([null, { name: 'Real', questions: [baseQuestion] }]);
        expect(withJunk.tests).toHaveLength(1);
        expect(withJunk.tests[0].name).toBe('Real');

        const empty = parseTestData([null, 42]);
        expect(empty.tests).toEqual([]);
        expect(warningKeys(empty)).toEqual(['importTest.warn_no_tests']);
    });

    it('parses every grading norm shape and rejects broken tiers or rows', () => {
        const parse = (gradingNorm: unknown) =>
            parseTestJson(JSON.stringify({ name: 'N', questions: [baseQuestion], gradingNorm }));

        expect(parse({ type: 'scale' }).tests[0].gradingNorm).toEqual({ type: 'scale' });
        expect(parse({ type: 'nterm', n: 'x' }).warnings.map((w) => w.key)).toEqual(['importTest.warn_invalid_norm']);
        expect(parse({ type: 'caesura', passPoints: -1 }).warnings.map((w) => w.key)).toEqual([
            'importTest.warn_invalid_norm',
        ]);
        expect(parse('table').warnings.map((w) => w.key)).toEqual(['importTest.warn_invalid_norm']);

        const table = parse({
            type: 'table',
            tiers: [
                { id: 'y1', year: 'year-1', track: 'havo', label: 'Havo 1', passFrom: 'B' },
                { track: 'vwo' },
                'junk',
            ],
            rows: [
                { minPoints: 0, grades: { y1: 'IO', t2: 'B' } },
                { minPoints: 'nope', grades: { y1: 'E' } },
                { minPoints: 10, grades: { y1: true, t2: 7 } },
                { minPoints: 20 },
            ],
        }).tests[0];
        expect(table.gradingNorm).toEqual({
            type: 'table',
            tiers: [
                { id: 'y1', year: 'year-1', track: 'havo', label: 'Havo 1', passFrom: 'B' },
                { id: 'tier-2', track: 'vwo' },
            ],
            rows: [
                { minPoints: 0, grades: { y1: 'IO', t2: 'B' } },
                { minPoints: 10, grades: { t2: 7 } },
            ],
        });
    });

    it('remaps placement routing to the imported section ids, including forward references', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Placement',
                sections: [
                    { id: 's1', title: 'One', routing: { thresholdPct: 55, passSectionId: 's3', failSectionId: 's2' } },
                    { id: 's2', title: 'Two' },
                    { id: 's3', title: 'Three' },
                ],
                questions: [baseQuestion],
            })
        );

        const [one, two, three] = result.tests[0].sections!;
        expect(one.routing).toEqual({ thresholdPct: 55, passSectionId: three.id, failSectionId: two.id });
        expect([one.id, two.id, three.id]).not.toContain('s3');
        expect(warningKeys(result)).not.toContain('importTest.warn_invalid_routing');
    });

    it('drops a routing rule that points at a section the file does not have', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Placement',
                sections: [
                    {
                        id: 's1',
                        title: 'One',
                        routing: { thresholdPct: 55, passSectionId: 'gone', failSectionId: 's1' },
                    },
                ],
                questions: [baseQuestion],
            })
        );

        expect(result.tests[0].sections?.[0].routing).toBeUndefined();
        expect(warningKeys(result)).toContain('importTest.warn_invalid_routing');
    });

    it('skips nulls and primitives inside list fields instead of throwing', () => {
        const result = parseTestJson(
            JSON.stringify({
                name: 'Junk lists',
                questions: [
                    {
                        prompt: 'Matrix',
                        type: 'matrix',
                        points: 2,
                        matrixColumns: [null, { id: 'c1', text: 'Good' }],
                        matrixRows: [null, 3, { text: 'Row', correctColumnId: 'c1' }],
                    },
                    { prompt: 'Match', type: 'matching', points: 1, matchingPairs: [null, { left: 'l', right: 'r' }] },
                    { prompt: 'Order', type: 'ordering', points: 1, orderItems: [7, { text: 'first' }] },
                    {
                        prompt: 'Group',
                        type: 'categorize',
                        points: 1,
                        categories: [null, { id: 'cat1', label: 'Verbs' }],
                        categorizeItems: [null, { text: 'lopen', categoryId: 'cat1' }],
                    },
                    {
                        prompt: 'Pick',
                        type: 'multiple-choice',
                        points: 1,
                        options: [null, { text: 'yes', isCorrect: true }],
                    },
                ],
            })
        );

        const [matrix, matching, ordering, categorize, choice] = result.tests[0].questions;
        expect(matrix.matrixColumns).toHaveLength(1);
        expect(matrix.matrixRows).toHaveLength(1);
        expect(matrix.matrixRows?.[0].text).toBe('Row');
        expect(matrix.matrixRows?.[0].correctColumnId).toBe(matrix.matrixColumns?.[0].id);
        expect(matching.matchingPairs?.map((p) => p.left)).toEqual(['l']);
        expect(ordering.orderItems?.map((o) => o.text)).toEqual(['first']);
        expect(categorize.categories?.map((c) => c.label)).toEqual(['Verbs']);
        expect(categorize.categorizeItems?.map((ci) => ci.text)).toEqual(['lopen']);
        expect(choice.options?.map((o) => o.text)).toEqual(['yes']);
        expect(choice.options?.[0].isCorrect).toBe(true);
    });
});
