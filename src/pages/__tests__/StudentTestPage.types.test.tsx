import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { encodeTestAssignment } from '../../utils/shareCode';
import { decodeTestSubmission } from '../../utils/shareCode';
import type { Test, TestAssignmentPayload } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts) return `${key} ${JSON.stringify(opts)}`;
            return key;
        },
    }),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            send: vi.fn(),
            subscribe: vi.fn().mockReturnThis(),
        })),
        removeChannel: vi.fn(),
    })),
}));

import StudentTestPage from '../StudentTestPage';

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 'test1',
    name: 'Sample Test',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeAssignment = (test: Test): TestAssignmentPayload & { test: Test } => ({
    testId: 'test1',
    studentId: 's1',
    teacherKey: 'tk1',
    requireSEB: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    test,
});

function renderPage(test: Test) {
    const code = encodeTestAssignment(makeAssignment(test) as TestAssignmentPayload);
    render(
        <MemoryRouter initialEntries={[`/test/${code}`]}>
            <Routes>
                <Route path="/test/:code" element={<StudentTestPage />} />
            </Routes>
        </MemoryRouter>
    );
    return code;
}

async function submitSingle() {
    await act(async () => {
        fireEvent.click(screen.getByText('tests.taking.submit_btn'));
    });
    expect(screen.getByText('tests.taking.submitted_title')).toBeInTheDocument();
    return decodeTestSubmission((screen.getByDisplayValue(/.+/) as HTMLTextAreaElement).value);
}

describe('StudentTestPage — answer types', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('answers a multiple-response question with a JSON array', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Pick all fruits',
                        type: 'multiple-response',
                        points: 2,
                        options: [
                            { id: 'a', text: 'Apple', isCorrect: true },
                            { id: 'b', text: 'Carrot', isCorrect: false },
                            { id: 'c', text: 'Banana', isCorrect: true },
                        ],
                    },
                ],
            })
        );
        fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Banana' }));
        const decoded = await submitSingle();
        expect(decoded!.answers[0].response).toBe(JSON.stringify(['a', 'c']));
    });

    it('answers a true-false question', async () => {
        renderPage(
            makeTest({
                questions: [
                    { id: 'q1', prompt: 'The sky is blue', type: 'true-false', points: 1, correctBoolean: true },
                ],
            })
        );
        fireEvent.click(screen.getByText('tests.true_false_true'));
        const decoded = await submitSingle();
        expect(decoded!.answers[0].response).toBe('true');
    });

    it('answers short-answer and numeric questions', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Capital?',
                        type: 'short-answer',
                        points: 1,
                        expectedAnswers: ['Paris'],
                    },
                    {
                        id: 'q2',
                        prompt: '2 + 2?',
                        type: 'numeric',
                        points: 1,
                        expectedNumericValue: 4,
                    },
                ],
            })
        );
        fireEvent.change(screen.getByPlaceholderText('tests.taking.short_answer_placeholder'), {
            target: { value: 'Paris' },
        });
        fireEvent.click(screen.getByText('tests.taking.next'));
        fireEvent.change(screen.getByPlaceholderText('tests.taking.numeric_placeholder'), {
            target: { value: '4' },
        });
        const decoded = await submitSingle();
        expect(decoded!.answers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ questionId: 'q1', response: 'Paris' }),
                expect.objectContaining({ questionId: 'q2', response: '4' }),
            ])
        );
    });

    it('shows and hides a hint', () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Tough one',
                        type: 'multiple-choice',
                        points: 1,
                        hint: 'The answer is 4.',
                        options: [
                            { id: 'a', text: '3', isCorrect: false },
                            { id: 'b', text: '4', isCorrect: true },
                        ],
                    },
                ],
            })
        );
        expect(screen.queryByText('The answer is 4.')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.hint_show'));
        expect(screen.getByText('The answer is 4.')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.hint_hide'));
        expect(screen.queryByText('The answer is 4.')).not.toBeInTheDocument();
    });

    it('shows the word count for open answers', () => {
        renderPage(
            makeTest({
                questions: [{ id: 'q1', prompt: 'Write an essay', type: 'open', points: 5 }],
            })
        );
        fireEvent.change(screen.getByPlaceholderText('tests.taking.open_answer_placeholder'), {
            target: { value: 'one two three' },
        });
        expect(screen.getByText('tests.taking.word_count {"count":3}')).toBeInTheDocument();
    });

    it('renders safe image stimulus and blocks javascript: URLs', () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'With image',
                        type: 'multiple-choice',
                        points: 1,
                        imageUrl: 'https://example.com/photo.png',
                        options: [{ id: 'a', text: 'OK', isCorrect: true }],
                    },
                    {
                        id: 'q2',
                        prompt: 'Blocked image',
                        type: 'multiple-choice',
                        points: 1,
                        imageUrl: "javascript:alert('xss')",
                        options: [{ id: 'a', text: 'OK', isCorrect: true }],
                    },
                ],
            })
        );
        const imgs = document.querySelectorAll('img');
        expect(imgs.length).toBe(1);
        expect(imgs[0].getAttribute('src')).toBe('https://example.com/photo.png');
    });

    it('answers a cloze-dropdown question', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'The capital of France is {{Paris|Lyon|Marseille}}.',
                        type: 'cloze-dropdown',
                        points: 1,
                    },
                ],
            })
        );
        expect(screen.getByText('tests.taking.cloze_dropdown_instruction')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Paris' } });
        const decoded = await submitSingle();
        expect(decoded!.answers[0].response).toBe(JSON.stringify({ 0: 'Paris' }));
    });

    it('answers a matching question', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Match the pairs',
                        type: 'matching',
                        points: 2,
                        matchingPairs: [{ id: 'p1', left: 'Apple', right: 'Fruit' }],
                    },
                ],
            })
        );
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } });
        const decoded = await submitSingle();
        expect(decoded!.answers[0].response).toBe(JSON.stringify({ p1: 'p1' }));
    });

    it('answers an ordering question by moving items', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Order the steps',
                        type: 'ordering',
                        points: 2,
                        orderItems: [
                            { id: 'o1', text: 'First' },
                            { id: 'o2', text: 'Second' },
                        ],
                    },
                ],
            })
        );
        // Move the first item down — its down-arrow is enabled, the second row's is not.
        const downButtons = screen.getAllByLabelText('tests.taking.move_item_down');
        expect(downButtons[0]).not.toBeDisabled();
        expect(downButtons[1]).toBeDisabled();
        // The shuffle order is seeded, so capture the rendered order first, then assert the swap.
        const before = screen.getAllByText(/^(First|Second)$/).map((e) => e.textContent);
        fireEvent.click(downButtons[0]);
        const after = screen.getAllByText(/^(First|Second)$/).map((e) => e.textContent);
        expect(after[0]).toBe(before[1]);
        expect(after[1]).toBe(before[0]);
        const decoded = await submitSingle();
        const order = JSON.parse(decoded!.answers[0].response) as string[];
        const idByText: Record<string, string> = { First: 'o1', Second: 'o2' };
        expect(order).toEqual(after.map((text) => idByText[text ?? '']));
    });

    it('answers a categorize question', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Sort the animals',
                        type: 'categorize',
                        points: 2,
                        categories: [{ id: 'animal', label: 'Animal' }],
                        categorizeItems: [{ id: 'i1', text: 'Dog', categoryId: 'animal' }],
                    },
                ],
            })
        );
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'animal' } });
        const decoded = await submitSingle();
        expect(decoded!.answers[0].response).toBe(JSON.stringify({ i1: 'animal' }));
    });

    it('answers a hot-text question by selecting fragments', async () => {
        renderPage(
            makeTest({
                questions: [
                    {
                        id: 'q1',
                        prompt: 'Select the adverbs',
                        type: 'hot-text',
                        points: 2,
                        hotTextPassage: 'The [[quick]] brown [[fox]] jumps.',
                        hotTextCorrectIndices: [0, 1],
                    },
                ],
            })
        );
        expect(screen.getByText('tests.taking.hot_text_instruction')).toBeInTheDocument();
        fireEvent.click(screen.getByText('quick'));
        fireEvent.click(screen.getByText('fox'));
        const decoded = await submitSingle();
        expect(JSON.parse(decoded!.answers[0].response) as number[]).toEqual([0, 1]);
    });
});

describe('StudentTestPage — navigation, flagging, retake', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    const twoQuestionTest = (overrides: Partial<Test> = {}) =>
        makeTest({
            questions: [
                {
                    id: 'q1',
                    prompt: 'First question',
                    type: 'multiple-choice',
                    points: 1,
                    options: [{ id: 'a', text: 'Option A', isCorrect: true }],
                },
                {
                    id: 'q2',
                    prompt: 'Second question',
                    type: 'multiple-choice',
                    points: 1,
                    options: [{ id: 'a', text: 'Option B', isCorrect: true }],
                },
            ],
            ...overrides,
        });

    it('updates progress, flags questions, and jumps via the timeline', () => {
        renderPage(twoQuestionTest());
        expect(screen.getByText('tests.taking.progress {"answered":0,"total":2}')).toBeInTheDocument();

        // Answer q1 and move on.
        fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
        expect(screen.getByText('tests.taking.progress {"answered":1,"total":2}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('Second question')).toBeInTheDocument();

        // Flag q2.
        const flagBtn = screen.getByText('tests.taking.flag');
        fireEvent.click(flagBtn);
        expect(screen.getByText('tests.taking.flagged')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.flagged'));
        expect(screen.getByText('tests.taking.flag')).toBeInTheDocument();

        // Go back with Previous.
        fireEvent.click(screen.getByText('tests.taking.previous'));
        expect(screen.getByText('First question')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.previous')).toBeDisabled();

        // Jump forward via the timeline palette.
        fireEvent.click(screen.getByLabelText('tests.taking.go_to_question {"number":2}'));
        expect(screen.getByText('Second question')).toBeInTheDocument();
    });

    it('shows the legend and section grouping in the timeline', () => {
        renderPage(
            twoQuestionTest({
                sections: [{ id: 'sec1', title: 'Part One' }],
                questions: [
                    {
                        id: 'q1',
                        prompt: 'First question',
                        type: 'multiple-choice',
                        points: 1,
                        sectionId: 'sec1',
                        options: [{ id: 'a', text: 'Option A', isCorrect: true }],
                    },
                    {
                        id: 'q2',
                        prompt: 'Second question',
                        type: 'multiple-choice',
                        points: 1,
                        sectionId: 'sec1',
                        options: [{ id: 'a', text: 'Option B', isCorrect: true }],
                    },
                ],
            })
        );
        expect(screen.getByLabelText('tests.taking.timeline_label')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.legend_answered')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.legend_unanswered')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.legend_unseen')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.legend_flagged')).toBeInTheDocument();
        // The section title groups the palette buttons + the label above the question card.
        expect(screen.getAllByText('Part One').length).toBeGreaterThanOrEqual(2);
    });

    it('copies the submission code', async () => {
        renderPage(twoQuestionTest());
        fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
        fireEvent.click(screen.getByText('tests.taking.next'));
        fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        await act(async () => {});
        expect(screen.getByText('tests.taking.copy')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.copy'));
        expect(screen.getByText('tests.taking.copied')).toBeInTheDocument();
    });

    it('retakes a practice test with allowMultipleAttempts', async () => {
        renderPage(twoQuestionTest({ mode: 'practice', allowMultipleAttempts: true }));
        fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
        fireEvent.click(screen.getByText('tests.taking.next'));
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        expect(screen.getByText('tests.taking.retake')).toBeInTheDocument();

        fireEvent.click(screen.getByText('tests.taking.retake'));
        // Back to a fresh attempt: q1 shown, nothing answered, progress reset.
        expect(screen.getByText('First question')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Option A' })).not.toBeChecked();
        expect(screen.getByText('tests.taking.progress {"answered":0,"total":2}')).toBeInTheDocument();
    });
});
