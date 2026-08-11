import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ResponsesGrid, { type ResponsesGridStudentRow } from '../ResponsesGrid';
import type { Test, TestQuestion } from '../../../types';
import { encodeAudioResponse } from '../../../utils/audioResponseCode';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
    }),
}));

const mcQ: TestQuestion = {
    id: 'q1',
    prompt: 'Pick the number four',
    type: 'multiple-choice',
    points: 2,
    options: [
        { id: 'o1', text: 'Three', isCorrect: false },
        { id: 'o2', text: 'Four', isCorrect: true },
    ],
};
const shortQ: TestQuestion = {
    id: 'q2',
    prompt: 'Capital of France?',
    type: 'short-answer',
    points: 2,
    expectedAnswer: 'Paris',
};
const numericQ: TestQuestion = {
    id: 'q3',
    prompt: 'Answer 42',
    type: 'numeric',
    points: 3,
    expectedNumericValue: 42,
};
const clozeQ: TestQuestion = {
    id: 'q4',
    prompt: 'The {{capital}} of France is Paris',
    type: 'cloze',
    points: 2,
};
const mrQ: TestQuestion = {
    id: 'q5',
    prompt: 'Pick both correct',
    type: 'multiple-response',
    points: 2,
    options: [
        { id: 'oa', text: 'A', isCorrect: true },
        { id: 'ob', text: 'B', isCorrect: true },
        { id: 'oc', text: 'C', isCorrect: false },
    ],
};
const tfQ: TestQuestion = {
    id: 'q6',
    prompt: 'True or false?',
    type: 'true-false',
    points: 1,
    correctBoolean: true,
};
const audioQ: TestQuestion = {
    id: 'q7',
    prompt: 'Say your name',
    type: 'audio-response',
    points: 2,
};
const hotTextQ: TestQuestion = {
    id: 'q8',
    prompt: 'Select fragments',
    type: 'hot-text',
    points: 2,
    hotTextPassage: 'The [[quick]] brown [[fox]]',
};

const test: Test = {
    id: 't1',
    name: 'Monitor Test',
    questions: [mcQ, shortQ, numericQ, clozeQ, mrQ, tfQ, audioQ, hotTextQ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const alice: ResponsesGridStudentRow = {
    studentId: 's1',
    displayName: 'Alice',
    answers: [
        { questionId: 'q1', response: 'o2' },
        { questionId: 'q2', response: 'Paris' },
        { questionId: 'q3', response: '42' },
        { questionId: 'q4', response: JSON.stringify({ 0: 'capital' }) },
        { questionId: 'q5', response: JSON.stringify(['oa', 'ob']) },
        { questionId: 'q6', response: 'true' },
        { questionId: 'q7', response: encodeAudioResponse({ dataUri: 'data:audio/webm;base64,xxx', mimeType: 'audio/webm', durationSec: 12 }) },
        { questionId: 'q8', response: JSON.stringify([1]) },
    ],
};

const bob: ResponsesGridStudentRow = {
    studentId: 's2',
    displayName: 'Bob',
    answers: [
        { questionId: 'q1', response: 'o1' },
        { questionId: 'q2', response: 'Rome' },
        { questionId: 'q3', response: 'x' },
        { questionId: 'q4', response: JSON.stringify({}) },
        { questionId: 'q5', response: JSON.stringify(['oc']) },
        { questionId: 'q6', response: 'false' },
    ],
};

describe('ResponsesGrid', () => {
    it('renders one column per question and one row per student', () => {
        render(<ResponsesGrid test={test} rows={[alice, bob]} />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        // 8 question header buttons inside the table
        expect(within(screen.getByRole('table')).getAllByRole('button')).toHaveLength(8);
    });

    it('marks cells correct, incorrect, ungraded, and empty by question type', () => {
        render(<ResponsesGrid test={test} rows={[alice, bob]} />);
        const state = (name: string) => `tests.monitor.grid.state.${name}`;

        // Alice: q1-q6 correct, audio-response ungraded, hot-text [1] scored 1/2 → incorrect
        expect(screen.getAllByLabelText(state('correct'))).toHaveLength(6);
        expect(screen.getAllByLabelText(state('ungraded'))).toHaveLength(1);

        // Bob: q1-q3 wrong, q4 empty, q5 wrong, q6 wrong; q7/q8 unanswered → empty
        expect(screen.getAllByLabelText(state('incorrect'))).toHaveLength(6);
        expect(screen.getAllByLabelText(state('empty'))).toHaveLength(3);
    });

    it('respects pointsEarned overrides from manual grading', () => {
        const graded = {
            ...alice,
            answers: alice.answers.map((a) =>
                a.questionId === 'q3' ? { ...a, pointsEarned: 1 } : a
            ),
        };
        render(<ResponsesGrid test={test} rows={[graded]} />);
        // q3 answered with pointsEarned 1 < 3 → incorrect (hot-text [1] is also incorrect),
        // so correct drops from 6 to 5
        expect(screen.getAllByLabelText('tests.monitor.grid.state.incorrect')).toHaveLength(2);
        expect(screen.getAllByLabelText('tests.monitor.grid.state.correct')).toHaveLength(5);
    });

    it('opens the gallery and shows per-student answer text', () => {
        render(<ResponsesGrid test={test} rows={[alice, bob]} />);
        fireEvent.click(screen.getByLabelText('Pick the number four'));

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText('Four')).toBeInTheDocument();
        expect(within(dialog).getByText('Three')).toBeInTheDocument();
    });

    it('formats cloze, hot-text, true-false and audio answers in the gallery', () => {
        render(<ResponsesGrid test={test} rows={[alice]} />);

        fireEvent.click(screen.getByLabelText('The {{capital}} of France is Paris'));
        expect(screen.getByRole('dialog').textContent).toContain('capital');

        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Select fragments'));
        // Alice selected fragment index 1 → "fox"
        expect(screen.getByRole('dialog').textContent).toContain('fox');

        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('True or false?'));
        expect(screen.getByRole('dialog').textContent).toContain('tests.true_false_true');

        fireEvent.click(screen.getByLabelText('common.close'));

        fireEvent.click(screen.getByLabelText('Say your name'));
        expect(screen.getByRole('dialog').textContent).toContain(
            'tests.monitor.grid.audio_recorded:{"seconds":12}'
        );
    });

    it('shows no_answer for unanswered gallery cells', () => {
        render(<ResponsesGrid test={test} rows={[bob]} />);
        fireEvent.click(screen.getByLabelText('Say your name'));
        expect(screen.getByRole('dialog').textContent).toContain('tests.monitor.grid.no_answer');
    });

    it('closes the gallery via the backdrop', () => {
        render(<ResponsesGrid test={test} rows={[alice]} />);
        fireEvent.click(screen.getByLabelText('Pick the number four'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('dialog'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
