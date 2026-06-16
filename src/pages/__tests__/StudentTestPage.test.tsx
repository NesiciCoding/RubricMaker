import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import StudentTestPage from '../StudentTestPage';

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 'test1',
    name: 'Sample Test',
    questions: [
        {
            id: 'q1',
            prompt: 'What is 2 + 2?',
            type: 'multiple-choice',
            points: 1,
            options: [
                { id: 'a', text: '3', isCorrect: false },
                { id: 'b', text: '4', isCorrect: true },
            ],
        },
        {
            id: 'q2',
            prompt: 'Describe your favourite season.',
            type: 'open',
            points: 2,
        },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeAssignment = (
    overrides: Partial<TestAssignmentPayload> = {},
    test: Test = makeTest()
): TestAssignmentPayload & { test: Test } => ({
    testId: 'test1',
    studentId: 's1',
    teacherKey: 'tk1',
    requireSEB: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    test,
    ...overrides,
});

function renderPage(assignment: TestAssignmentPayload & { test?: Test }) {
    const code = encodeTestAssignment(assignment as TestAssignmentPayload);
    render(
        <MemoryRouter initialEntries={[`/test/${code}`]}>
            <Routes>
                <Route path="/test/:code" element={<StudentTestPage />} />
            </Routes>
        </MemoryRouter>
    );
    return code;
}

describe('StudentTestPage — decode and render', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('shows an invalid-link message for an undecodable code', () => {
        render(
            <MemoryRouter initialEntries={['/test/not-a-real-code']}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText('tests.taking.invalid_link_title')).toBeInTheDocument();
    });

    it('shows an expired message when the assignment has passed its expiry', () => {
        renderPage(makeAssignment({ expiresAt: '2020-01-01T00:00:00.000Z' }));
        expect(screen.getByText(/tests\.taking\.expired_title/)).toBeInTheDocument();
    });

    it('renders the test name and the first question', () => {
        renderPage(makeAssignment());
        expect(screen.getByText('Sample Test')).toBeInTheDocument();
        expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    });

    it('renders multiple-choice options as radio buttons', () => {
        renderPage(makeAssignment());
        expect(screen.getByRole('radio', { name: '3' })).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: '4' })).toBeInTheDocument();
    });

    it('navigates to the next question and renders the open-answer textarea', () => {
        renderPage(makeAssignment());
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('Describe your favourite season.')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('tests.taking.open_answer_placeholder')).toBeInTheDocument();
    });
});

describe('StudentTestPage — answering and offline submission', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('produces a decodable submission code containing answers and events on submit', async () => {
        renderPage(makeAssignment());

        // Answer Q1 (multiple choice)
        fireEvent.click(screen.getByRole('radio', { name: '4' }));

        // Move to Q2 and answer (open)
        fireEvent.click(screen.getByText('tests.taking.next'));
        fireEvent.change(screen.getByPlaceholderText('tests.taking.open_answer_placeholder'), {
            target: { value: 'I love autumn.' },
        });

        // Submit
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });

        expect(screen.getByText(/tests\.taking\.submitted_title\b/)).toBeInTheDocument();

        const textarea = screen.getByDisplayValue(/.+/) as HTMLTextAreaElement;
        const decoded = decodeTestSubmission(textarea.value);
        expect(decoded).not.toBeNull();
        expect(decoded!.testId).toBe('test1');
        expect(decoded!.studentId).toBe('s1');
        expect(decoded!.answers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ questionId: 'q1', response: 'b' }),
                expect.objectContaining({ questionId: 'q2', response: 'I love autumn.' }),
            ])
        );
        expect(Array.isArray(decoded!.events)).toBe(true);
        expect(decoded!.events!.some((e) => e.type === 'seb_status')).toBe(true);
    });

    it('restores a draft answer from localStorage on reload', () => {
        const assignment = makeAssignment();
        const code = encodeTestAssignment(assignment as TestAssignmentPayload);
        localStorage.setItem(
            `rm_test_draft_${code}`,
            JSON.stringify({ answers: { q1: 'b' }, savedAt: new Date().toISOString() })
        );

        render(
            <MemoryRouter initialEntries={[`/test/${code}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('tests.taking.draft_restored')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: '4' })).toBeChecked();
    });
});

describe('StudentTestPage — timer auto-submit', () => {
    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('auto-submits when the countdown reaches zero', async () => {
        vi.useFakeTimers();
        renderPage(makeAssignment({ durationMinutes: 1 }));

        await act(async () => {
            vi.advanceTimersByTime(61_000);
        });

        expect(screen.getByText(/tests\.taking\.submitted_title\b/)).toBeInTheDocument();
    });
});
