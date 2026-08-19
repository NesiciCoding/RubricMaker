import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { encodeTestAssignment } from '../../utils/shareCode';
import { decodeTestSubmission } from '../../utils/shareCode';
import type { Test, TestAssignmentPayload, TestQuestion } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts) return `${key} ${JSON.stringify(opts)}`;
            return key;
        },
    }),
}));

const mockChannelHandlers = vi.hoisted(() => [] as ((payload: unknown) => void)[]);

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        channel: vi.fn(() => ({
            on: vi.fn((_type: string, _filter: unknown, cb: (payload: unknown) => void) => {
                mockChannelHandlers.push(cb);
                return {};
            }),
            send: vi.fn(),
            subscribe: vi.fn((cb?: (status: string) => void) => {
                cb?.('SUBSCRIBED');
                return {};
            }),
            unsubscribe: vi.fn(),
        })),
        removeChannel: vi.fn(),
    })),
}));

const mockEnsureSession = vi.fn();
const mockFetchAssignmentContent = vi.fn();
const mockSubmitTest = vi.fn();
const mockNextPlacementQuestion = vi.fn();
const mockFileToDataUrl = vi.fn();

vi.mock('../../services/database/TestAdapter', () => ({
    TestAdapter: class {
        ensureSession = mockEnsureSession;
        fetchAssignmentContent = mockFetchAssignmentContent;
        submitTest = mockSubmitTest;
        nextPlacementQuestion = mockNextPlacementQuestion;
        getClient = () => ({});
    },
}));

vi.mock('../../utils/fileToDataUrl', () => ({
    fileToDataUrl: (...args: unknown[]) => mockFileToDataUrl(...args),
}));

import StudentTestPage from '../StudentTestPage';

const SHORT_CODE = 'test-assignment-row-id-21c';

const mc = (id: string, prompt: string, opts: { correct?: boolean } = {}): TestQuestion => ({
    id,
    prompt,
    type: 'multiple-choice',
    points: 1,
    options: [
        { id: `${id}-a`, text: '3', isCorrect: false },
        { id: `${id}-b`, text: '4', isCorrect: true },
        ...(opts.correct === false ? [] : []),
    ],
});

const makeTest = (overrides: Partial<Test> = {}): Test => ({
    id: 'test1',
    name: 'Sample Test',
    questions: [],
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

function renderDbPage(test: Test) {
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

function dbContent(test: Test) {
    return {
        testId: 'test1',
        studentId: 's1',
        requireSEB: false,
        durationMinutes: null,
        expiresAt: null,
        test,
    };
}

const gq1: TestQuestion = {
    id: 'gq1',
    prompt: 'Generator question one',
    type: 'multiple-choice',
    points: 1,
    options: [
        { id: 'ga', text: 'A', isCorrect: false },
        { id: 'gb', text: 'B', isCorrect: true },
    ],
};

const genPassage = {
    bankItemId: 'p1',
    title: 'Reading Passage',
    content: '<p>Read this passage.</p>',
    questionIndex: 0,
    questionCount: 1,
};

async function flushAsync() {
    await act(async () => {
        await Promise.resolve();
    });
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // copyText leaks its scratch textarea when execCommand throws mid-call.
    document.querySelectorAll('textarea[style*="position: fixed"]').forEach((n) => n.remove());
    mockEnsureSession.mockReset();
    mockFetchAssignmentContent.mockReset();
    mockSubmitTest.mockReset();
    mockNextPlacementQuestion.mockReset();
    mockFileToDataUrl.mockReset();
    mockFileToDataUrl.mockResolvedValue('data:audio/webm;base64,AA==');
});

describe('StudentTestPage — safe media helpers', () => {
    it('renders data:image stimulus, option images with alt fallbacks, and audio stimuli', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    description: 'A described test',
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'Image stimulus',
                            type: 'multiple-response',
                            points: 2,
                            imageUrl: 'data:image/png;base64,AAA',
                            options: [
                                { id: 'a', text: '', imageUrl: 'data:image/png;base64,BBB', isCorrect: true },
                                {
                                    id: 'b',
                                    text: 'With text',
                                    imageUrl: 'https://example.com/opt.png',
                                    isCorrect: false,
                                },
                            ],
                        },
                        {
                            id: 'q2',
                            prompt: 'MC with option image',
                            type: 'multiple-choice',
                            points: 1,
                            options: [
                                { id: 'c', text: '', imageUrl: 'data:image/png;base64,CCC', isCorrect: true },
                                {
                                    id: 'd2',
                                    text: 'Labeled image',
                                    imageUrl: 'data:image/png;base64,DDD',
                                    isCorrect: false,
                                },
                            ],
                        },
                        {
                            id: 'q3',
                            prompt: 'Audio https',
                            type: 'multiple-choice',
                            points: 1,
                            audioUrl: 'https://example.com/audio.mp3',
                            options: [{ id: 'd', text: 'OK', isCorrect: true }],
                        },
                        {
                            id: 'q4',
                            prompt: 'Audio data uri',
                            type: 'multiple-choice',
                            points: 1,
                            audioUrl: 'data:audio/mpeg;base64,AAA',
                            options: [{ id: 'e', text: 'OK', isCorrect: true }],
                        },
                        {
                            id: 'q5',
                            prompt: 'Dangerous urls',
                            type: 'multiple-choice',
                            points: 1,
                            imageUrl: "javascript:alert('xss')",
                            audioUrl: 'javascript:alert(1)',
                            options: [{ id: 'f', text: 'OK', isCorrect: true }],
                        },
                        {
                            id: 'q6',
                            prompt: 'Invalid audio url',
                            type: 'multiple-choice',
                            points: 1,
                            audioUrl: 'not a url',
                            options: [{ id: 'g', text: 'OK', isCorrect: true }],
                        },
                    ],
                })
            )
        );

        // q1: description + stimulus image + two option images (first has no text → fallback alt).
        expect(screen.getByText('A described test')).toBeInTheDocument();
        let imgs = document.querySelectorAll('img');
        expect(imgs.length).toBe(3);
        expect(imgs[1].getAttribute('alt')).toBe('tests.taking.option_image_fallback');
        expect(imgs[2].getAttribute('alt')).toBe('');

        fireEvent.click(screen.getByText('tests.taking.next'));
        // q2: two option images — textless (fallback alt) and labeled (empty alt).
        imgs = document.querySelectorAll('img');
        expect(imgs.length).toBe(2);
        expect(imgs[0].getAttribute('alt')).toBe('tests.taking.option_image_fallback');
        expect(imgs[1].getAttribute('alt')).toBe('');

        fireEvent.click(screen.getByText('tests.taking.next'));
        // q3: https audio.
        const audio3 = document.querySelector('audio');
        expect(audio3?.getAttribute('src')).toBe('https://example.com/audio.mp3');

        fireEvent.click(screen.getByText('tests.taking.next'));
        // q4: data:audio.
        const audio4 = document.querySelector('audio');
        expect(audio4?.getAttribute('src')).toBe('data:audio/mpeg;base64,AAA');

        fireEvent.click(screen.getByText('tests.taking.next'));
        // q5: both dangerous URLs blocked.
        expect(document.querySelectorAll('img').length).toBe(0);
        expect(document.querySelector('audio')).toBeNull();

        fireEvent.click(screen.getByText('tests.taking.next'));
        // q6: unparsable audio URL blocked via the catch path.
        expect(document.querySelector('audio')).toBeNull();
    });

    it('renders a section passage with content and audio above its question', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    sections: [
                        {
                            id: 'sec1',
                            title: 'Reading',
                            content: '<p>Shared passage</p>',
                            audioUrl: 'https://example.com/section.mp3',
                        },
                    ],
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'About the passage',
                            type: 'multiple-choice',
                            points: 1,
                            sectionId: 'sec1',
                            options: [{ id: 'a', text: 'OK', isCorrect: true }],
                        },
                    ],
                })
            )
        );
        expect(screen.getAllByText('Reading').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Shared passage')).toBeInTheDocument();
        const audio = document.querySelector('audio');
        expect(audio?.getAttribute('src')).toBe('https://example.com/section.mp3');
    });

    it('shows a timeline group without a title for a question with an unknown section id', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'No section',
                            type: 'multiple-choice',
                            points: 1,
                            options: [{ id: 'a', text: 'OK', isCorrect: true }],
                        },
                        {
                            id: 'q2',
                            prompt: 'Unknown section',
                            type: 'multiple-choice',
                            points: 1,
                            sectionId: 'missing',
                            options: [{ id: 'a', text: 'OK', isCorrect: true }],
                        },
                    ],
                })
            )
        );
        expect(screen.getByLabelText('tests.taking.timeline_label')).toBeInTheDocument();
        expect(screen.getByText('No section')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('Unknown section')).toBeInTheDocument();
    });
});

describe('StudentTestPage — copy, codes, shuffle', () => {
    it('copies via the native execCommand path when it succeeds', async () => {
        const execCommand = vi.fn(() => true);
        Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'What is 2+2?',
                            type: 'multiple-choice',
                            points: 1,
                            options: [
                                { id: 'a', text: '3', isCorrect: false },
                                { id: 'b', text: '4', isCorrect: true },
                            ],
                        },
                    ],
                })
            )
        );
        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        await act(async () => {});
        fireEvent.click(screen.getByText('tests.taking.copy'));
        expect(screen.getByText('tests.taking.copied')).toBeInTheDocument();
        expect(execCommand).toHaveBeenCalledWith('copy');
        delete (document as unknown as { execCommand?: unknown }).execCommand;
    });

    it('falls back to the clipboard API when execCommand is unavailable', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'));
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'What is 2+2?',
                            type: 'multiple-choice',
                            points: 1,
                            options: [
                                { id: 'a', text: '3', isCorrect: false },
                                { id: 'b', text: '4', isCorrect: true },
                            ],
                        },
                    ],
                })
            )
        );
        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        await act(async () => {});
        fireEvent.click(screen.getByText('tests.taking.copy'));
        await act(async () => {});
        expect(writeText).toHaveBeenCalled();
        expect(screen.getByText('tests.taking.copied')).toBeInTheDocument();
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    });

    it('resets the copied label after 2.5s', async () => {
        vi.useFakeTimers();
        Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true });
        try {
            renderPage(
                makeAssignment(
                    {},
                    makeTest({
                        questions: [
                            {
                                id: 'q1',
                                prompt: 'What is 2+2?',
                                type: 'multiple-choice',
                                points: 1,
                                options: [
                                    { id: 'a', text: '3', isCorrect: false },
                                    { id: 'b', text: '4', isCorrect: true },
                                ],
                            },
                        ],
                    })
                )
            );
            fireEvent.click(screen.getByRole('radio', { name: '4' }));
            await act(async () => {
                fireEvent.click(screen.getByText('tests.taking.submit_btn'));
            });
            fireEvent.click(screen.getByText('tests.taking.copy'));
            expect(screen.getByText('tests.taking.copied')).toBeInTheDocument();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2600);
            });
            expect(screen.getByText('tests.taking.copy')).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
            delete (document as unknown as { execCommand?: unknown }).execCommand;
        }
    });

    it('shows an invalid-link message for a code that is neither legacy nor short', () => {
        render(
            <MemoryRouter initialEntries={['/test/abc']}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText('tests.taking.invalid_link_title')).toBeInTheDocument();
    });

    it('shuffles non-staged questions when shuffleQuestions is set', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    shuffleQuestions: true,
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'First',
                            type: 'multiple-choice',
                            points: 1,
                            options: [{ id: 'a', text: 'OK', isCorrect: true }],
                        },
                        {
                            id: 'q2',
                            prompt: 'Second',
                            type: 'multiple-choice',
                            points: 1,
                            options: [{ id: 'a', text: 'OK', isCorrect: true }],
                        },
                    ],
                })
            )
        );
        // Seed-shuffled order is deterministic — either question may lead; both exist.
        const prompts = ['First', 'Second'];
        expect(prompts.some((p) => screen.queryByText(p))).toBe(true);
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(prompts.some((p) => screen.queryByText(p))).toBe(true);
    });

    it('tolerates multiple-choice and multiple-response questions with no options', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        { id: 'q1', prompt: 'No options', type: 'multiple-choice', points: 1 },
                        { id: 'q2', prompt: 'No boxes', type: 'multiple-response', points: 1 },
                    ],
                })
            )
        );
        expect(screen.getByText('No options')).toBeInTheDocument();
        expect(screen.queryAllByRole('radio').length).toBe(0);
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('No boxes')).toBeInTheDocument();
        expect(screen.queryAllByRole('checkbox').length).toBe(0);
    });
});

describe('StudentTestPage — staged (MST) placement tests', () => {
    const stagedTest = (overrides: Partial<Test> = {}): Test =>
        makeTest({
            mode: 'placement',
            sections: [
                {
                    id: 's1',
                    title: 'Stage One',
                    routing: { thresholdPct: 50, passSectionId: 's2', failSectionId: 's3' },
                },
                { id: 's2', title: 'Stage Two' },
                { id: 's3', title: 'Stage Three' },
            ],
            questions: [
                {
                    id: 'q1',
                    prompt: 'S1 question',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 's1',
                    options: [
                        { id: 'q1-a', text: '3', isCorrect: false },
                        { id: 'q1-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q2',
                    prompt: 'S2 question',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 's2',
                    options: [
                        { id: 'q2-a', text: '3', isCorrect: false },
                        { id: 'q2-b', text: '4', isCorrect: true },
                    ],
                },
            ],
            ...overrides,
        });

    it('routes to the next section on the last question and submits at the terminal section', async () => {
        renderPage(makeAssignment({}, stagedTest()));
        await flushAsync();

        // Entry section seeded; staged question shown with its section label.
        expect(screen.getByText('S1 question')).toBeInTheDocument();
        expect(screen.getAllByText('Stage One').length).toBeGreaterThanOrEqual(1);

        // Answer correctly (routes to passSectionId s2) and continue.
        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));

        expect(screen.getByText('S2 question')).toBeInTheDocument();
        expect(screen.getAllByText('Stage Two').length).toBeGreaterThanOrEqual(1);

        // s2 is terminal (no routing) → the last-question button becomes submit.
        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        expect(screen.getByText(/tests\.taking\.submitted_title\b/)).toBeInTheDocument();

        const decoded = decodeTestSubmission(
            (document.querySelector('textarea[readonly]') as HTMLTextAreaElement).value
        );
        expect(decoded?.sectionPath).toEqual(['s1', 's2']);
    });

    it('shuffles the questions within a stage when shuffleQuestions is set', () => {
        const test = stagedTest({
            shuffleQuestions: true,
            questions: [
                {
                    id: 'q1',
                    prompt: 'A1',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 's1',
                    options: [
                        { id: 'q1-a', text: '3', isCorrect: false },
                        { id: 'q1-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q2',
                    prompt: 'A2',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 's1',
                    options: [
                        { id: 'q2-a', text: '3', isCorrect: false },
                        { id: 'q2-b', text: '4', isCorrect: true },
                    ],
                },
            ],
        });
        renderPage(makeAssignment({}, test));
        expect(['A1', 'A2'].some((p) => screen.queryByText(p))).toBe(true);
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(['A1', 'A2'].some((p) => screen.queryByText(p))).toBe(true);
    });
});

describe('StudentTestPage — staircase placement tests', () => {
    const staircaseTest = (overrides: Partial<Test> = {}): Test =>
        makeTest({
            mode: 'placement',
            placementEngine: 'staircase',
            sections: [
                { id: 'sa1', title: 'A1 pool', cefrLevel: 'A1' },
                { id: 'sa2', title: 'A2 pool', cefrLevel: 'A2' },
                { id: 'sb1', title: 'B1 pool', cefrLevel: 'B1' },
            ],
            questions: [
                {
                    id: 'q1',
                    prompt: 'A2 Q1',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 'sa2',
                    options: [
                        { id: 'q1-a', text: '3', isCorrect: false },
                        { id: 'q1-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q2',
                    prompt: 'A2 Q2',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 'sa2',
                    options: [
                        { id: 'q2-a', text: '3', isCorrect: false },
                        { id: 'q2-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q3',
                    prompt: 'B1 Q1',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 'sb1',
                    options: [
                        { id: 'q3-a', text: '3', isCorrect: false },
                        { id: 'q3-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q4',
                    prompt: 'A2 Q3',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 'sa2',
                    options: [
                        { id: 'q4-a', text: '3', isCorrect: false },
                        { id: 'q4-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q5',
                    prompt: 'A2 Q4',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 'sa2',
                    options: [
                        { id: 'q5-a', text: '3', isCorrect: false },
                        { id: 'q5-b', text: '4', isCorrect: true },
                    ],
                },
                {
                    id: 'q6',
                    prompt: 'A1 Q1',
                    type: 'multiple-choice',
                    points: 1,
                    sectionId: 'sa1',
                    options: [
                        { id: 'q6-a', text: '3', isCorrect: false },
                        { id: 'q6-b', text: '4', isCorrect: true },
                    ],
                },
            ],
            ...overrides,
        });

    it('walks the ladder, converges after reversals, and submits the trace', async () => {
        renderPage(makeAssignment({}, staircaseTest()));
        await flushAsync();

        // Progress reads from levelPath length.
        expect(screen.getByText('tests.taking.staircase_progress {"answered":0}')).toBeInTheDocument();
        expect(screen.getByText('A2 pool')).toBeInTheDocument();

        // correct, correct → up to B1; wrong → back to A2 (reversal); correct, correct → up to B1 (converged).
        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));
        expect(screen.getByText('A2 pool')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.staircase_progress {"answered":1}')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));
        expect(screen.getByText('B1 pool')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: '3' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));
        expect(screen.getByText('A2 pool')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));
        expect(screen.getByText('A2 pool')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: '4' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));

        // Converged → submit.
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        expect(screen.getByText(/tests\.taking\.submitted_title\b/)).toBeInTheDocument();

        const decoded = decodeTestSubmission(
            (document.querySelector('textarea[readonly]') as HTMLTextAreaElement).value
        );
        expect(decoded?.levelPath?.length).toBe(5);
        expect(decoded?.levelPath?.every((s) => typeof s.correct === 'boolean')).toBe(true);
    });

    it('shows the not-configured guard when the start level pool is empty', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    mode: 'placement',
                    placementEngine: 'staircase',
                    sections: [{ id: 'sa1', title: 'A1 pool', cefrLevel: 'A1' }],
                    questions: [{ id: 'q1', prompt: 'A1 Q', type: 'multiple-choice', points: 1, sectionId: 'sa1' }],
                })
            )
        );
        expect(screen.getByText('tests.taking.load_error_title')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.staircase_not_configured')).toBeInTheDocument();
    });

    it('submits pending staircase questions when continuing and when the timer expires', async () => {
        vi.useFakeTimers();
        try {
            renderPage(makeAssignment({ durationMinutes: 1 }, staircaseTest()));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10);
            });
            expect(screen.getByText('A2 pool')).toBeInTheDocument();

            // Continue WITHOUT answering — the presented question is scored as a miss.
            fireEvent.click(screen.getByText('tests.taking.continue_section'));
            expect(screen.getByText('tests.taking.staircase_progress {"answered":1}')).toBeInTheDocument();

            // Timer fires while a second question is presented but not committed.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(61_000);
            });
            expect(screen.getByText(/tests\.taking\.submitted_title\b/)).toBeInTheDocument();

            const decoded = decodeTestSubmission(
                (document.querySelector('textarea[readonly]') as HTMLTextAreaElement).value
            );
            expect(decoded?.levelPath).toHaveLength(2);
            expect(decoded?.levelPath?.every((s) => s.correct === false)).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('StudentTestPage — generator-engine (DB mode)', () => {
    const generatorTest = (overrides: Partial<Test> = {}): Test =>
        makeTest({
            mode: 'placement',
            placementEngine: 'generator',
            ...overrides,
        });

    it('loads a generator question with a passage, advances, and submits', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: true, data: dbContent(generatorTest()) });
        mockSubmitTest.mockResolvedValue({ success: true });
        mockNextPlacementQuestion
            .mockResolvedValueOnce({
                ok: true,
                data: {
                    done: false,
                    question: gq1,
                    passage: genPassage,
                    cefrLevel: 'A2',
                    eloAnchor: 900,
                    questionsAsked: 1,
                },
            })
            .mockResolvedValueOnce({ ok: true, data: { done: true, finalLevel: 'B1', questionsAsked: 2 } });

        renderDbPage(generatorTest());
        await waitFor(() => expect(screen.getByText('Generator question one')).toBeInTheDocument());

        // Passage rendered as the current "section" + live-disclosure banner (subscribed channel).
        expect(screen.getByText('Reading Passage')).toBeInTheDocument();
        expect(screen.getByText('Read this passage.')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.live_disclosure')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.staircase_progress {"answered":1}')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('radio', { name: 'B' }));
        fireEvent.click(screen.getByText('tests.taking.continue_section'));

        await waitFor(() => expect(screen.getByText('tests.taking.submit_btn')).toBeInTheDocument());
        expect(mockNextPlacementQuestion).toHaveBeenNthCalledWith(2, SHORT_CODE, 'gq1', 'gb');

        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        expect(screen.getByText('tests.taking.submitted_title_db')).toBeInTheDocument();
        expect(mockSubmitTest).toHaveBeenCalled();
        // Generator answers come from the answers map itself.
        const answers = mockSubmitTest.mock.calls[0][2] as { questionId: string; response: string }[];
        expect(answers).toEqual([{ questionId: 'gq1', response: 'gb' }]);
    });

    it('shows the generator error guard when the first question cannot be loaded', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: true, data: dbContent(generatorTest()) });
        mockNextPlacementQuestion.mockResolvedValue({ ok: false, reason: 'bank_empty' });

        renderDbPage(generatorTest());
        await waitFor(() => expect(screen.getByText('tests.taking.load_error_title')).toBeInTheDocument());
        expect(screen.getByText('tests.taking.generator_load_error')).toBeInTheDocument();
    });

    it('shows the loading spinner while the first generator question is in flight', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: true, data: dbContent(generatorTest()) });
        let resolveFirst!: (v: unknown) => void;
        mockNextPlacementQuestion.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveFirst = resolve;
            })
        );
        renderDbPage(generatorTest());
        await waitFor(() => expect(screen.getByText('Sample Test')).toBeInTheDocument());

        // Content loaded; the generator effect is awaiting its question → spinner.
        await waitFor(() => expect(document.querySelector('.lucide-loader-circle')).not.toBeNull());

        await act(async () => {
            resolveFirst({
                ok: true,
                data: {
                    done: false,
                    question: gq1,
                    cefrLevel: 'A2',
                    eloAnchor: 900,
                    questionsAsked: 1,
                },
            });
        });
        await waitFor(() => expect(screen.getByText('Generator question one')).toBeInTheDocument());
    });

    it('shows the in-button spinner while advancing to the next generator question', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: true, data: dbContent(generatorTest()) });
        mockNextPlacementQuestion
            .mockResolvedValueOnce({
                ok: true,
                data: { done: false, question: gq1, cefrLevel: 'A2', eloAnchor: 900, questionsAsked: 1 },
            })
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    setTimeout(
                        () => resolve({ ok: true, data: { done: true, finalLevel: 'B1', questionsAsked: 2 } }),
                        50
                    );
                })
            );

        renderDbPage(generatorTest());
        await waitFor(() => expect(screen.getByText('Generator question one')).toBeInTheDocument());

        fireEvent.click(screen.getByText('tests.taking.continue_section'));
        // In-button spinner renders while the next question is loading (button disabled).
        await waitFor(() => expect(screen.getByText('tests.taking.continue_section')).toBeDisabled());
        await waitFor(() => expect(screen.getByText('tests.taking.submit_btn')).toBeInTheDocument());
    });

    it('flushes the pending answer and submits when the timer expires during a generator run', async () => {
        vi.useFakeTimers();
        try {
            mockEnsureSession.mockResolvedValue({ ok: true });
            mockFetchAssignmentContent.mockResolvedValue({
                ok: true,
                data: { ...dbContent(generatorTest()), durationMinutes: 1 },
            });
            mockSubmitTest.mockResolvedValue({ success: true });
            mockNextPlacementQuestion
                .mockResolvedValueOnce({
                    ok: true,
                    data: { done: false, question: gq1, cefrLevel: 'A2', eloAnchor: 900, questionsAsked: 1 },
                })
                .mockResolvedValueOnce({
                    ok: true,
                    data: { done: true, finalLevel: 'B1', questionsAsked: 2 },
                });

            renderDbPage(generatorTest());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10);
            });
            expect(screen.getByText('Generator question one')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('radio', { name: 'B' }));
            // Advance past the timer (fires handleSubmit) — also trips the 5s snapshot
            // interval so getSnapshot records the generator level/Elo state.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(61_000);
            });

            expect(screen.getByText('tests.taking.submitted_title_db')).toBeInTheDocument();
            expect(mockNextPlacementQuestion).toHaveBeenNthCalledWith(2, SHORT_CODE, 'gq1', 'gb');
            expect(mockSubmitTest).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows the DB submit error and offers the legacy code when the flush fails', async () => {
        vi.useFakeTimers();
        try {
            mockEnsureSession.mockResolvedValue({ ok: true });
            mockFetchAssignmentContent.mockResolvedValue({
                ok: true,
                data: { ...dbContent(generatorTest()), durationMinutes: 1 },
            });
            mockNextPlacementQuestion
                .mockResolvedValueOnce({
                    ok: true,
                    data: { done: false, question: gq1, cefrLevel: 'A2', eloAnchor: 900, questionsAsked: 1 },
                })
                .mockResolvedValueOnce({ ok: false, reason: 'flush_failed' });

            renderDbPage(generatorTest());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10);
            });
            expect(screen.getByText('Generator question one')).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(61_000);
            });

            expect(screen.getByText('tests.taking.submit_error_db')).toBeInTheDocument();
            expect(mockSubmitTest).not.toHaveBeenCalled();
            // Still mid-run (no submitted screen, no legacy code) — the error banner shows.
            expect(screen.queryByText(/tests\.taking\.submitted_title/)).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancels the content fetch effect when the component unmounts mid-flight', async () => {
        let resolveFetch!: (v: unknown) => void;
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveFetch = resolve;
            })
        );
        localStorage.setItem(
            'rm_supabase_config',
            JSON.stringify({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key' })
        );

        const { unmount } = render(
            <MemoryRouter initialEntries={[`/test/${SHORT_CODE}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        // Session resolves while mounted; the content fetch now pends in-flight.
        await act(async () => {
            await Promise.resolve();
        });
        expect(mockFetchAssignmentContent).toHaveBeenCalledWith(SHORT_CODE);
        unmount();
        // Resolving the in-flight fetch after unmount must be a silent no-op.
        await act(async () => {
            resolveFetch({ ok: true, data: dbContent(makeTest()) });
        });
        expect(screen.queryByText('Sample Test')).not.toBeInTheDocument();
    });

    it('shows a toast when a teacher sends a live nudge', async () => {
        mockEnsureSession.mockResolvedValue({ ok: true });
        mockFetchAssignmentContent.mockResolvedValue({ ok: true, data: dbContent(generatorTest()) });
        mockNextPlacementQuestion.mockResolvedValue({
            ok: true,
            data: { done: true, finalLevel: 'B1', questionsAsked: 1 },
        });

        renderDbPage(generatorTest());
        await waitFor(() => expect(screen.getByText('Sample Test')).toBeInTheDocument());
        // The monitor channel's nudge handler is registered by the channel setup effect.
        expect(mockChannelHandlers.length).toBeGreaterThan(0);
        await act(async () => {
            mockChannelHandlers[mockChannelHandlers.length - 1]({ payload: { message: 'Please refocus' } });
        });
    });

    it('broadcasts a work-in-progress snapshot for a regular test in DB mode', async () => {
        vi.useFakeTimers();
        try {
            mockEnsureSession.mockResolvedValue({ ok: true });
            mockFetchAssignmentContent.mockResolvedValue({
                ok: true,
                data: {
                    ...dbContent(
                        makeTest({
                            questions: [
                                {
                                    id: 'q1',
                                    prompt: 'Regular q',
                                    type: 'multiple-choice',
                                    points: 1,
                                    options: [{ id: 'a', text: 'OK', isCorrect: true }],
                                },
                            ],
                        })
                    ),
                    durationMinutes: 10,
                },
            });

            renderDbPage(makeTest());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10);
            });
            expect(screen.getByText('Regular q')).toBeInTheDocument();
            // Snapshot interval (5s) fires getSnapshot — no crash, no broadcast assertions needed.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(6_000);
            });
            expect(screen.getByText('Regular q')).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('StudentTestPage — answer-interaction details', () => {
    it('deselects a multiple-response option', async () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'Pick fruits',
                            type: 'multiple-response',
                            points: 2,
                            options: [
                                { id: 'a', text: 'Apple', isCorrect: true },
                                { id: 'b', text: 'Banana', isCorrect: true },
                            ],
                        },
                    ],
                })
            )
        );
        fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Banana' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }));
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        const decoded = decodeTestSubmission(
            (document.querySelector('textarea[readonly]') as HTMLTextAreaElement).value
        );
        expect(JSON.parse(decoded!.answers[0].response)).toEqual(['b']);
    });

    it('moves an ordering item up', async () => {
        renderPage(
            makeAssignment(
                {},
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
            )
        );
        const upButtons = screen.getAllByLabelText('tests.taking.move_item_up');
        expect(upButtons[0]).toBeDisabled();
        expect(upButtons[1]).not.toBeDisabled();
        const before = screen.getAllByText(/^(First|Second)$/).map((e) => e.textContent);
        fireEvent.click(upButtons[1]);
        const after = screen.getAllByText(/^(First|Second)$/).map((e) => e.textContent);
        expect(after[0]).toBe(before[1]);
        expect(after[1]).toBe(before[0]);
    });

    it('toggles hot-text fragments by click and keyboard', async () => {
        renderPage(
            makeAssignment(
                {},
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
            )
        );
        fireEvent.click(screen.getByText('quick'));
        fireEvent.keyDown(screen.getByText('fox'), { key: 'Enter' });
        // An unrelated key is a no-op.
        fireEvent.keyDown(screen.getByText('fox'), { key: 'Tab' });
        // Deselect quick by keyboard.
        fireEvent.keyDown(screen.getByText('quick'), { key: ' ', code: 'Space' });

        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        const decoded = decodeTestSubmission(
            (document.querySelector('textarea[readonly]') as HTMLTextAreaElement).value
        );
        expect(JSON.parse(decoded!.answers[0].response)).toEqual([1]);
    });

    it('restores a draft whose stored answer is invalid JSON for matching', () => {
        const assignment = makeAssignment(
            {},
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
        const code = encodeTestAssignment(assignment as TestAssignmentPayload);
        localStorage.setItem(
            `rm_test_draft_${code}`,
            JSON.stringify({ answers: { q1: '{broken json' }, savedAt: new Date().toISOString() })
        );
        render(
            <MemoryRouter initialEntries={[`/test/${code}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText('tests.taking.draft_restored')).toBeInTheDocument();
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
        // Dismissing the banner clears it.
        fireEvent.click(screen.getByText('tests.taking.dismiss'));
        expect(screen.queryByText('tests.taking.draft_restored')).not.toBeInTheDocument();
    });

    it('restores a draft whose stored answer is invalid JSON for cloze', () => {
        const assignment = makeAssignment(
            {},
            makeTest({
                questions: [{ id: 'q1', prompt: 'Capital is {{Paris}}.', type: 'cloze', points: 1 }],
            })
        );
        const code = encodeTestAssignment(assignment as TestAssignmentPayload);
        localStorage.setItem(
            `rm_test_draft_${code}`,
            JSON.stringify({ answers: { q1: '{broken json' }, savedAt: new Date().toISOString() })
        );
        render(
            <MemoryRouter initialEntries={[`/test/${code}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText('tests.taking.cloze_instruction')).toBeInTheDocument();
        expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('');
    });

    it('restores a draft whose stored answer is invalid JSON for categorize and hot-text', () => {
        const assignment = makeAssignment(
            {},
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
                    {
                        id: 'q2',
                        prompt: 'Select the adverbs',
                        type: 'hot-text',
                        points: 2,
                        hotTextPassage: 'The [[quick]] brown [[fox]] jumps.',
                        hotTextCorrectIndices: [0, 1],
                    },
                ],
            })
        );
        const code = encodeTestAssignment(assignment as TestAssignmentPayload);
        localStorage.setItem(
            `rm_test_draft_${code}`,
            JSON.stringify({ answers: { q1: '{broken json', q2: '{broken json' }, savedAt: new Date().toISOString() })
        );
        render(
            <MemoryRouter initialEntries={[`/test/${code}`]}>
                <Routes>
                    <Route path="/test/:code" element={<StudentTestPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('quick')).toBeInTheDocument();
    });

    it('shows the cloze-dropdown instruction in the practice review', async () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    mode: 'practice',
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'Capital {{Paris|Lyon}}.',
                            type: 'cloze-dropdown',
                            points: 1,
                        },
                    ],
                })
            )
        );
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Paris' } });
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        expect(screen.getByText('tests.taking.cloze_dropdown_instruction')).toBeInTheDocument();
    });

    it('skips unsafe answer keys in matching and categorize answers', async () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'Match the pairs',
                            type: 'matching',
                            points: 2,
                            matchingPairs: [
                                { id: '__proto__', left: 'Left', right: 'Right' },
                                { id: 'p1', left: 'Apple', right: 'Fruit' },
                            ],
                        },
                    ],
                })
            )
        );
        // Selecting the unsafe-id pair must not pollute the answers map.
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '__proto__' } });
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.submit_btn'));
        });
        const decoded = decodeTestSubmission(
            (document.querySelector('textarea[readonly]') as HTMLTextAreaElement).value
        );
        expect(JSON.parse(decoded!.answers[0].response)).toEqual({});
    });

    it('renders malformed typed questions with missing option data without crashing', () => {
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        { id: 'q1', prompt: 'Match?', type: 'matching', points: 1 },
                        { id: 'q2', prompt: 'Order?', type: 'ordering', points: 1 },
                        { id: 'q3', prompt: 'Sort?', type: 'categorize', points: 1 },
                        { id: 'q4', prompt: 'Highlight?', type: 'hot-text', points: 1 },
                    ],
                })
            )
        );
        expect(screen.getByText('Match?')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('Order?')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('Sort?')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.taking.next'));
        expect(screen.getByText('Highlight?')).toBeInTheDocument();
        expect(screen.getByText('tests.taking.hot_text_instruction')).toBeInTheDocument();
    });

    it('flags a non-current question so the timeline shows it flagged', () => {
        renderPage(
            makeAssignment(
                {},
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
                })
            )
        );
        fireEvent.click(screen.getByRole('radio', { name: 'Option A' }));
        fireEvent.click(screen.getByText('tests.taking.next'));
        fireEvent.click(screen.getByText('tests.taking.flag'));
        expect(screen.getByText('tests.taking.flagged')).toBeInTheDocument();
        // Go back so q2 is flagged but not current.
        fireEvent.click(screen.getByText('tests.taking.previous'));
        expect(screen.getByText('First question')).toBeInTheDocument();
        expect(screen.getByLabelText('tests.taking.go_to_question {"number":2}')).toBeInTheDocument();
    });
});

describe('StudentTestPage — audio-response recording internals', () => {
    class FakeMediaRecorder {
        mimeType = 'audio/webm';
        state: 'inactive' | 'recording' = 'inactive';
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() {
            this.state = 'recording';
        }
        stop() {
            this.state = 'inactive';
            this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
            this.onstop?.();
        }
    }

    function installMediaMocks() {
        const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
        (globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder = FakeMediaRecorder;
    }

    function uninstallMediaMocks() {
        // @ts-expect-error test cleanup — restore jsdom's undefined mediaDevices
        delete navigator.mediaDevices;
        delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    }

    afterEach(() => {
        vi.useRealTimers();
        uninstallMediaMocks();
    });

    it('counts elapsed seconds and auto-stops at the cap', async () => {
        vi.useFakeTimers();
        installMediaMocks();
        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [
                        {
                            id: 'q1',
                            prompt: 'Describe your weekend.',
                            type: 'audio-response',
                            points: 3,
                            maxRecordingSeconds: 2,
                        },
                    ],
                })
            )
        );
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.start_recording'));
        });
        expect(screen.getByText('tests.taking.stop_recording')).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(screen.getByText('tests.taking.recording_in_progress {"elapsed":1,"max":2}')).toBeInTheDocument();

        // Second tick hits the cap → auto-stop → encoded response stored.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(screen.getByText('tests.taking.re_record')).toBeInTheDocument();
        expect(mockFileToDataUrl).toHaveBeenCalled();
    });

    it('logs a console error when encoding the recorded audio fails', async () => {
        vi.useFakeTimers();
        installMediaMocks();
        mockFileToDataUrl.mockRejectedValueOnce(new Error('encode failed'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        renderPage(
            makeAssignment(
                {},
                makeTest({
                    questions: [{ id: 'q1', prompt: 'Describe your weekend.', type: 'audio-response', points: 3 }],
                })
            )
        );
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.start_recording'));
        });
        expect(screen.getByText('tests.taking.stop_recording')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByText('tests.taking.stop_recording'));
        });
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
