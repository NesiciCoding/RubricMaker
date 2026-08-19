import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResponsesGrid, { type ResponsesGridStudentRow } from '../ResponsesGrid';
import type { Test, TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
    }),
}));

const matchingQ: TestQuestion = {
    id: 'q1',
    prompt: 'Match the pairs',
    type: 'matching',
    points: 2,
    matchingPairs: [{ id: 'p1', left: 'Left', right: 'Right' }],
};
const categorizeQ: TestQuestion = {
    id: 'q2',
    prompt: 'Sort the items',
    type: 'categorize',
    points: 2,
    categorizeItems: [{ id: 'ci1', text: 'Dog', categoryId: 'c1' }],
};
const orderingQ: TestQuestion = {
    id: 'q3',
    prompt: 'Order the steps',
    type: 'ordering',
    points: 2,
    orderItems: [
        { id: 'i1', text: 'First' },
        { id: 'i2', text: 'Second' },
    ],
};
const shortNoAnsQ: TestQuestion = { id: 'q4', prompt: 'Say anything', type: 'short-answer', points: 1 };
const numericNoAnsQ: TestQuestion = { id: 'q5', prompt: 'Type a number', type: 'numeric', points: 1 };
const openQ: TestQuestion = { id: 'q6', prompt: 'Write freely', type: 'open', points: 2 };
const cloze2Q: TestQuestion = {
    id: 'q7',
    prompt: 'X {{a}} Y {{b}}',
    type: 'cloze',
    points: 2,
};
const hotTextNoPassageQ: TestQuestion = {
    id: 'q8',
    prompt: 'Click the words',
    type: 'hot-text',
    points: 2,
};
const audioPlainQ: TestQuestion = { id: 'q9', prompt: 'Describe the picture', type: 'audio-response', points: 2 };
const hotTextQ: TestQuestion = {
    id: 'q10',
    prompt: 'Select the quick word',
    type: 'hot-text',
    points: 2,
    hotTextPassage: 'The [[quick]] fox',
    hotTextCorrectIndices: [0],
};
const mcQ: TestQuestion = {
    id: 'q11',
    prompt: 'Pick one',
    type: 'multiple-choice',
    points: 1,
    options: [
        { id: 'o1', text: 'One', isCorrect: true },
        { id: 'o2', text: 'Two', isCorrect: false },
    ],
};

const test: Test = {
    id: 't1',
    name: 'Coverage Test',
    questions: [
        matchingQ,
        categorizeQ,
        orderingQ,
        shortNoAnsQ,
        numericNoAnsQ,
        openQ,
        cloze2Q,
        hotTextNoPassageQ,
        audioPlainQ,
        hotTextQ,
        mcQ,
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const alice: ResponsesGridStudentRow = {
    studentId: 's1',
    displayName: 'Alice',
    answers: [
        { questionId: 'q1', response: JSON.stringify({ p1: 'p1' }) },
        { questionId: 'q2', response: JSON.stringify({ ci1: 'c1' }) },
        { questionId: 'q3', response: JSON.stringify(['i1', 'i2']) },
        { questionId: 'q4', response: 'whatever' },
        { questionId: 'q5', response: '5' },
        { questionId: 'q6', response: 'My essay text' },
        { questionId: 'q7', response: JSON.stringify({ 0: 'a' }) },
        { questionId: 'q8', response: JSON.stringify([0]) },
        { questionId: 'q9', response: 'hello' },
        { questionId: 'q10', response: JSON.stringify([0]) },
    ],
};

const wrong: ResponsesGridStudentRow = {
    studentId: 's9',
    displayName: 'Wrong',
    answers: [
        { questionId: 'q1', response: JSON.stringify({ p1: 'nope' }) },
        { questionId: 'q3', response: JSON.stringify(['i2', 'i1']) },
        { questionId: 'q11', response: 'unknown-id' },
    ],
};

const bob: ResponsesGridStudentRow = {
    studentId: 's2',
    displayName: 'Bob',
    answers: [
        { questionId: 'q1', response: JSON.stringify({}) },
        { questionId: 'q2', response: JSON.stringify({}) },
        { questionId: 'q3', response: JSON.stringify([]) },
        { questionId: 'q4', response: '' },
        { questionId: 'q5', response: '' },
        { questionId: 'q6', response: '' },
        { questionId: 'q7', response: JSON.stringify({}) },
        { questionId: 'q8', response: JSON.stringify([]) },
        { questionId: 'q9', response: '' },
        { questionId: 'q10', response: JSON.stringify([]) },
    ],
};

const malformed: ResponsesGridStudentRow = {
    studentId: 's3',
    displayName: 'Mal',
    answers: [
        { questionId: 'q1', response: 'not-json' },
        { questionId: 'q2', response: 'not-json' },
        { questionId: 'q3', response: 'not-json' },
        { questionId: 'q7', response: 'not-json' },
        { questionId: 'q8', response: 'not-json' },
    ],
};

describe('ResponsesGrid coverage', () => {
    it('marks matching, categorize, ordering as scored and ungradeable types as ungraded', () => {
        render(<ResponsesGrid test={test} rows={[alice]} />);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.correct')).toHaveLength(4);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.ungraded')).toHaveLength(4);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.incorrect')).toHaveLength(2);
    });

    it('marks empty-object/array responses as empty across all multi-part types', () => {
        render(<ResponsesGrid test={test} rows={[bob]} />);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.empty')).toHaveLength(11);
    });

    it('marks malformed JSON responses as empty', () => {
        render(<ResponsesGrid test={test} rows={[malformed]} />);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.empty')).toHaveLength(11);
    });

    it('marks wrong matching and ordering responses as incorrect and falls back to the raw mc response', () => {
        render(<ResponsesGrid test={test} rows={[wrong]} />);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.incorrect')).toHaveLength(3);
        fireEvent.click(screen.getByLabelText('Pick one'));
        expect(screen.getByRole('dialog').textContent).toContain('unknown-id');
    });

    it('treats pointsEarned at or above the point value as correct', () => {
        const graded = {
            ...alice,
            answers: alice.answers.map((a) => (a.questionId === 'q1' ? { ...a, pointsEarned: 2 } : a)),
        };
        render(<ResponsesGrid test={test} rows={[graded]} />);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.correct')).toHaveLength(4);
    });

    it('shows raw responses in the gallery for matching, categorize, ordering, and open questions', () => {
        render(<ResponsesGrid test={test} rows={[alice]} />);

        fireEvent.click(screen.getByLabelText('Match the pairs'));
        expect(screen.getByRole('dialog').textContent).toContain('{"p1":"p1"}');
        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Sort the items'));
        expect(screen.getByRole('dialog').textContent).toContain('{"ci1":"c1"}');
        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Order the steps'));
        expect(screen.getByRole('dialog').textContent).toContain('["i1","i2"]');
        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Write freely'));
        expect(screen.getByRole('dialog').textContent).toContain('My essay text');
        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Select the quick word'));
        expect(screen.getByRole('dialog').textContent).toContain('quick');
    });

    it('formats multiple-response answers and shows no_answer for empty selections', () => {
        const mrQ: TestQuestion = {
            id: 'm1',
            prompt: 'Pick all',
            type: 'multiple-response',
            points: 2,
            options: [
                { id: 'oa', text: 'Alpha', isCorrect: true },
                { id: 'ob', text: 'Beta', isCorrect: true },
            ],
        };
        const withMr: Test = { ...test, questions: [mrQ] };
        const rows: ResponsesGridStudentRow[] = [
            {
                studentId: 's1',
                displayName: 'Alice',
                answers: [{ questionId: 'm1', response: JSON.stringify(['oa', 'ob']) }],
            },
            { studentId: 's2', displayName: 'Bob', answers: [{ questionId: 'm1', response: JSON.stringify([]) }] },
            { studentId: 's3', displayName: 'Mal', answers: [{ questionId: 'm1', response: 'garbage' }] },
        ];
        render(<ResponsesGrid test={withMr} rows={rows} />);
        fireEvent.click(screen.getByLabelText('Pick all'));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Alpha, Beta')).toBeInTheDocument();
        expect(within(dialog).getAllByText('tests.monitor.grid.no_answer')).toHaveLength(2);
    });

    it('shows the cloze answer text and no_answer for empty or malformed cloze responses', () => {
        render(<ResponsesGrid test={test} rows={[alice, bob, malformed]} />);
        fireEvent.click(screen.getByLabelText('X {{a}} Y {{b}}'));
        const dialog = screen.getByRole('dialog');
        // Alice answered gap 0; the missing gap 1 is filtered out.
        expect(within(dialog).getByText('a')).toBeInTheDocument();
        expect(within(dialog).getAllByText('tests.monitor.grid.no_answer')).toHaveLength(2);
    });

    it('shows no_answer for hot-text without a passage and for plain audio responses', () => {
        render(<ResponsesGrid test={test} rows={[alice, malformed]} />);

        fireEvent.click(screen.getByLabelText('Click the words'));
        // Alice selected an index but there is no passage; Mal's response is malformed → catch
        expect(screen.getAllByText('tests.monitor.grid.no_answer')).toHaveLength(2);
        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Describe the picture'));
        expect(screen.getAllByText('tests.monitor.grid.no_answer')).toHaveLength(2);
    });
});
