import type { LinkedFrameworkDescriptor, TestQuestion, TestQuestionType } from '../types';
import { grammarItemToFrameworkDescriptor } from '../data/grammarStandards';
import { getQuestionGrammarIds, withGrammarIds } from './grammarLinks';
import {
    DEFAULT_MAX_RECORDING_SECONDS,
    defaultCategorizeItems,
    defaultCategories,
    defaultMatchingPairs,
    defaultMatrixColumns,
    defaultMatrixRows,
    defaultOptions,
    defaultOrderItems,
} from './questionTypeDefaults';

type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];

/** Every field a question can carry as answer content (everything optional on `TestQuestion`). */
export type QuestionPayloadField = OptionalKeys<TestQuestion>;

/**
 * Answer content grouped by the type that owns it. A field listed by two types (e.g. `options` for
 * multiple-choice and multiple-response) survives a change between them; everything else the
 * previous type owned is removed. Links, media, points and prompt text are deliberately absent:
 * they belong to the question, not to its answer format, so they always survive.
 */
const PAYLOAD = {
    options: ['options', 'shuffleOptions', 'pinLastOption'],
    boolean: ['correctBoolean', 'trueLabel', 'falseLabel'],
    typedAnswer: ['expectedAnswer', 'expectedAnswers', 'answerTolerance'],
    numeric: ['expectedNumericValue', 'numericTolerance', 'numericTolerancePercent', 'numericUnit'],
    matrix: ['matrixColumns', 'matrixRows'],
    cloze: ['clozeIntro', 'gapWeights', 'wordFormation'],
    clozeBank: ['bankDistractors', 'bankUniqueUse'],
    matching: ['matchingPairs', 'matchingDistractors'],
    ordering: ['orderItems'],
    categorize: ['categories', 'categorizeItems'],
    hotText: ['hotTextPassage', 'hotTextCorrectIndices'],
    errorCorrection: ['errorPassage', 'penaliseFalsePicks'],
    sentenceBuilder: ['sentenceTargets', 'sentenceTiles', 'builderScoring'],
    keyWord: ['keyWord', 'gappedSentence', 'answerWordLimit'],
    dictation: ['dictationText'],
    audioResponse: ['maxRecordingSeconds', 'prepSeconds', 'cueBullets'],
} satisfies Record<string, QuestionPayloadField[]>;

const OWNED: Record<TestQuestionType, QuestionPayloadField[]> = {
    'multiple-choice': PAYLOAD.options,
    'multiple-response': PAYLOAD.options,
    'true-false': PAYLOAD.boolean,
    'short-answer': PAYLOAD.typedAnswer,
    open: [],
    cloze: [...PAYLOAD.typedAnswer, ...PAYLOAD.cloze],
    'cloze-dropdown': [...PAYLOAD.typedAnswer, ...PAYLOAD.cloze],
    'cloze-bank': [...PAYLOAD.typedAnswer, ...PAYLOAD.cloze, ...PAYLOAD.clozeBank],
    matrix: PAYLOAD.matrix,
    dictation: [...PAYLOAD.typedAnswer, ...PAYLOAD.dictation],
    'key-word-transformation': [...PAYLOAD.typedAnswer, ...PAYLOAD.keyWord],
    'error-correction': PAYLOAD.errorCorrection,
    'sentence-builder': PAYLOAD.sentenceBuilder,
    matching: PAYLOAD.matching,
    ordering: PAYLOAD.ordering,
    categorize: PAYLOAD.categorize,
    'hot-text': PAYLOAD.hotText,
    numeric: PAYLOAD.numeric,
    'audio-response': PAYLOAD.audioResponse,
};

/**
 * Types whose grammar chips are meaningful. Elsewhere they would be matched by the recommendation
 * engine against a question that cannot drill them, so the chips and their derived ids are cleared.
 */
const GRAMMAR_LINK_TYPES: TestQuestionType[] = [
    'cloze',
    'cloze-dropdown',
    'cloze-bank',
    'matrix',
    'hot-text',
    'matching',
];

export interface QuestionTypeConversion {
    question: TestQuestion;
    /**
     * Fields that held authored content and the new type cannot use. Empty when nothing is lost;
     * a caller that changes a question in place can offer a confirmation when it is not.
     */
    dropped: QuestionPayloadField[];
}

/**
 * Converts one question to another type: the target type gets the first option/row/pair it needs to
 * render, and payloads that belong to the type being left are removed so they cannot leak into
 * exports, imports or a later conversion. Grammar chips follow the same rule.
 */
export function convertQuestionType(question: TestQuestion, type: TestQuestionType): QuestionTypeConversion {
    if (type === question.type) return { question, dropped: [] };

    const keep = new Set(OWNED[type]);
    const leaving = OWNED[question.type].filter((field) => !keep.has(field));
    const dropped = leaving.filter((field) => hasAuthoredContent(question[field]));

    const next: TestQuestion = { ...hydrate(question, type), type };
    for (const field of leaving) delete next[field];

    // Chips found only through the legacy id fields have to become descriptors first: `withGrammarIds`
    // derives the output ids from whatever it is handed, so an unmigrated legacy tag would be dropped
    // even when the new type supports grammar links.
    const descriptors = withLegacyGrammarDescriptors(question);
    const keptDescriptors = GRAMMAR_LINK_TYPES.includes(type)
        ? descriptors
        : descriptors.filter((descriptor) => descriptor.framework !== 'grammar');

    return { question: descriptors.length > 0 ? withGrammarIds(next, keptDescriptors) : next, dropped };
}

/** The question's framework chips, with any grammar id that only exists on the legacy fields added back. */
function withLegacyGrammarDescriptors(question: TestQuestion): LinkedFrameworkDescriptor[] {
    const descriptors = question.frameworkDescriptors ?? [];
    const known = new Set(
        descriptors.filter((descriptor) => descriptor.framework === 'grammar').map((d) => d.descriptorId)
    );
    const missing = getQuestionGrammarIds(question).filter((id) => !known.has(id));
    const restored = missing.flatMap((id) => {
        const descriptor = grammarItemToFrameworkDescriptor(id);
        return descriptor ? [descriptor] : [];
    });
    return restored.length > 0 ? [...descriptors, ...restored] : descriptors;
}

/** Adds the answer shape a type needs to open on, without touching content the question already has. */
function hydrate(question: TestQuestion, type: TestQuestionType): TestQuestion {
    switch (type) {
        case 'multiple-choice': {
            const options = question.options?.length ? question.options : defaultOptions();
            const firstCorrect = options.findIndex((option) => option.isCorrect);
            return {
                ...question,
                options: options.map((option, index) => ({ ...option, isCorrect: index === firstCorrect })),
            };
        }
        case 'multiple-response':
            return { ...question, options: question.options?.length ? question.options : defaultOptions() };
        case 'true-false':
            return { ...question, correctBoolean: question.correctBoolean ?? true };
        case 'matrix': {
            const matrixColumns = question.matrixColumns?.length ? question.matrixColumns : defaultMatrixColumns();
            return {
                ...question,
                matrixColumns,
                matrixRows: question.matrixRows?.length ? question.matrixRows : defaultMatrixRows(matrixColumns),
            };
        }
        case 'matching':
            return {
                ...question,
                matchingPairs: question.matchingPairs?.length ? question.matchingPairs : defaultMatchingPairs(),
            };
        case 'ordering':
            return { ...question, orderItems: question.orderItems?.length ? question.orderItems : defaultOrderItems() };
        case 'categorize': {
            const categories = question.categories?.length ? question.categories : defaultCategories();
            return {
                ...question,
                categories,
                categorizeItems: question.categorizeItems?.length
                    ? question.categorizeItems
                    : defaultCategorizeItems(categories),
            };
        }
        case 'hot-text':
            return {
                ...question,
                hotTextPassage: question.hotTextPassage ?? '',
                hotTextCorrectIndices: question.hotTextCorrectIndices ?? [],
            };
        case 'audio-response':
            return { ...question, maxRecordingSeconds: question.maxRecordingSeconds ?? DEFAULT_MAX_RECORDING_SECONDS };
        default:
            return question;
    }
}

function hasAuthoredContent(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
}
