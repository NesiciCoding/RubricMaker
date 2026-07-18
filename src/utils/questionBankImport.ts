/**
 * questionBankImport.ts
 * Bulk-imports Question Bank items from a JSON file. JSON only — question types are too
 * structurally varied (options, matching pairs, categories, cloze gaps, ...) to round-trip
 * through a flat CSV the way flashcards/rubrics do.
 */

import { CEFR_LEVELS, CEFR_SKILLS } from '../data/cefrDescriptors';
import type {
    CefrLevel,
    CefrSkill,
    LinkedCefrDescriptor,
    LinkedStandard,
    QuestionBankItem,
    TestQuestion,
    TestQuestionType,
} from '../types';
import { nanoid } from './nanoid';

export type ParsedQuestionBankItem = Omit<QuestionBankItem, 'id' | 'createdAt' | 'updatedAt'>;

/** A translatable warning: `key` is a questionBank.import_warn_* locale key, `params` are its i18next interpolation values. */
export interface ImportWarning {
    key: string;
    params?: Record<string, string | number>;
}

export interface QuestionBankImportResult {
    items: ParsedQuestionBankItem[];
    warnings: ImportWarning[];
}

/** Files larger than this are rejected outright — a bulk import isn't meant to carry megabytes of prompt/passage HTML. */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
/** Caps the number of top-level bank items processed in one import, so a huge file can't freeze the tab while parsing/normalizing. */
const MAX_ITEMS = 500;

/** Shape of one question inside a question-bank JSON export — loosely typed since it's untrusted file input. */
interface RawQuestion {
    prompt?: string;
    type?: string;
    points?: number;
    options?: Array<{ text?: string; isCorrect?: boolean; imageUrl?: string }>;
    expectedAnswer?: string;
    expectedAnswers?: string[];
    expectedNumericValue?: number;
    numericTolerance?: number;
    correctBoolean?: boolean;
    matchingPairs?: Array<{ left?: string; right?: string }>;
    orderItems?: Array<{ text?: string }>;
    categories?: Array<{ label?: string }>;
    /** References a category by its 0-based index in `categories` (as a string) or by label. */
    categorizeItems?: Array<{ text?: string; categoryId?: string }>;
    hotTextPassage?: string;
    hotTextCorrectIndices?: number[];
    partialCredit?: boolean;
    linkedStandards?: Partial<LinkedStandard>[];
    linkedCefrDescriptors?: Partial<LinkedCefrDescriptor>[];
    imageUrl?: string;
    audioUrl?: string;
    hint?: string;
    linkedGrammarItemId?: string;
    explanation?: string;
    maxRecordingSeconds?: number;
}

/** Shape of a question bank JSON export — loosely typed since it's untrusted file input. */
interface RawQuestionBankJson {
    items?: Array<{
        tags?: string[];
        kind?: string;
        cefrLevel?: string;
        /** Present when kind is absent/'question'. */
        question?: RawQuestion;
        /** Present when kind === 'section'. */
        section?: {
            title?: string;
            content?: string;
            audioUrl?: string;
            questions?: RawQuestion[];
        };
    }>;
}

const VALID_TYPES: TestQuestionType[] = [
    'multiple-choice',
    'multiple-response',
    'true-false',
    'short-answer',
    'open',
    'cloze',
    'cloze-dropdown',
    'matching',
    'ordering',
    'categorize',
    'hot-text',
    'numeric',
    'audio-response',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses one raw question into a full TestQuestion, or returns null (with a warning) if it's unusable. */
function parseQuestion(q: unknown, label: string, warnings: ImportWarning[]): TestQuestion | null {
    if (!isPlainObject(q) || typeof q.prompt !== 'string' || !q.prompt.trim()) {
        warnings.push({ key: 'questionBank.import_warn_missing_prompt', params: { item: label } });
        return null;
    }
    const raw = q as RawQuestion;

    const type: TestQuestionType = VALID_TYPES.includes(raw.type as TestQuestionType)
        ? (raw.type as TestQuestionType)
        : 'multiple-choice';
    if (raw.type && type !== raw.type) {
        warnings.push({ key: 'questionBank.import_warn_unknown_type', params: { item: label, type: raw.type } });
    }

    const question: TestQuestion = {
        id: nanoid(),
        prompt: raw.prompt as string,
        type,
        points: typeof raw.points === 'number' && raw.points > 0 ? raw.points : 1,
    };

    if (Array.isArray(raw.options) && raw.options.length) {
        question.options = raw.options.map((o) => ({
            id: nanoid(),
            text: o.text ?? '',
            isCorrect: !!o.isCorrect,
            ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
        }));
        if (
            (type === 'multiple-choice' || type === 'multiple-response') &&
            !question.options.some((o) => o.isCorrect)
        ) {
            warnings.push({ key: 'questionBank.import_warn_no_correct_option', params: { item: label } });
        }
    }

    if (raw.expectedAnswers?.length) question.expectedAnswers = raw.expectedAnswers;
    else if (raw.expectedAnswer) question.expectedAnswer = raw.expectedAnswer;

    if (typeof raw.expectedNumericValue === 'number') question.expectedNumericValue = raw.expectedNumericValue;
    if (typeof raw.numericTolerance === 'number') question.numericTolerance = raw.numericTolerance;

    if (typeof raw.correctBoolean === 'boolean') question.correctBoolean = raw.correctBoolean;
    else if (type === 'true-false')
        warnings.push({ key: 'questionBank.import_warn_missing_correct_boolean', params: { item: label } });

    if (Array.isArray(raw.matchingPairs) && raw.matchingPairs.length) {
        question.matchingPairs = raw.matchingPairs.map((p) => ({
            id: nanoid(),
            left: p.left ?? '',
            right: p.right ?? '',
        }));
    }
    if (Array.isArray(raw.orderItems) && raw.orderItems.length) {
        question.orderItems = raw.orderItems.map((o) => ({ id: nanoid(), text: o.text ?? '' }));
    }

    if (Array.isArray(raw.categories) && raw.categories.length) {
        const categoryIds = raw.categories.map(() => nanoid());
        question.categories = raw.categories.map((c, ci) => ({ id: categoryIds[ci], label: c.label ?? '' }));
        const byRef = new Map<string, string>();
        raw.categories.forEach((c, ci) => {
            byRef.set(String(ci), categoryIds[ci]);
            if (c.label) byRef.set(c.label, categoryIds[ci]);
        });
        question.categorizeItems = (raw.categorizeItems ?? []).map((ci) => ({
            id: nanoid(),
            text: ci.text ?? '',
            categoryId: (ci.categoryId && byRef.get(ci.categoryId)) ?? '',
        }));
        if (question.categorizeItems.some((ci) => !ci.categoryId)) {
            warnings.push({ key: 'questionBank.import_warn_unknown_category', params: { item: label } });
        }
    }

    if (raw.hotTextPassage) question.hotTextPassage = raw.hotTextPassage;
    if (raw.hotTextCorrectIndices?.length) question.hotTextCorrectIndices = raw.hotTextCorrectIndices;
    if (typeof raw.partialCredit === 'boolean') question.partialCredit = raw.partialCredit;

    if (Array.isArray(raw.linkedStandards) && raw.linkedStandards.length) {
        question.linkedStandards = raw.linkedStandards.map((s) => ({
            guid: s.guid ?? '',
            description: s.description ?? '',
            standardSetTitle: s.standardSetTitle ?? '',
            jurisdictionTitle: s.jurisdictionTitle ?? '',
            statementNotation: s.statementNotation,
            ancestorIds: s.ancestorIds,
            depth: s.depth,
        }));
    }
    if (Array.isArray(raw.linkedCefrDescriptors) && raw.linkedCefrDescriptors.length) {
        const descriptors: LinkedCefrDescriptor[] = [];
        raw.linkedCefrDescriptors.forEach((d) => {
            const level = d.level as CefrLevel | undefined;
            const skill = d.skill as CefrSkill | undefined;
            if ((level && !CEFR_LEVELS.includes(level)) || (skill && !CEFR_SKILLS.includes(skill))) {
                warnings.push({ key: 'questionBank.import_warn_invalid_descriptor', params: { item: label } });
                return;
            }
            descriptors.push({
                descriptorId: d.descriptorId ?? '',
                level: level ?? 'A1',
                skill: skill ?? 'reading',
                descriptionEn: d.descriptionEn ?? '',
                descriptionNl: d.descriptionNl ?? '',
            });
        });
        if (descriptors.length) question.linkedCefrDescriptors = descriptors;
    }

    if (raw.imageUrl) question.imageUrl = raw.imageUrl;
    if (raw.audioUrl) question.audioUrl = raw.audioUrl;
    if (raw.hint) question.hint = raw.hint;
    if (raw.linkedGrammarItemId) question.linkedGrammarItemId = raw.linkedGrammarItemId;
    if (raw.explanation) question.explanation = raw.explanation;
    if (typeof raw.maxRecordingSeconds === 'number') question.maxRecordingSeconds = raw.maxRecordingSeconds;

    return question;
}

function parseCefrLevel(raw: string | undefined, label: string, warnings: ImportWarning[]): CefrLevel | undefined {
    if (!raw) return undefined;
    if (CEFR_LEVELS.includes(raw as CefrLevel)) return raw as CefrLevel;
    warnings.push({ key: 'questionBank.import_warn_unknown_cefr_level', params: { item: label, level: raw } });
    return undefined;
}

export function parseQuestionBankJson(text: string): QuestionBankImportResult {
    const warnings: ImportWarning[] = [];
    let data: RawQuestionBankJson;
    try {
        data = JSON.parse(text);
    } catch (err) {
        return {
            items: [],
            warnings: [
                {
                    key: 'questionBank.import_warn_parse_failed',
                    params: { message: err instanceof Error ? err.message : String(err) },
                },
            ],
        };
    }
    if (!isPlainObject(data) || !Array.isArray(data.items)) {
        return { items: [], warnings: [{ key: 'questionBank.import_warn_invalid_format' }] };
    }

    const rawItems = data.items;
    const truncated = rawItems.length > MAX_ITEMS;
    const itemsToProcess = truncated ? rawItems.slice(0, MAX_ITEMS) : rawItems;
    if (truncated) {
        warnings.push({
            key: 'questionBank.import_warn_too_many_items',
            params: { max: MAX_ITEMS, dropped: rawItems.length - MAX_ITEMS },
        });
    }

    const parsed: ParsedQuestionBankItem[] = [];

    itemsToProcess.forEach((raw, i) => {
        const label = `Item ${i + 1}`;
        if (!isPlainObject(raw)) {
            warnings.push({ key: 'questionBank.import_warn_malformed_item', params: { item: label } });
            return;
        }
        const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [];
        const cefrLevel = parseCefrLevel(raw.cefrLevel as string | undefined, label, warnings);

        if (raw.kind === 'section') {
            const section = raw.section;
            if (!isPlainObject(section) || typeof section.title !== 'string' || !section.title.trim()) {
                warnings.push({ key: 'questionBank.import_warn_missing_title', params: { item: label } });
                return;
            }
            const rawQuestions = Array.isArray(section.questions) ? section.questions : [];
            const questions = rawQuestions
                .map((rq, qi) => parseQuestion(rq, `${label} question ${qi + 1}`, warnings))
                .filter((q): q is TestQuestion => q !== null);
            if (questions.length === 0) {
                warnings.push({
                    key: 'questionBank.import_warn_no_valid_questions',
                    params: { item: label, title: section.title },
                });
                return;
            }
            parsed.push({
                kind: 'section',
                cefrLevel,
                section: {
                    title: section.title,
                    content: section.content as string | undefined,
                    audioUrl: section.audioUrl as string | undefined,
                    questions,
                },
                tags,
            });
            return;
        }

        const question = parseQuestion(raw.question, label, warnings);
        if (!question) return;
        parsed.push({ question, cefrLevel, tags });
    });

    return { items: parsed, warnings };
}

export async function parseQuestionBankFile(file: File): Promise<QuestionBankImportResult> {
    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    if (ext !== 'json') {
        return {
            items: [],
            warnings: [{ key: 'questionBank.import_warn_unsupported_file_type', params: { ext } }],
        };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
            items: [],
            warnings: [
                {
                    key: 'questionBank.import_warn_file_too_large',
                    params: {
                        sizeMb: Math.round((file.size / (1024 * 1024)) * 10) / 10,
                        maxMb: MAX_FILE_SIZE_BYTES / (1024 * 1024),
                    },
                },
            ],
        };
    }
    return parseQuestionBankJson(await file.text());
}
