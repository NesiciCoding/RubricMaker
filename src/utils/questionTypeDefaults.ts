import { nanoid } from './nanoid';
import type {
    CategorizeItem,
    MatchingPair,
    MatrixColumn,
    MatrixRow,
    OrderItem,
    TestCategory,
    TestOption,
    TestQuestion,
    TestQuestionType,
} from '../types';

/** Recording cap a speaking question starts with; the question editor can lower it per item. */
export const DEFAULT_MAX_RECORDING_SECONDS = 60;

export const defaultOptions = (): TestOption[] => [
    { id: nanoid(), text: '', isCorrect: true },
    { id: nanoid(), text: '', isCorrect: false },
];

export const defaultMatchingPairs = (): MatchingPair[] => [
    { id: nanoid(), left: '', right: '' },
    { id: nanoid(), left: '', right: '' },
];

export const defaultOrderItems = (): OrderItem[] => [
    { id: nanoid(), text: '' },
    { id: nanoid(), text: '' },
];

export const defaultCategories = (): TestCategory[] => [
    { id: nanoid(), label: '' },
    { id: nanoid(), label: '' },
];

export const defaultCategorizeItems = (categories: TestCategory[]): CategorizeItem[] => [
    /* v8 ignore next -- defaultCategories always yields at least one category */
    { id: nanoid(), text: '', categoryId: categories[0]?.id ?? '' },
    /* v8 ignore next -- defaultCategories always yields at least one category */
    { id: nanoid(), text: '', categoryId: categories[0]?.id ?? '' },
];

export const defaultMatrixColumns = (): MatrixColumn[] => [
    { id: nanoid(), text: '' },
    { id: nanoid(), text: '' },
];

export const defaultMatrixRows = (columns: MatrixColumn[]): MatrixRow[] => [
    { id: nanoid(), text: '', correctColumnId: columns[0].id },
    { id: nanoid(), text: '', correctColumnId: columns[0].id },
];

/**
 * The answer shape a question of `type` needs before the teacher types anything. The type-specific
 * editors read their lists straight off the question, so a question created from the type picker
 * must arrive with the same first row/option it would get when an existing question switches type —
 * otherwise the new question opens on an empty editor and the picker's choice looks half-applied.
 */
export function questionDefaultsFor(type: TestQuestionType): Partial<TestQuestion> {
    switch (type) {
        case 'multiple-choice':
        case 'multiple-response':
            return { options: defaultOptions() };
        case 'true-false':
            return { correctBoolean: true };
        case 'matrix': {
            const matrixColumns = defaultMatrixColumns();
            return { matrixColumns, matrixRows: defaultMatrixRows(matrixColumns) };
        }
        case 'matching':
            return { matchingPairs: defaultMatchingPairs() };
        case 'ordering':
            return { orderItems: defaultOrderItems() };
        case 'categorize': {
            const categories = defaultCategories();
            return { categories, categorizeItems: defaultCategorizeItems(categories) };
        }
        case 'hot-text':
            return { hotTextPassage: '', hotTextCorrectIndices: [] };
        case 'audio-response':
            return { maxRecordingSeconds: DEFAULT_MAX_RECORDING_SECONDS };
        default:
            return {};
    }
}
