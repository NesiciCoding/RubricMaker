import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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

// useLiveSessionTelemetry's channel setup calls the real @supabase/supabase-js
// createClient whenever an assignment carries supabaseUrl (DB mode) — stub it so
// DB-mode tests below never attempt a real Realtime connection. Offline tests never
// set supabaseUrl, so hasDb is false there and this mock is simply never exercised,
// leaving their real-telemetry seb_status assertion unaffected.
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

const mockEnsureSession = vi.fn();
const mockFetchAssignmentContent = vi.fn();
const mockSubmitTest = vi.fn();

vi.mock('../../services/database/TestAdapter', () => ({
    TestAdapter: class {
        ensureSession = mockEnsureSession;
        fetchAssignmentContent = mockFetchAssignmentContent;
        submitTest = mockSubmitTest;
        getClient = () => ({});
    },
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

    it('shows per-question explanations after submitting a practice-mode test', async () => {
        const test = makeTest({
            mode: 'practice',
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
                    explanation: '4 is the sum of 2 and 2.',
                },
            ],
        });
        renderPage(makeAssignment({}, test));

        fireEvent.click(screen.getByRole('radio', { name: '4' }));

        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });

        expect(screen.getByText('4 is the sum of 2 and 2.')).toBeInTheDocument();
    });

    it('does not show explanations after submitting an assessment-mode test', async () => {
        const test = makeTest({
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
                    explanation: '4 is the sum of 2 and 2.',
                },
            ],
        });
        renderPage(makeAssignment({}, test));

        fireEvent.click(screen.getByRole('radio', { name: '4' }));

        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });

        expect(screen.queryByText('4 is the sum of 2 and 2.')).not.toBeInTheDocument();
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

describe('StudentTestPage — DB mode (TestAdapter, short-code link)', () => {
    // A real DB-mode link is just the bare test_assignments row id (teacherKey) —
    // encodeTestAssignment strips everything else once supabaseUrl is set. The page
    // must reconstruct supabaseUrl/supabaseAnonKey from rm_supabase_config (same as
    // StudentEssayPage's short-code handling) and fetch testId/studentId/the test
    // itself from the edge function — none of that travels in the URL.
    const SHORT_CODE = 'test-assignment-row-id-21c';

    function renderDbPage() {
        localStorage.setItem(
            'rm_supabase_config',
            JSON.stringify({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key' })
        );
        render(
            <MemoryRouter initialEntries={[`/test/${SHORT_CODE}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
    }

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        mockEnsureSession.mockReset();
        mockFetchAssignmentContent.mockReset();
        mockSubmitTest.mockReset();
    });

    it('shows an invalid-link message for a short-code link with no reachable Supabase config', () => {
        // No rm_supabase_config set and no VITE_SUPABASE_* env vars in this test env —
        // a short-code link has nowhere to source credentials from, so it must not
        // silently proceed (this was the actual bug: decodeTestAssignment alone can
        // never parse a bare teacherKey, since it expects base64 JSON).
        render(
            <MemoryRouter initialEntries={[`/test/${SHORT_CODE}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText('tests.taking.invalid_link_title')).toBeInTheDocument();
        expect(mockEnsureSession).not.toHaveBeenCalled();
    });

    it('fetches content via TestAdapter and renders the test once loaded', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({
            ok: true,
            data: {
                testId: 'test1',
                studentId: 's1',
                requireSEB: false,
                durationMinutes: null,
                expiresAt: null,
                test: makeTest(),
            },
        });

        renderDbPage();

        await waitFor(() => expect(screen.getByText('Sample Test')).toBeInTheDocument());
        // Not asserting an exact call count: this file's inline useTranslation mock
        // returns a new `t` identity every render (unlike the real hook, which
        // memoizes it), which can trigger a harmless extra effect re-run here.
        expect(mockEnsureSession).toHaveBeenCalled();
        expect(mockFetchAssignmentContent).toHaveBeenCalledWith(SHORT_CODE);
    });

    it('shows a load error when the edge function fetch fails', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: false, reason: 'not_found' });

        renderDbPage();

        await waitFor(() => expect(screen.getByText('tests.taking.load_error_title')).toBeInTheDocument());
    });

    it('shows the expired guard (no date) when the edge function returns expired', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: false, reason: 'expired' });

        renderDbPage();

        await waitFor(() => expect(screen.getByText(/tests\.taking\.expired_title/)).toBeInTheDocument());
        expect(screen.getByText('tests.taking.expired_desc_no_date')).toBeInTheDocument();
    });

    it('shows a load error when anonymous sign-in fails', async () => {
        mockEnsureSession.mockResolvedValue({ ok: false, error: 'Anonymous sign-ins are disabled' });

        renderDbPage();

        await waitFor(() => expect(screen.getByText('tests.taking.load_error_title')).toBeInTheDocument());
        expect(mockFetchAssignmentContent).not.toHaveBeenCalled();
    });

    it('submits via adapter.submitTest and shows the DB success message', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({
            ok: true,
            data: {
                testId: 'test1',
                studentId: 's1',
                requireSEB: false,
                durationMinutes: null,
                expiresAt: null,
                test: makeTest(),
            },
        });
        mockSubmitTest.mockResolvedValue({ success: true });

        renderDbPage();
        await waitFor(() => expect(screen.getByText('Sample Test')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.next'));
        fireEvent.change(screen.getByPlaceholderText('tests.taking.open_answer_placeholder'), {
            target: { value: 'I love autumn.' },
        });

        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });

        expect(screen.getByText('tests.taking.submitted_title_db')).toBeInTheDocument();
        expect(mockSubmitTest).toHaveBeenCalledWith(
            SHORT_CODE,
            expect.any(String),
            expect.arrayContaining([
                expect.objectContaining({ questionId: 'q1', response: 'b' }),
                expect.objectContaining({ questionId: 'q2', response: 'I love autumn.' }),
            ]),
            expect.any(String),
            expect.any(String),
            expect.any(Array)
        );
    });

    it('shows submitError and still offers the legacy code when submitTest fails', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({
            ok: true,
            data: {
                testId: 'test1',
                studentId: 's1',
                requireSEB: false,
                durationMinutes: null,
                expiresAt: null,
                test: makeTest(),
            },
        });
        mockSubmitTest.mockResolvedValue({ success: false, error: 'Server error 500' });

        renderDbPage();
        await waitFor(() => expect(screen.getByText('Sample Test')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.next'));

        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });

        expect(screen.getByText('tests.taking.submit_error_db')).toBeInTheDocument();
        // Falls back to the legacy code textarea so the student isn't stuck.
        const textarea = screen.getByDisplayValue(/.+/) as HTMLTextAreaElement;
        expect(decodeTestSubmission(textarea.value)).not.toBeNull();
    });
});
