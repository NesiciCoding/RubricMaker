/**
 * testImport.ts
 * Imports a RubricMaker test from a JSON file: a single test object, an array of tests, or a
 * full-backup export (which nests them under `tests`). Every section and question gets a fresh id
 * so an import never collides with (or half-merges into) an existing test in the same workspace.
 */

import { CEFR_LEVELS, CEFR_SKILLS } from '../data/cefrDescriptors';
import { parseGrammarIdList } from './grammarLinks';
import type {
    CefrLevel,
    CefrSkill,
    GeneratorConfig,
    Test,
    TestCategory,
    TestGradingNorm,
    MatrixColumn,
    TestNormTableRow,
    TestNormTier,
    TestOption,
    TestQuestion,
    TestQuestionType,
    TestSection,
} from '../types';
import type { ImportWarning } from './questionBankImport';
import { nanoid } from './nanoid';
import { isDocumentImportFile } from './import/extractBlocks';
import { importTestDocument, type DocumentReview } from './import/draftImport';

/** A test stripped of the ids and timestamps the store assigns on insert. */
export type ImportedTest = Omit<Test, 'id' | 'createdAt' | 'updatedAt'>;

export interface TestImportResult {
    tests: ImportedTest[];
    warnings: ImportWarning[];
    /** Present when the file was a .docx or .pdf: what the layout detector recognised in it. */
    review?: DocumentReview;
}

/** Files larger than this are rejected outright — a test is text, not megabytes of embedded media. */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
/** Caps how many tests one file can bring in, so a huge file can't freeze the tab. */
const MAX_TESTS = 25;
/** Caps the questions per test, matching the question-bank importer's per-file ceiling. */
const MAX_QUESTIONS = 500;

const VALID_TYPES: TestQuestionType[] = [
    'multiple-choice',
    'multiple-response',
    'true-false',
    'short-answer',
    'open',
    'cloze',
    'cloze-dropdown',
    'cloze-bank',
    'matrix',
    'dictation',
    'key-word-transformation',
    'error-correction',
    'sentence-builder',
    'matching',
    'ordering',
    'categorize',
    'hot-text',
    'numeric',
    'audio-response',
];

const CLOZE_TYPES: TestQuestionType[] = ['cloze', 'cloze-dropdown', 'cloze-bank'];

/** Untrusted file input: every field is optional and only the shapes this importer reads are typed. */
interface RawQuestion {
    id?: unknown;
    sectionId?: unknown;
    prompt?: unknown;
    type?: unknown;
    points?: unknown;
    options?: RawOption[];
    expectedAnswer?: unknown;
    expectedAnswers?: unknown;
    expectedNumericValue?: unknown;
    numericTolerance?: unknown;
    correctBoolean?: unknown;
    matrixColumns?: RawMatrixColumn[];
    matrixRows?: RawMatrixRow[];
    bankDistractors?: unknown;
    bankUniqueUse?: unknown;
    matchingPairs?: RawPair[];
    orderItems?: RawTextItem[];
    categories?: RawCategory[];
    categorizeItems?: RawCategorizeItem[];
    hotTextPassage?: unknown;
    hotTextCorrectIndices?: unknown;
    partialCredit?: unknown;
    answerTolerance?: unknown;
    imageUrl?: unknown;
    audioUrl?: unknown;
    hint?: unknown;
    linkedGrammarItemId?: unknown;
    explanation?: unknown;
    maxRecordingSeconds?: unknown;
    maxPlays?: unknown;
    prepSeconds?: unknown;
    cueBullets?: unknown;
    rubricId?: unknown;
    spokenText?: unknown;
    transcript?: unknown;
    errorPassage?: unknown;
    penaliseFalsePicks?: unknown;
    sentenceTargets?: unknown;
    builderScoring?: unknown;
    keyWord?: unknown;
    gappedSentence?: unknown;
    answerWordLimit?: unknown;
    wordFormation?: unknown;
    dictationText?: unknown;
    eloRating?: unknown;
    linkedStandards?: unknown;
    linkedCefrDescriptors?: unknown;
    frameworkDescriptors?: unknown;
}

interface RawOption {
    id?: unknown;
    text?: unknown;
    isCorrect?: unknown;
    imageUrl?: unknown;
    audioUrl?: unknown;
    spokenText?: unknown;
}

interface RawMatrixColumn {
    id?: unknown;
    text?: unknown;
}

interface RawMatrixRow {
    id?: unknown;
    text?: unknown;
    correctColumnId?: unknown;
}

interface RawPair {
    id?: unknown;
    left?: unknown;
    right?: unknown;
}

interface RawTextItem {
    id?: unknown;
    text?: unknown;
}

interface RawCategory {
    id?: unknown;
    label?: unknown;
}

interface RawCategorizeItem {
    id?: unknown;
    text?: unknown;
    categoryId?: unknown;
}

interface RawSection {
    id?: unknown;
    title?: unknown;
    content?: unknown;
    audioUrl?: unknown;
    maxPlays?: unknown;
    spokenText?: unknown;
    transcript?: unknown;
    cefrLevel?: unknown;
    routing?: unknown;
}

interface RawTest {
    name?: unknown;
    description?: unknown;
    questions?: unknown;
    sections?: unknown;
    durationMinutes?: unknown;
    requireSEB?: unknown;
    shuffleQuestions?: unknown;
    gradeScaleId?: unknown;
    dueDate?: unknown;
    printHeader?: unknown;
    printIntro?: unknown;
    printFooter?: unknown;
    mode?: unknown;
    placementEngine?: unknown;
    generatorConfig?: unknown;
    allowMultipleAttempts?: unknown;
    cefrTargetLevel?: unknown;
    cefrSkill?: unknown;
    contentArea?: unknown;
    contentLanguage?: unknown;
    gradingNorm?: unknown;
    gradeDecimals?: unknown;
    passGrade?: unknown;
    scoreOnly?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const asFiniteNumber = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function asStringArray(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out = v.filter((s): s is string => typeof s === 'string');
    return out.length ? out : undefined;
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

/** The elements of an array from a file are untrusted as well: a `null` in `options` must not throw. */
function asRecords<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value.filter(isRecord) as T[]) : [];
}

/** A routing rule resolved after every section has its imported id (a rule may point forward). */
interface PendingRouting {
    section: TestSection;
    thresholdPct: number;
    passRef: string;
    failRef: string;
}

/**
 * Parses an exported test file. Never throws: unreadable or unrecognised files come back as an empty
 * result plus warnings, so the dialog can explain what went wrong.
 *
 * A paper is a document rather than an export, so .docx and .pdf take the detection path: read the
 * blocks, find the sections and items, pair the answer key, infer the types. A JSON export keeps its
 * exact parse, because it is already RubricMaker's own shape and needs no guessing.
 */
export async function parseTestFile(file: File): Promise<TestImportResult> {
    if (isDocumentImportFile(file)) return importTestDocument(file);
    if (!file.name.toLowerCase().endsWith('.json')) {
        return {
            tests: [],
            warnings: [{ key: 'importTest.warn_unsupported_file_type', params: { ext: extensionOf(file.name) } }],
        };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
            tests: [],
            warnings: [
                {
                    key: 'importTest.warn_file_too_large',
                    params: { sizeMb: (file.size / 1024 / 1024).toFixed(1), maxMb: MAX_FILE_SIZE_BYTES / 1024 / 1024 },
                },
            ],
        };
    }
    return parseTestJson(await file.text(), file.name.replace(/\.[^.]+$/, ''));
}

function extensionOf(name: string): string {
    return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

/** Parses the JSON text itself — the same code path the file picker uses, so tests can feed strings. */
export function parseTestJson(text: string, fallbackName = ''): TestImportResult {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { tests: [], warnings: [{ key: 'importTest.warn_parse_failed', params: { message } }] };
    }
    return parseTestData(data, fallbackName);
}

/** Accepts a single test, an array of tests, or a full-backup export (`{ tests: [...] }`). */
export function parseTestData(data: unknown, fallbackName = ''): TestImportResult {
    let rawTests: unknown[];
    if (Array.isArray(data)) rawTests = data;
    else if (isRecord(data) && Array.isArray(data.tests)) rawTests = data.tests;
    else if (isRecord(data) && Array.isArray(data.questions)) rawTests = [data];
    else if (isRecord(data) && Array.isArray(data.items)) {
        // The question-bank format and the test format are different files; say so instead of
        // importing a test with every question missing.
        return { tests: [], warnings: [{ key: 'importTest.warn_looks_like_question_bank' }] };
    } else {
        return { tests: [], warnings: [{ key: 'importTest.warn_invalid_format' }] };
    }

    const warnings: ImportWarning[] = [];
    if (rawTests.length > MAX_TESTS) {
        warnings.push({
            key: 'importTest.warn_too_many_tests',
            params: { max: MAX_TESTS, dropped: rawTests.length - MAX_TESTS },
        });
    }

    const tests: ImportedTest[] = [];
    rawTests.slice(0, MAX_TESTS).forEach((raw, i) => {
        const test = isRecord(raw) ? normaliseTest(raw as RawTest, fallbackName, i, warnings) : null;
        if (test) tests.push(test);
    });

    if (tests.length === 0 && warnings.length === 0) warnings.push({ key: 'importTest.warn_no_tests' });
    return { tests, warnings };
}

function normaliseTest(
    raw: RawTest,
    fallbackName: string,
    index: number,
    warnings: ImportWarning[]
): ImportedTest | null {
    const name = asString(raw.name) ?? (fallbackName || `Test ${index + 1}`);
    if (Array.isArray(raw.questions) && raw.questions.length > MAX_QUESTIONS) {
        warnings.push({
            key: 'importTest.warn_too_many_questions',
            params: { name, max: MAX_QUESTIONS, dropped: raw.questions.length - MAX_QUESTIONS },
        });
    }
    const rawQuestions = (Array.isArray(raw.questions) ? raw.questions : []).slice(0, MAX_QUESTIONS);
    if (rawQuestions.length === 0) warnings.push({ key: 'importTest.warn_test_without_questions', params: { name } });

    // Sections first: a question's sectionId has to point at a section that will really exist.
    const sectionIds = new Map<string, string>();
    const pendingRouting: PendingRouting[] = [];
    const sections: TestSection[] = (Array.isArray(raw.sections) ? raw.sections : [])
        .filter(isRecord)
        .map((s: RawSection, si) => normaliseSection(s, si, sectionIds, name, warnings, pendingRouting));

    // Placement routing points at sibling sections by their ids in the file. Every section gets a fresh
    // id, and a rule may target a section further down, so resolve the references in a second pass.
    for (const pending of pendingRouting) {
        const passSectionId = sectionIds.get(pending.passRef);
        const failSectionId = sectionIds.get(pending.failRef);
        if (passSectionId && failSectionId) {
            pending.section.routing = { thresholdPct: pending.thresholdPct, passSectionId, failSectionId };
        } else {
            warnings.push({ key: 'importTest.warn_invalid_routing', params: { name, title: pending.section.title } });
        }
    }

    const questions: TestQuestion[] = [];
    rawQuestions.forEach((q, qi) => {
        const question = normaliseQuestion(q, qi, sectionIds, name, warnings);
        if (question) questions.push(question);
    });

    const test: ImportedTest = {
        name,
        requireSEB: raw.requireSEB === true,
        shuffleQuestions: raw.shuffleQuestions === true,
        questions,
        ...(sections.length ? { sections } : {}),
    };

    if (typeof raw.description === 'string') test.description = raw.description;
    const durationMinutes = asFiniteNumber(raw.durationMinutes);
    if (durationMinutes !== undefined && durationMinutes > 0) test.durationMinutes = durationMinutes;
    if (typeof raw.gradeScaleId === 'string') test.gradeScaleId = raw.gradeScaleId;
    if (typeof raw.dueDate === 'string') test.dueDate = raw.dueDate;
    if (typeof raw.printHeader === 'string') test.printHeader = raw.printHeader;
    if (typeof raw.printIntro === 'string') test.printIntro = raw.printIntro;
    if (typeof raw.printFooter === 'string') test.printFooter = raw.printFooter;
    if (raw.mode === 'practice' || raw.mode === 'assessment' || raw.mode === 'placement') test.mode = raw.mode;
    if (raw.placementEngine === 'mst' || raw.placementEngine === 'staircase' || raw.placementEngine === 'generator') {
        test.placementEngine = raw.placementEngine;
    }
    const generatorConfig = parseGeneratorConfig(raw.generatorConfig);
    if (generatorConfig) test.generatorConfig = generatorConfig;
    if (raw.allowMultipleAttempts === true) test.allowMultipleAttempts = true;
    const cefrTargetLevel = parseCefrLevel(raw.cefrTargetLevel, 'cefrTargetLevel', name, warnings);
    if (cefrTargetLevel) test.cefrTargetLevel = cefrTargetLevel;
    const cefrSkill = parseCefrSkill(raw.cefrSkill, name, warnings);
    if (cefrSkill) test.cefrSkill = cefrSkill;
    if (raw.contentArea === 'listening' || raw.contentArea === 'reading' || raw.contentArea === 'grammar') {
        test.contentArea = raw.contentArea;
    }
    if (typeof raw.contentLanguage === 'string' && raw.contentLanguage) test.contentLanguage = raw.contentLanguage;
    const gradingNorm = parseGradingNorm(raw.gradingNorm, name, warnings);
    if (gradingNorm) test.gradingNorm = gradingNorm;
    if (raw.gradeDecimals === 0 || raw.gradeDecimals === 1 || raw.gradeDecimals === 2) {
        test.gradeDecimals = raw.gradeDecimals;
    }
    const passGrade = asFiniteNumber(raw.passGrade);
    if (passGrade !== undefined && passGrade >= 1 && passGrade <= 10) test.passGrade = passGrade;
    if (raw.scoreOnly === true) test.scoreOnly = true;

    // folderId/displayOrder/sharing are workspace-specific: importing them would file the test into a
    // folder (or expose it to students) that only makes sense in the source workspace.
    return test;
}

function normaliseSection(
    raw: RawSection,
    index: number,
    sectionIds: Map<string, string>,
    testName: string,
    warnings: ImportWarning[],
    pendingRouting: PendingRouting[]
): TestSection {
    const id = nanoid();
    if (typeof raw.id === 'string') sectionIds.set(raw.id, id);
    const section: TestSection = { id, title: asString(raw.title) ?? `Section ${index + 1}` };
    if (typeof raw.content === 'string') section.content = raw.content;
    if (typeof raw.audioUrl === 'string') section.audioUrl = raw.audioUrl;
    const maxPlays = asFiniteNumber(raw.maxPlays);
    if (maxPlays !== undefined && maxPlays > 0) section.maxPlays = maxPlays;
    if (typeof raw.spokenText === 'string') section.spokenText = raw.spokenText;
    if (typeof raw.transcript === 'string') section.transcript = raw.transcript;
    const cefrLevel = parseCefrLevel(raw.cefrLevel, `section "${section.title}"`, testName, warnings);
    if (cefrLevel) section.cefrLevel = cefrLevel;
    if (isRecord(raw.routing)) {
        const thresholdPct = asFiniteNumber(raw.routing.thresholdPct);
        const passRef = asOptionalString(raw.routing.passSectionId);
        const failRef = asOptionalString(raw.routing.failSectionId);
        if (thresholdPct !== undefined && passRef && failRef) {
            pendingRouting.push({ section, thresholdPct, passRef, failRef });
        } else {
            warnings.push({ key: 'importTest.warn_invalid_routing', params: { name: testName, title: section.title } });
        }
    }
    return section;
}

function normaliseQuestion(
    raw: unknown,
    index: number,
    sectionIds: Map<string, string>,
    testName: string,
    warnings: ImportWarning[]
): TestQuestion | null {
    const label = `${testName} · question ${index + 1}`;
    if (!isRecord(raw)) {
        warnings.push({ key: 'importTest.warn_malformed_question', params: { item: label } });
        return null;
    }
    const q = raw as RawQuestion;
    const type = VALID_TYPES.includes(q.type as TestQuestionType) ? (q.type as TestQuestionType) : undefined;
    if (!type) {
        warnings.push({ key: 'importTest.warn_unknown_type', params: { item: label, type: String(q.type ?? '') } });
        return null;
    }
    const prompt = asString(q.prompt);
    if (!prompt) {
        warnings.push({ key: 'importTest.warn_missing_prompt', params: { item: label } });
        return null;
    }
    const points = asFiniteNumber(q.points);
    if (points === undefined || points <= 0) {
        warnings.push({ key: 'importTest.warn_bad_points', params: { item: label, points: String(q.points ?? 0) } });
    }

    const question: TestQuestion = {
        id: nanoid(),
        prompt,
        type,
        points: points !== undefined && points > 0 ? points : 1,
    };

    const sectionId = asOptionalString(q.sectionId);
    if (sectionId) {
        const mapped = sectionIds.get(sectionId);
        if (mapped) question.sectionId = mapped;
        else warnings.push({ key: 'importTest.warn_unknown_section', params: { item: label, section: sectionId } });
    }

    const rawOptions = asRecords<RawOption>(q.options);
    if (rawOptions.length) {
        question.options = rawOptions.map((o: RawOption): TestOption => {
            const option: TestOption = {
                id: nanoid(),
                text: typeof o.text === 'string' ? o.text : '',
                isCorrect: o.isCorrect === true,
            };
            if (typeof o.imageUrl === 'string') option.imageUrl = o.imageUrl;
            if (typeof o.audioUrl === 'string') option.audioUrl = o.audioUrl;
            if (typeof o.spokenText === 'string') option.spokenText = o.spokenText;
            return option;
        });
        if (
            (type === 'multiple-choice' || type === 'multiple-response') &&
            !question.options.some((o) => o.isCorrect)
        ) {
            warnings.push({ key: 'importTest.warn_no_correct_option', params: { item: label } });
        }
    }

    const expectedAnswers = asStringArray(q.expectedAnswers);
    if (expectedAnswers) question.expectedAnswers = expectedAnswers;
    else if (typeof q.expectedAnswer === 'string') question.expectedAnswer = q.expectedAnswer;
    const expectedNumericValue = asFiniteNumber(q.expectedNumericValue);
    if (expectedNumericValue !== undefined) question.expectedNumericValue = expectedNumericValue;
    const numericTolerance = asFiniteNumber(q.numericTolerance);
    if (numericTolerance !== undefined && numericTolerance >= 0) question.numericTolerance = numericTolerance;
    if (typeof q.correctBoolean === 'boolean') question.correctBoolean = q.correctBoolean;
    else if (type === 'true-false')
        warnings.push({ key: 'importTest.warn_missing_correct_boolean', params: { item: label } });

    const rawColumns = asRecords<RawMatrixColumn>(q.matrixColumns);
    if (rawColumns.length) {
        const columnIds = rawColumns.map(() => nanoid());
        const byRef = new Map<string, string>();
        question.matrixColumns = rawColumns.map((c: RawMatrixColumn, ci): MatrixColumn => {
            if (typeof c.id === 'string') byRef.set(c.id, columnIds[ci]);
            return { id: columnIds[ci], text: typeof c.text === 'string' ? c.text : '' };
        });
        question.matrixRows = asRecords<RawMatrixRow>(q.matrixRows).map((r: RawMatrixRow) => {
            const ref = asOptionalString(r.correctColumnId) ?? '';
            return {
                id: nanoid(),
                text: typeof r.text === 'string' ? r.text : '',
                correctColumnId: byRef.get(ref) ?? '',
            };
        });
        if (question.matrixRows.some((r) => !r.correctColumnId)) {
            warnings.push({ key: 'importTest.warn_unknown_column', params: { item: label } });
        }
    }

    const rawPairs = asRecords<RawPair>(q.matchingPairs);
    if (rawPairs.length) {
        question.matchingPairs = rawPairs.map((p: RawPair) => ({
            id: nanoid(),
            left: typeof p.left === 'string' ? p.left : '',
            right: typeof p.right === 'string' ? p.right : '',
        }));
    }
    const rawOrderItems = asRecords<RawTextItem>(q.orderItems);
    if (rawOrderItems.length) {
        question.orderItems = rawOrderItems.map((o: RawTextItem) => ({
            id: nanoid(),
            text: typeof o.text === 'string' ? o.text : '',
        }));
    }
    const rawCategories = asRecords<RawCategory>(q.categories);
    if (rawCategories.length) {
        const categoryIds = rawCategories.map(() => nanoid());
        const byRef = new Map<string, string>();
        question.categories = rawCategories.map((c: RawCategory, ci): TestCategory => {
            if (typeof c.id === 'string') byRef.set(c.id, categoryIds[ci]);
            return { id: categoryIds[ci], label: typeof c.label === 'string' ? c.label : '' };
        });
        question.categorizeItems = asRecords<RawCategorizeItem>(q.categorizeItems).map((ci: RawCategorizeItem) => {
            const ref = asOptionalString(ci.categoryId) ?? '';
            return {
                id: nanoid(),
                text: typeof ci.text === 'string' ? ci.text : '',
                categoryId: byRef.get(ref) ?? '',
            };
        });
        if (question.categorizeItems.some((ci) => !ci.categoryId)) {
            warnings.push({ key: 'importTest.warn_unknown_category', params: { item: label } });
        }
    }

    if (typeof q.hotTextPassage === 'string') question.hotTextPassage = q.hotTextPassage;
    const hotTextIndices = Array.isArray(q.hotTextCorrectIndices)
        ? q.hotTextCorrectIndices.filter((i): i is number => typeof i === 'number' && Number.isInteger(i))
        : undefined;
    if (hotTextIndices?.length) question.hotTextCorrectIndices = hotTextIndices;
    if (CLOZE_TYPES.includes(type) && !/\{\{.*?\}\}/.test(prompt)) {
        warnings.push({ key: 'importTest.warn_cloze_without_gap', params: { item: label } });
    }

    if (typeof q.partialCredit === 'boolean') question.partialCredit = q.partialCredit;
    const tolerance = parseAnswerTolerance(q.answerTolerance);
    if (tolerance) question.answerTolerance = tolerance;
    if (Array.isArray(q.linkedStandards))
        question.linkedStandards = q.linkedStandards as TestQuestion['linkedStandards'];
    if (Array.isArray(q.linkedCefrDescriptors)) {
        question.linkedCefrDescriptors = q.linkedCefrDescriptors as TestQuestion['linkedCefrDescriptors'];
    }
    if (Array.isArray(q.frameworkDescriptors)) {
        question.frameworkDescriptors = q.frameworkDescriptors as TestQuestion['frameworkDescriptors'];
    }
    if (typeof q.imageUrl === 'string') question.imageUrl = q.imageUrl;
    if (typeof q.audioUrl === 'string') question.audioUrl = q.audioUrl;
    if (typeof q.hint === 'string') question.hint = q.hint;
    {
        const multi = parseGrammarIdList((q as Record<string, unknown>).linkedGrammarItemIds ?? q.linkedGrammarItemId);
        if (multi.length > 0) {
            question.linkedGrammarItemIds = multi;
            question.linkedGrammarItemId = multi[0];
        }
    }
    if (typeof q.explanation === 'string') question.explanation = q.explanation;
    if (typeof q.rubricId === 'string') question.rubricId = q.rubricId;
    const maxRecordingSeconds = asFiniteNumber(q.maxRecordingSeconds);
    if (maxRecordingSeconds !== undefined && maxRecordingSeconds > 0)
        question.maxRecordingSeconds = maxRecordingSeconds;
    const maxPlays = asFiniteNumber(q.maxPlays);
    if (maxPlays !== undefined && maxPlays > 0) question.maxPlays = maxPlays;
    const prepSeconds = asFiniteNumber(q.prepSeconds);
    if (prepSeconds !== undefined && prepSeconds > 0) question.prepSeconds = prepSeconds;
    const cueBullets = asStringArray(q.cueBullets);
    if (cueBullets) question.cueBullets = cueBullets;
    if (typeof q.spokenText === 'string') question.spokenText = q.spokenText;
    if (typeof q.transcript === 'string') question.transcript = q.transcript;
    if (typeof q.errorPassage === 'string') question.errorPassage = q.errorPassage;
    if (q.penaliseFalsePicks === true) question.penaliseFalsePicks = true;
    const sentenceTargets = asStringArray(q.sentenceTargets);
    if (sentenceTargets) question.sentenceTargets = sentenceTargets;
    if (q.builderScoring === 'longest-run' || q.builderScoring === 'all-or-nothing') {
        question.builderScoring = q.builderScoring;
    }
    if (typeof q.keyWord === 'string' && q.keyWord) question.keyWord = q.keyWord;
    if (typeof q.gappedSentence === 'string' && q.gappedSentence) question.gappedSentence = q.gappedSentence;
    if (isRecord(q.answerWordLimit)) {
        const min = asFiniteNumber(q.answerWordLimit.min);
        const max = asFiniteNumber(q.answerWordLimit.max);
        if (min !== undefined && max !== undefined && min >= 1 && max >= min) {
            question.answerWordLimit = { min, max };
        }
    }
    if (q.wordFormation === true) question.wordFormation = true;
    if (typeof q.dictationText === 'string') question.dictationText = q.dictationText;
    const eloRating = asFiniteNumber(q.eloRating);
    if (eloRating !== undefined) question.eloRating = eloRating;
    const bankDistractors = asStringArray(q.bankDistractors);
    if (bankDistractors) question.bankDistractors = bankDistractors;
    if (typeof q.bankUniqueUse === 'boolean') question.bankUniqueUse = q.bankUniqueUse;

    return question;
}

function parseAnswerTolerance(raw: unknown): TestQuestion['answerTolerance'] | undefined {
    if (!isRecord(raw)) return undefined;
    const tolerance: NonNullable<TestQuestion['answerTolerance']> = {};
    if (raw.punctuation === true) tolerance.punctuation = true;
    if (raw.contractions === true) tolerance.contractions = true;
    if (raw.spelling === true) tolerance.spelling = true;
    if (raw.slips === true) tolerance.slips = true;
    return Object.keys(tolerance).length ? tolerance : undefined;
}

function parseCefrLevel(
    raw: unknown,
    what: string,
    testName: string,
    warnings: ImportWarning[]
): CefrLevel | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw === 'string' && (CEFR_LEVELS as readonly string[]).includes(raw)) return raw as CefrLevel;
    warnings.push({
        key: 'importTest.warn_unknown_cefr_level',
        params: { name: testName, target: what, level: String(raw) },
    });
    return undefined;
}

function parseCefrSkill(raw: unknown, testName: string, warnings: ImportWarning[]): CefrSkill | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw === 'string' && (CEFR_SKILLS as readonly string[]).includes(raw)) return raw as CefrSkill;
    warnings.push({ key: 'importTest.warn_unknown_cefr_skill', params: { name: testName, skill: String(raw) } });
    return undefined;
}

function parseGeneratorConfig(raw: unknown): GeneratorConfig | undefined {
    if (!isRecord(raw)) return undefined;
    const minCefrLevel = parseCefrLevelValue(raw.minCefrLevel);
    const maxCefrLevel = parseCefrLevelValue(raw.maxCefrLevel);
    const minQuestions = asFiniteNumber(raw.minQuestions);
    const maxQuestions = asFiniteNumber(raw.maxQuestions);
    if (!minCefrLevel || !maxCefrLevel || minQuestions === undefined || maxQuestions === undefined) return undefined;
    if (minQuestions < 1 || maxQuestions < minQuestions) return undefined;
    const config: GeneratorConfig = { minCefrLevel, maxCefrLevel, minQuestions, maxQuestions };
    const skills = Array.isArray(raw.skills)
        ? raw.skills.filter((s): s is NonNullable<GeneratorConfig['skills']>[number] => typeof s === 'string')
        : [];
    if (skills.length) config.skills = skills;
    const tags = asStringArray(raw.tags);
    if (tags) config.tags = tags;
    if (typeof raw.starterBankItemId === 'string' && raw.starterBankItemId) {
        config.starterBankItemId = raw.starterBankItemId;
    }
    return config;
}

function parseCefrLevelValue(raw: unknown): CefrLevel | undefined {
    return typeof raw === 'string' && (CEFR_LEVELS as readonly string[]).includes(raw) ? (raw as CefrLevel) : undefined;
}

function parseGradingNorm(raw: unknown, testName: string, warnings: ImportWarning[]): TestGradingNorm | undefined {
    if (raw === undefined) return undefined;
    if (!isRecord(raw)) {
        warnings.push({ key: 'importTest.warn_invalid_norm', params: { name: testName } });
        return undefined;
    }
    if (raw.type === 'scale') return { type: 'scale' };
    const n = asFiniteNumber(raw.n);
    if (raw.type === 'nterm' && n !== undefined && n >= 0 && n <= 2) return { type: 'nterm', n };
    const passPoints = asFiniteNumber(raw.passPoints);
    if (raw.type === 'caesura' && passPoints !== undefined && passPoints >= 0) return { type: 'caesura', passPoints };
    if (raw.type === 'table') {
        const tiers = parseNormTiers(raw.tiers);
        const rows = parseNormRows(raw.rows);
        if (tiers.length && rows.length) return { type: 'table', tiers, rows };
    }
    warnings.push({ key: 'importTest.warn_invalid_norm', params: { name: testName } });
    return undefined;
}

function parseNormTiers(raw: unknown): TestNormTier[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).map((t, i): TestNormTier => {
        const tier: TestNormTier = { id: typeof t.id === 'string' && t.id ? t.id : `tier-${i + 1}` };
        if (typeof t.year === 'string') tier.year = t.year as TestNormTier['year'];
        if (typeof t.track === 'string') tier.track = t.track as TestNormTier['track'];
        if (typeof t.label === 'string') tier.label = t.label;
        if (typeof t.passFrom === 'string') tier.passFrom = t.passFrom;
        return tier;
    });
}

function parseNormRows(raw: unknown): TestNormTableRow[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord).flatMap((r) => {
        const minPoints = asFiniteNumber(r.minPoints);
        if (minPoints === undefined || !isRecord(r.grades)) return [];
        const grades: Record<string, number | string> = {};
        for (const [tierId, grade] of Object.entries(r.grades)) {
            if (typeof grade === 'string' || (typeof grade === 'number' && Number.isFinite(grade)))
                grades[tierId] = grade;
        }
        return [{ minPoints, grades }];
    });
}
