import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import nl from '../locales/nl.json';
import type { TestQuestionType } from '../types';
import { questionTypeHelpKey, questionTypeLabelKey } from './questionTypeKey';

const ALL_TYPES: TestQuestionType[] = [
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

const lookup = (dict: unknown, key: string): unknown =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);

describe('questionTypeLabelKey', () => {
    it('replaces every hyphen, not just the first', () => {
        expect(questionTypeLabelKey('key-word-transformation')).toBe('tests.question_type_key_word_transformation');
        expect(questionTypeHelpKey('cloze-bank', 'student', 'body')).toBe('tests.help.cloze_bank_student_body');
    });

    it.each(Object.entries({ en, nl, fr, de, es }))('every question type has a label in %s', (_lang, dict) => {
        for (const type of ALL_TYPES) {
            expect(typeof lookup(dict, questionTypeLabelKey(type)), type).toBe('string');
        }
    });
});
