import type { Test, TestQuestion } from '../types';
import {
    parseClozeGaps,
    parseHotTextFragments,
    parseErrorPassage,
} from '../../supabase/functions/_shared/testScoring.ts';
import { stripHtmlTags } from './exportDataPrep';

export type TestQuestionIssue =
    | 'empty_prompt'
    | 'too_few_options'
    | 'empty_option'
    | 'no_correct_option'
    | 'no_gaps'
    | 'empty_gap'
    | 'no_statements'
    | 'empty_statement'
    | 'too_few_columns'
    | 'no_errors'
    | 'no_fragments'
    | 'no_correct_fragment'
    | 'no_target_sentence'
    | 'no_key_word'
    | 'no_model_answer'
    | 'too_few_pairs'
    | 'empty_pair'
    | 'too_few_items'
    | 'empty_item'
    | 'no_categories'
    | 'no_numeric_answer';

export interface TestIssueEntry {
    /** 1-based position in the order students see */
    number: number;
    questionId: string;
    issues: TestQuestionIssue[];
}

const isBlank = (text: string | undefined) => !text || text.trim() === '';
const isBlankHtml = (html: string | undefined) => isBlank(stripHtmlTags(html ?? ''));

// These carry their content in a passage, the gaps or an audio clip rather than the prompt.
const PROMPT_OPTIONAL = new Set<TestQuestion['type']>([
    'cloze',
    'cloze-dropdown',
    'cloze-bank',
    'error-correction',
    'hot-text',
    'dictation',
]);

/** What makes a question unanswerable or impossible to score, as issue codes (empty when it is complete). */
export function testQuestionIssues(q: TestQuestion): TestQuestionIssue[] {
    const issues: TestQuestionIssue[] = [];
    if (!PROMPT_OPTIONAL.has(q.type) && isBlankHtml(q.prompt)) issues.push('empty_prompt');

    switch (q.type) {
        case 'multiple-choice':
        case 'multiple-response': {
            const options = q.options ?? [];
            const blank = options.filter((o) => isBlank(o.text) && !o.imageUrl && !o.audioUrl && isBlank(o.spokenText));
            if (options.length - blank.length < 2) issues.push('too_few_options');
            if (blank.length > 0) issues.push('empty_option');
            if (!options.some((o) => o.isCorrect)) issues.push('no_correct_option');
            break;
        }
        case 'cloze':
        case 'cloze-dropdown':
        case 'cloze-bank': {
            const gaps = parseClozeGaps(q.prompt ?? '');
            if (gaps.length === 0) issues.push('no_gaps');
            else if (gaps.some((g) => g.alternatives.length === 0)) issues.push('empty_gap');
            break;
        }
        case 'matrix': {
            const rows = q.matrixRows ?? [];
            const columns = q.matrixColumns ?? [];
            if (rows.length === 0) issues.push('no_statements');
            else if (rows.some((r) => isBlank(r.text) || !columns.some((c) => c.id === r.correctColumnId)))
                issues.push('empty_statement');
            if (columns.filter((c) => !isBlank(c.text)).length < 2) issues.push('too_few_columns');
            break;
        }
        case 'error-correction': {
            const fragments = parseErrorPassage(q.errorPassage ?? '').filter((s) => s.type === 'fragment');
            if (!fragments.some((f) => f.type === 'fragment' && f.corrections.length > 0)) issues.push('no_errors');
            break;
        }
        case 'hot-text': {
            const count = parseHotTextFragments(q.hotTextPassage ?? '').filter((s) => s.type === 'fragment').length;
            if (count === 0) issues.push('no_fragments');
            else if (!(q.hotTextCorrectIndices ?? []).some((i) => i >= 0 && i < count))
                issues.push('no_correct_fragment');
            break;
        }
        case 'sentence-builder':
            if (!(q.sentenceTargets ?? []).some((s) => s.trim().split(/\s+/).length > 1))
                issues.push('no_target_sentence');
            break;
        case 'key-word-transformation':
            if (isBlank(q.keyWord)) issues.push('no_key_word');
            if (!(q.expectedAnswers ?? []).some((a) => !isBlank(a)) && isBlank(q.expectedAnswer))
                issues.push('no_model_answer');
            break;
        case 'dictation':
            if (isBlank(q.dictationText)) issues.push('no_model_answer');
            break;
        case 'matching': {
            const pairs = q.matchingPairs ?? [];
            if (pairs.length < 2) issues.push('too_few_pairs');
            if (pairs.some((p) => isBlank(p.left) || isBlank(p.right))) issues.push('empty_pair');
            break;
        }
        case 'ordering': {
            const items = q.orderItems ?? [];
            if (items.length < 2) issues.push('too_few_items');
            if (items.some((i) => isBlank(i.text))) issues.push('empty_item');
            break;
        }
        case 'categorize': {
            const categories = q.categories ?? [];
            const items = q.categorizeItems ?? [];
            if (categories.filter((c) => !isBlank(c.label)).length < 2) issues.push('no_categories');
            if (items.length === 0) issues.push('too_few_items');
            else if (items.some((i) => isBlank(i.text) || !categories.some((c) => c.id === i.categoryId)))
                issues.push('empty_item');
            break;
        }
        case 'numeric':
            if (typeof q.expectedNumericValue !== 'number' || !Number.isFinite(q.expectedNumericValue))
                issues.push('no_numeric_answer');
            break;
    }
    return issues;
}

/** Every incomplete question of a test, numbered in the order given. */
export function testIssues(questions: TestQuestion[]): TestIssueEntry[] {
    return questions.flatMap((q, i) => {
        const issues = testQuestionIssues(q);
        return issues.length > 0 ? [{ number: i + 1, questionId: q.id, issues }] : [];
    });
}

/** Why a test can't be handed out yet; a placement generator test draws its questions from the bank, so only its own questions are checked otherwise. */
export function testAssignBlockers(test: Pick<Test, 'questions' | 'mode' | 'placementEngine'>): {
    noQuestions: boolean;
    entries: TestIssueEntry[];
} {
    if (test.mode === 'placement' && test.placementEngine === 'generator') return { noQuestions: false, entries: [] };
    return { noQuestions: test.questions.length === 0, entries: testIssues(test.questions) };
}
