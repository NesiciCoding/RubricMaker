import { CEFR_LEVELS } from '../data/cefrDescriptors';
import type { CefrLevel, Test, TestQuestion } from '../types';

export type ColumnSortKey = 'original' | 'section' | 'cefr' | 'type' | 'grammar' | 'score';
export type SortDir = 'asc' | 'desc';
export interface ColumnSortRule {
    key: ColumnSortKey;
    dir: SortDir;
}

export interface GridColumnMeta {
    id: string;
    originalIndex: number;
    sectionId?: string;
    sectionTitle?: string;
    cefrLevel?: CefrLevel;
    type: TestQuestion['type'];
    grammarKey?: string;
    /** Class average score on this question, 0..1. Undefined when no one has answered it yet. */
    avgScore?: number;
}

/** CEFR level a question sits at: its section's target level, else its first linked descriptor. */
export function questionCefrLevel(test: Test, question: TestQuestion): CefrLevel | undefined {
    const section = question.sectionId ? test.sections?.find((s) => s.id === question.sectionId) : undefined;
    return section?.cefrLevel ?? question.linkedCefrDescriptors?.[0]?.level;
}

function grammarKeyOf(question: TestQuestion): string | undefined {
    return question.linkedGrammarItemId ?? question.linkedStandards?.[0]?.statementNotation;
}

export function buildColumnMeta(test: Test, avgById: Map<string, number | undefined> = new Map()): GridColumnMeta[] {
    return test.questions.map((q, i) => {
        const section = q.sectionId ? test.sections?.find((s) => s.id === q.sectionId) : undefined;
        return {
            id: q.id,
            originalIndex: i,
            sectionId: q.sectionId,
            sectionTitle: section?.title,
            cefrLevel: questionCefrLevel(test, q),
            type: q.type,
            grammarKey: grammarKeyOf(q),
            avgScore: avgById.get(q.id),
        };
    });
}

// Each facet resolves to a sortable value; undefined means "no value", which always
// sorts last regardless of direction so an unlevelled/untagged column never jumps ahead.
function facetValue(key: ColumnSortKey, c: GridColumnMeta): number | string | undefined {
    switch (key) {
        case 'section':
            return c.sectionTitle;
        case 'cefr':
            return c.cefrLevel ? CEFR_LEVELS.indexOf(c.cefrLevel) : undefined;
        case 'type':
            return c.type;
        case 'grammar':
            return c.grammarKey;
        case 'score':
            return c.avgScore;
        case 'original':
        default:
            return c.originalIndex;
    }
}

function compareValues(a: number | string | undefined, b: number | string | undefined, dir: SortDir): number {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    const cmp = typeof a === 'string' ? a.localeCompare(String(b)) : a - (b as number);
    return dir === 'desc' ? -cmp : cmp;
}

/** Multi-key stable sort: rules apply primary→secondary, ties break on original order. */
export function orderColumns(cols: GridColumnMeta[], rules: ColumnSortRule[]): GridColumnMeta[] {
    return [...cols].sort((a, b) => {
        for (const rule of rules) {
            if (rule.key === 'original') continue;
            const cmp = compareValues(facetValue(rule.key, a), facetValue(rule.key, b), rule.dir);
            if (cmp !== 0) return cmp;
        }
        return a.originalIndex - b.originalIndex;
    });
}
