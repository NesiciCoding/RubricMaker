/**
 * axe audits for the question editor (#697).
 *
 * The editor builds its controls by question type, so an unnamed `<select>` in one type is easy to
 * miss by eye — and a select with no accessible name reads as an unlabelled combobox to a screen
 * reader. Colour contrast is skipped: jsdom has no rendering engine.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'jest-axe';
import QuestionEditor from '../QuestionEditor';
import type { TestQuestion, TestQuestionType, TestSection } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && typeof opts === 'object' && 'number' in opts) return `${key} ${opts.number}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

const appContextMock = () => ({ settings: {} });
vi.mock('../../../context/AppContext', () => ({
    useRoster: () => appContextMock(),
    useStudents: () => appContextMock(),
    useClasses: () => appContextMock(),
    useGrading: () => appContextMock(),
    useAuthoring: () => appContextMock(),
    useAssessment: () => appContextMock(),
    useEssays: () => appContextMock(),
    useFlashcards: () => appContextMock(),
    useSettings: () => appContextMock(),
    usePlatform: () => appContextMock(),
}));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea aria-label="tests.question_prompt_label" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock('../ClozeGapEditor', () => ({
    default: ({ value, onChange }: { value: string; onChange: (prompt: string) => void }) => (
        <textarea aria-label="tests.question_prompt_label" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock('../HotTextEditor', () => ({
    default: ({ passage }: { passage: string }) => (
        <textarea aria-label="tests.hot_text_passage_label" value={passage} readOnly />
    ),
}));
vi.mock('../../Standards/StandardsPickerModal', () => ({ default: () => null }));
vi.mock('../../CEFR/CefrPickerModal', () => ({ default: () => null }));
vi.mock('../HelpPopover', () => ({
    default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const sections: TestSection[] = [{ id: 's1', title: 'Section 1' }];

function makeQuestion(type: TestQuestionType): TestQuestion {
    const base: TestQuestion = { id: 'q1', prompt: 'Sample question', type, points: 1 };
    const options = [
        { id: 'a', text: 'Option A', isCorrect: true },
        { id: 'b', text: 'Option B', isCorrect: false },
    ];
    switch (type) {
        case 'multiple-choice':
        case 'multiple-response':
            return { ...base, options };
        case 'true-false':
            return { ...base, correctBoolean: true };
        case 'matching':
            return {
                ...base,
                matchingPairs: [
                    { id: 'a', left: 'Left', right: 'Right' },
                    { id: 'b', left: 'Left 2', right: 'Right 2' },
                ],
            };
        case 'ordering':
            return {
                ...base,
                orderItems: [
                    { id: 'a', text: 'First' },
                    { id: 'b', text: 'Second' },
                ],
            };
        case 'categorize':
            return {
                ...base,
                categories: [
                    { id: 'c1', label: 'Group 1' },
                    { id: 'c2', label: 'Group 2' },
                ],
                categorizeItems: [
                    { id: 'a', text: 'Item A', categoryId: 'c1' },
                    { id: 'b', text: 'Item B', categoryId: 'c2' },
                ],
            };
        case 'matrix':
            return {
                ...base,
                matrixRows: [
                    { id: 'r1', text: 'Statement A', correctColumnId: 'm1' },
                    { id: 'r2', text: 'Statement B', correctColumnId: 'm2' },
                ],
                matrixColumns: [
                    { id: 'm1', text: 'Agree' },
                    { id: 'm2', text: 'Disagree' },
                ],
            };
        case 'hot-text':
            return { ...base, hotTextPassage: 'The [[quick]] brown fox', hotTextCorrectIndices: [0] };
        default:
            return base;
    }
}

const TYPES: TestQuestionType[] = [
    'multiple-choice',
    'multiple-response',
    'true-false',
    'short-answer',
    'open',
    'cloze',
    'cloze-dropdown',
    'cloze-bank',
    'matching',
    'ordering',
    'categorize',
    'hot-text',
    'matrix',
    'dictation',
    'key-word-transformation',
    'error-correction',
    'sentence-builder',
    'numeric',
    'audio-response',
];

const axeOptions = {
    rules: {
        'color-contrast': { enabled: false },
        region: { enabled: false },
    },
};

describe('QuestionEditor a11y', () => {
    it.each(TYPES)('%s: no axe violations', async (type) => {
        const { container } = render(
            <QuestionEditor
                question={makeQuestion(type)}
                index={0}
                total={1}
                sections={sections}
                onChange={vi.fn()}
                onRemove={vi.fn()}
            />
        );
        // jest-axe types the result loosely, so name the shape this test reads.
        const results = (await axe(container, axeOptions)) as unknown as {
            violations: { id: string; nodes: { target: unknown[] }[] }[];
        };
        // Report the offending nodes, so a failure names the control instead of just counting it.
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
            []
        );
    });
});
