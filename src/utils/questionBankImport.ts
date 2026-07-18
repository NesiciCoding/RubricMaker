/**
 * questionBankImport.ts
 * Bulk-imports Question Bank items from a JSON file. JSON only — question types are too
 * structurally varied (options, matching pairs, categories, cloze gaps, ...) to round-trip
 * through a flat CSV the way flashcards/rubrics do.
 */

import { CEFR_LEVELS } from '../data/cefrDescriptors';
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

export interface QuestionBankImportResult {
    items: ParsedQuestionBankItem[];
    warnings: string[];
}

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

/** Parses one raw question into a full TestQuestion, or returns null (with a warning) if it's unusable. */
function parseQuestion(q: RawQuestion | undefined, label: string, warnings: string[]): TestQuestion | null {
    if (!q || !q.prompt || !q.prompt.trim()) {
        warnings.push(`${label}: skipped — missing prompt.`);
        return null;
    }

    const type: TestQuestionType = VALID_TYPES.includes(q.type as TestQuestionType)
        ? (q.type as TestQuestionType)
        : 'multiple-choice';
    if (q.type && type !== q.type) {
        warnings.push(`${label}: unknown type "${q.type}", defaulted to multiple-choice.`);
    }

    const question: TestQuestion = {
        id: nanoid(),
        prompt: q.prompt,
        type,
        points: typeof q.points === 'number' && q.points > 0 ? q.points : 1,
    };

    if (q.options?.length) {
        question.options = q.options.map((o) => ({
            id: nanoid(),
            text: o.text ?? '',
            isCorrect: !!o.isCorrect,
            ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
        }));
        if ((type === 'multiple-choice' || type === 'multiple-response') && !question.options.some((o) => o.isCorrect)) {
            warnings.push(`${label}: no correct option marked.`);
        }
    }

    if (q.expectedAnswers?.length) question.expectedAnswers = q.expectedAnswers;
    else if (q.expectedAnswer) question.expectedAnswer = q.expectedAnswer;

    if (typeof q.expectedNumericValue === 'number') question.expectedNumericValue = q.expectedNumericValue;
    if (typeof q.numericTolerance === 'number') question.numericTolerance = q.numericTolerance;

    if (typeof q.correctBoolean === 'boolean') question.correctBoolean = q.correctBoolean;
    else if (type === 'true-false') warnings.push(`${label}: true-false question missing correctBoolean.`);

    if (q.matchingPairs?.length) {
        question.matchingPairs = q.matchingPairs.map((p) => ({ id: nanoid(), left: p.left ?? '', right: p.right ?? '' }));
    }
    if (q.orderItems?.length) {
        question.orderItems = q.orderItems.map((o) => ({ id: nanoid(), text: o.text ?? '' }));
    }

    if (q.categories?.length) {
        const categoryIds = q.categories.map(() => nanoid());
        question.categories = q.categories.map((c, ci) => ({ id: categoryIds[ci], label: c.label ?? '' }));
        const byRef = new Map<string, string>();
        q.categories.forEach((c, ci) => {
            byRef.set(String(ci), categoryIds[ci]);
            if (c.label) byRef.set(c.label, categoryIds[ci]);
        });
        question.categorizeItems = (q.categorizeItems ?? []).map((ci) => ({
            id: nanoid(),
            text: ci.text ?? '',
            categoryId: (ci.categoryId && byRef.get(ci.categoryId)) ?? '',
        }));
        if (question.categorizeItems.some((ci) => !ci.categoryId)) {
            warnings.push(`${label}: a categorize item references an unknown category.`);
        }
    }

    if (q.hotTextPassage) question.hotTextPassage = q.hotTextPassage;
    if (q.hotTextCorrectIndices?.length) question.hotTextCorrectIndices = q.hotTextCorrectIndices;
    if (typeof q.partialCredit === 'boolean') question.partialCredit = q.partialCredit;

    if (q.linkedStandards?.length) {
        question.linkedStandards = q.linkedStandards.map((s) => ({
            guid: s.guid ?? '',
            description: s.description ?? '',
            standardSetTitle: s.standardSetTitle ?? '',
            jurisdictionTitle: s.jurisdictionTitle ?? '',
            statementNotation: s.statementNotation,
            ancestorIds: s.ancestorIds,
            depth: s.depth,
        }));
    }
    if (q.linkedCefrDescriptors?.length) {
        question.linkedCefrDescriptors = q.linkedCefrDescriptors.map((d) => ({
            descriptorId: d.descriptorId ?? '',
            level: (d.level as CefrLevel) ?? 'A1',
            skill: (d.skill as CefrSkill) ?? 'reading',
            descriptionEn: d.descriptionEn ?? '',
            descriptionNl: d.descriptionNl ?? '',
        }));
    }

    if (q.imageUrl) question.imageUrl = q.imageUrl;
    if (q.audioUrl) question.audioUrl = q.audioUrl;
    if (q.hint) question.hint = q.hint;
    if (q.linkedGrammarItemId) question.linkedGrammarItemId = q.linkedGrammarItemId;
    if (q.explanation) question.explanation = q.explanation;
    if (typeof q.maxRecordingSeconds === 'number') question.maxRecordingSeconds = q.maxRecordingSeconds;

    return question;
}

function parseCefrLevel(raw: string | undefined, label: string, warnings: string[]): CefrLevel | undefined {
    if (!raw) return undefined;
    if (CEFR_LEVELS.includes(raw as CefrLevel)) return raw as CefrLevel;
    warnings.push(`${label}: unknown cefrLevel "${raw}", ignored.`);
    return undefined;
}

export function parseQuestionBankJson(text: string): QuestionBankImportResult {
    const warnings: string[] = [];
    let data: RawQuestionBankJson;
    try {
        data = JSON.parse(text);
    } catch (err) {
        return { items: [], warnings: [`Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`] };
    }
    if (!data || !Array.isArray(data.items)) {
        return { items: [], warnings: ['Invalid format: expected a top-level "items" array.'] };
    }

    const parsed: ParsedQuestionBankItem[] = [];

    data.items.forEach((raw, i) => {
        const label = `Item ${i + 1}`;
        const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [];
        const cefrLevel = parseCefrLevel(raw.cefrLevel, label, warnings);

        if (raw.kind === 'section') {
            const section = raw.section;
            if (!section || !section.title || !section.title.trim()) {
                warnings.push(`${label}: skipped — section bundle is missing a title.`);
                return;
            }
            const questions = (section.questions ?? [])
                .map((rq, qi) => parseQuestion(rq, `${label} question ${qi + 1}`, warnings))
                .filter((q): q is TestQuestion => q !== null);
            if (questions.length === 0) {
                warnings.push(`${label}: skipped — section "${section.title}" has no valid questions.`);
                return;
            }
            parsed.push({
                kind: 'section',
                cefrLevel,
                section: { title: section.title, content: section.content, audioUrl: section.audioUrl, questions },
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
        return { items: [], warnings: [`Unsupported file type ".${ext}" — the question bank importer accepts .json files.`] };
    }
    return parseQuestionBankJson(await file.text());
}
