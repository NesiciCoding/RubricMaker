import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import type { Student, Test } from '../../types';
import LiveMonitorPage from '../LiveMonitorPage';

interface MockChannel {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    handlers: Record<string, (msg: { payload: unknown }) => void>;
}

const mockSend = vi.fn();
const channels: MockChannel[] = [];
const mockClient = {
    channel: vi.fn(() => {
        const channel: MockChannel = {
            on: vi.fn(),
            subscribe: vi.fn().mockReturnThis(),
            send: mockSend,
            handlers: {},
        };
        channel.on.mockImplementation(
            (type: string, opts: { event: string }, cb: (msg: { payload: unknown }) => void) => {
                channel.handlers[opts.event] = cb;
                return channel;
            }
        );
        channels.push(channel);
        return channel;
    }),
    removeChannel: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
}));

const mockShowToast = vi.fn();
const mockSetPlacementOverride = vi.fn();

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

let mockHasDb = false;
let mockSupabaseConfig: { supabaseUrl: string; supabaseAnonKey: string } | null = null;

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockHasDb }),
}));

vi.mock('../../services/database', () => ({
    loadSupabaseConfig: () => mockSupabaseConfig,
}));

let mockUseApp: any;

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockUseApp,
    useStudents: () => mockUseApp,
    useClasses: () => mockUseApp,
    useGrading: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts && 'index' in opts) return `${key} ${opts.index}`;
            if (opts && 'count' in opts) return `${key} (${opts.count})`;
            if (opts && 'name' in opts) return `${key}: ${opts.name}`;
            if (opts && 'title' in opts) return `${key}: ${opts.title}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

const mockTest: Test = {
    id: 'test-1',
    name: 'Vocabulary Quiz',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
};

const mockStudent: Student = { id: 'student-1', name: 'Alice', classId: 'class-1' };

function renderPage(initialEntries: string[]) {
    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <Routes>
                <Route path="/tests/:testId/monitor" element={<LiveMonitorPage kind="test" />} />
                <Route path="/essays/:assignmentId/monitor" element={<LiveMonitorPage kind="essay" />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('LiveMonitorPage', () => {
    beforeEach(() => {
        mockHasDb = false;
        mockSupabaseConfig = null;
        mockUseApp = {
            settings: { theme: 'dark', overdueReminderThreshold: 7 },
            updateSettings: vi.fn(),
            students: [mockStudent],
            studentRubrics: [],
            tests: [mockTest],
            studentTests: [
                {
                    id: 'st-1',
                    testId: 'test-1',
                    studentId: 'student-1',
                    answers: [],
                    status: 'in_progress',
                    startedAt: '2026-01-01T00:00:00.000Z',
                    events: [],
                },
            ],
            classes: [],
            fetchEssayAssignmentByKey: vi.fn().mockResolvedValue(null),
            fetchTestAssignmentTeacherKeys: vi.fn().mockResolvedValue({}),
            setPlacementOverride: mockSetPlacementOverride,
        };
        channels.length = 0;
        mockSend.mockClear();
        mockShowToast.mockClear();
        mockSetPlacementOverride.mockClear();
        mockSetPlacementOverride.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('renders an explainer without attempting a subscription when no database is configured', () => {
        renderPage(['/tests/test-1/monitor']);

        expect(screen.getByText('tests.monitor.no_database_title')).toBeInTheDocument();
        expect(screen.getByText('tests.monitor.noDatabase')).toBeInTheDocument();
        expect(mockClient.channel).not.toHaveBeenCalled();
    });

    it('shows the not-found state for an unknown test', () => {
        mockHasDb = true;
        mockSupabaseConfig = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' };

        renderPage(['/tests/unknown-test/monitor']);

        expect(screen.getByText('tests.monitor.not_found')).toBeInTheDocument();
    });

    describe('with database configured', () => {
        beforeEach(() => {
            mockHasDb = true;
            mockSupabaseConfig = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' };
        });

        it('opens the realtime client on an isolated storage key with persistence/refresh disabled', () => {
            renderPage(['/tests/test-1/monitor']);

            expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', {
                auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rm_monitor_ephemeral' },
            });
        });

        it('toggles hide-names so the student row shows an anonymised label', () => {
            renderPage(['/tests/test-1/monitor']);

            expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);

            fireEvent.click(screen.getByText('tests.monitor.hideNames'));

            expect(screen.queryByText('Alice')).not.toBeInTheDocument();
            expect(screen.getAllByText('tests.monitor.anonymous_student 1').length).toBeGreaterThan(0);

            fireEvent.click(screen.getByText('tests.monitor.show_names'));

            expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        });

        it('reflects presence based on heartbeat age using fake timers', () => {
            vi.useFakeTimers();

            mockUseApp = {
                ...mockUseApp,
                studentTests: [
                    {
                        id: 'st-1',
                        testId: 'test-1',
                        studentId: 'student-1',
                        answers: [],
                        status: 'in_progress',
                        startedAt: '2026-06-13T10:00:00.000Z',
                        events: [{ type: 'heartbeat', at: '2026-06-13T10:00:00.000Z', value: 'active' }],
                    },
                ],
            };

            const fixedNow = new Date('2026-06-13T10:00:00.000Z');
            vi.setSystemTime(fixedNow);

            renderPage(['/tests/test-1/monitor']);

            expect(screen.getByText('tests.monitor.presence.active')).toBeInTheDocument();

            // Advance past the idle threshold (90s) and let the periodic re-render tick.
            act(() => {
                vi.setSystemTime(new Date(fixedNow.getTime() + 95_000));
                vi.advanceTimersByTime(5_000);
            });

            expect(screen.getByText('tests.monitor.presence.disconnected')).toBeInTheDocument();

            vi.useRealTimers();
        });

        it('flags a submission made after the due date as late', () => {
            mockUseApp = {
                ...mockUseApp,
                tests: [{ ...mockTest, dueDate: '2026-06-01T00:00:00.000Z' }],
                studentTests: [
                    {
                        id: 'st-1',
                        testId: 'test-1',
                        studentId: 'student-1',
                        answers: [],
                        status: 'submitted',
                        startedAt: '2026-06-01T00:00:00.000Z',
                        submittedAt: '2026-06-02T00:00:00.000Z',
                        events: [],
                    },
                ],
            };

            renderPage(['/tests/test-1/monitor']);

            expect(screen.getByTitle('tests.monitor.status.late')).toBeInTheDocument();
        });

        it('does not flag an on-time submission as late', () => {
            mockUseApp = {
                ...mockUseApp,
                tests: [{ ...mockTest, dueDate: '2026-06-01T00:00:00.000Z' }],
                studentTests: [
                    {
                        id: 'st-1',
                        testId: 'test-1',
                        studentId: 'student-1',
                        answers: [],
                        status: 'submitted',
                        startedAt: '2026-05-31T00:00:00.000Z',
                        submittedAt: '2026-05-31T12:00:00.000Z',
                        events: [],
                    },
                ],
            };

            renderPage(['/tests/test-1/monitor']);

            expect(screen.queryByTitle('tests.monitor.status.late')).not.toBeInTheDocument();
            expect(screen.getByTitle('tests.monitor.status.submitted')).toBeInTheDocument();
        });

        it('uses the resolved teacher key as the channel name', async () => {
            mockUseApp = {
                ...mockUseApp,
                fetchTestAssignmentTeacherKeys: vi.fn().mockResolvedValue({ 'student-1': 'tk-1' }),
            };
            renderPage(['/tests/test-1/monitor']);
            await act(async () => {});
            expect(mockClient.channel).toHaveBeenCalledWith('monitor:test:tk-1');
        });

        it('falls back to a no-teacher-key channel when key loading fails', async () => {
            mockUseApp = {
                ...mockUseApp,
                fetchTestAssignmentTeacherKeys: vi.fn().mockRejectedValue(new Error('boom')),
            };
            renderPage(['/tests/test-1/monitor']);
            await act(async () => {});
            expect(mockClient.channel).toHaveBeenCalledWith('monitor:test:no-teacher-key:student-1');
        });

        it('drops teacher-key students who are not in the roster', async () => {
            mockUseApp = {
                ...mockUseApp,
                studentTests: [],
                fetchTestAssignmentTeacherKeys: vi.fn().mockResolvedValue({ ghost: 'kg' }),
            };
            renderPage(['/tests/test-1/monitor']);
            await act(async () => {});
            // The ghost row is built (name/key fallbacks evaluated) but filtered out.
            expect(screen.getByText('tests.monitor.no_students')).toBeInTheDocument();
        });

        it('shows the no-students state when no one is assigned', () => {
            mockUseApp = { ...mockUseApp, studentTests: [] };
            renderPage(['/tests/test-1/monitor']);
            expect(screen.getByText('tests.monitor.no_students')).toBeInTheDocument();
        });

        it('ignores teacher keys that resolve after unmount', async () => {
            let resolve: (v: unknown) => void = () => {};
            mockUseApp = {
                ...mockUseApp,
                fetchTestAssignmentTeacherKeys: vi.fn(() => new Promise((r) => (resolve = r))),
            };
            const { unmount } = renderPage(['/tests/test-1/monitor']);
            unmount();
            await act(async () => resolve({ 'student-1': 'late-key' }));
            expect(mockClient.channel).not.toHaveBeenCalledWith('monitor:test:late-key');
        });

        it('ignores teacher-key failures after unmount', async () => {
            let reject: (e: Error) => void = () => {};
            mockUseApp = {
                ...mockUseApp,
                fetchTestAssignmentTeacherKeys: vi.fn(() => new Promise((_, rj) => (reject = rj))),
            };
            const { unmount } = renderPage(['/tests/test-1/monitor']);
            unmount();
            await act(async () => reject(new Error('late-boom')));
            expect(mockClient.channel).toHaveBeenCalledWith('monitor:test:no-teacher-key:student-1');
        });

        it('renders proctoring flags from live broadcast events', () => {
            renderPage(['/tests/test-1/monitor']);
            const ch = channels[0];
            act(() => {
                ch.handlers.event({ payload: { type: 'tab_switch', at: '2026-01-01T00:00:01Z' } });
                ch.handlers.event({ payload: { type: 'tab_switch', at: '2026-01-01T00:00:02Z' } });
                ch.handlers.event({ payload: { type: 'copy', at: '2026-01-01T00:00:03Z' } });
                ch.handlers.event({ payload: { type: 'paste', at: '2026-01-01T00:00:04Z' } });
                ch.handlers.event({ payload: { type: 'battery', at: '2026-01-01T00:00:05Z', value: '60+' } });
                ch.handlers.event({ payload: { type: 'seb_status', at: '2026-01-01T00:00:06Z', value: true } });
            });
            // Below the 3-switch warning threshold → yellow badge.
            expect(screen.getByText('tests.monitor.flags.tabSwitch (2)')).toBeInTheDocument();
            expect(screen.getByText('tests.monitor.flags.clipboard (2)')).toBeInTheDocument();
            expect(screen.getByText('tests.monitor.flags.battery')).toBeInTheDocument();
            expect(screen.getByText('tests.monitor.flags.seb')).toBeInTheDocument();
        });

        it('renders the non-charging battery flag variant', () => {
            renderPage(['/tests/test-1/monitor']);
            const ch = channels[0];
            act(() => {
                ch.handlers.event({ payload: { type: 'battery', at: '2026-01-01T00:00:05Z', value: '40' } });
            });
            expect(screen.getByText('tests.monitor.flags.battery')).toBeInTheDocument();
        });

        it('warns in red once tab switches reach the threshold', () => {
            renderPage(['/tests/test-1/monitor']);
            const ch = channels[0];
            act(() => {
                ch.handlers.event({ payload: { type: 'tab_switch', at: '2026-01-01T00:00:01Z' } });
                ch.handlers.event({ payload: { type: 'tab_switch', at: '2026-01-01T00:00:02Z' } });
                ch.handlers.event({ payload: { type: 'tab_switch', at: '2026-01-01T00:00:03Z' } });
            });
            expect(screen.getByText('tests.monitor.flags.tabSwitch (3)')).toBeInTheDocument();
        });

        it('merges live snapshot answers with persisted answers', () => {
            mockUseApp = {
                ...mockUseApp,
                tests: [
                    {
                        ...mockTest,
                        questions: [
                            {
                                id: 'q1',
                                type: 'multiple-choice',
                                points: 1,
                                prompt: 'Q1',
                                options: [
                                    { id: 'a', text: 'Wrong', isCorrect: false },
                                    { id: 'b', text: 'Right', isCorrect: true },
                                ],
                            },
                            {
                                id: 'q2',
                                type: 'multiple-choice',
                                points: 1,
                                prompt: 'Q2',
                                options: [
                                    { id: 'a', text: 'Wrong', isCorrect: false },
                                    { id: 'b', text: 'Right', isCorrect: true },
                                ],
                            },
                        ],
                    },
                ],
                studentTests: [
                    {
                        id: 'st-1',
                        testId: 'test-1',
                        studentId: 'student-1',
                        answers: [
                            { questionId: 'q1', response: 'a' },
                            { questionId: 'q2', response: 'a' },
                        ],
                        status: 'in_progress',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        events: [],
                    },
                ],
            };
            renderPage(['/tests/test-1/monitor']);
            const ch = channels[0];
            act(() => {
                ch.handlers.snapshot({ payload: { answers: { q1: 'b' } } });
            });
            // The live answer (correct) replaces the persisted one for q1; q2 stays persisted (incorrect).
            expect(screen.getAllByTitle('tests.monitor.grid.state.correct')).toHaveLength(1);
            expect(screen.getAllByTitle('tests.monitor.grid.state.incorrect')).toHaveLength(1);
        });

        it('sends a nudge over the student channel', () => {
            renderPage(['/tests/test-1/monitor']);
            fireEvent.click(screen.getByTitle('tests.monitor.nudge_button'));
            expect(mockSend).toHaveBeenCalledWith({
                type: 'broadcast',
                event: 'nudge',
                payload: { message: 'tests.monitor.nudge_message' },
            });
        });

        it('sends a placement override nudge from the level panel', async () => {
            mockUseApp = {
                ...mockUseApp,
                tests: [{ ...mockTest, placementEngine: 'generator' }],
            };
            renderPage(['/tests/test-1/monitor']);
            fireEvent.click(screen.getByTitle('tests.monitor.nudge_up_button'));
            await act(async () => {});
            expect(mockSetPlacementOverride).toHaveBeenCalledWith('no-teacher-key:student-1', 'up');
            expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ event: 'nudge' }));
        });

        it('shows an error toast when the placement override fails', async () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            mockUseApp = {
                ...mockUseApp,
                tests: [{ ...mockTest, placementEngine: 'generator' }],
                setPlacementOverride: vi.fn().mockRejectedValue(new Error('boom')),
            };
            renderPage(['/tests/test-1/monitor']);
            fireEvent.click(screen.getByTitle('tests.monitor.nudge_down_button'));
            await act(async () => {});
            expect(mockShowToast).toHaveBeenCalledWith('tests.monitor.nudge_override_error', 'error');
            spy.mockRestore();
        });

        it('sorts rows by name, progress and ungraded status', () => {
            const alice = { id: 's-a', name: 'Alice', classId: 'class-1' };
            const bob = { id: 's-b', name: 'Bob', classId: 'class-1' };
            const carol = { id: 's-c', name: 'Carol', classId: 'class-1' };
            const dana = { id: 's-d', name: 'Dana', classId: 'class-1' };
            mockUseApp = {
                ...mockUseApp,
                students: [alice, bob, carol, dana],
                fetchTestAssignmentTeacherKeys: vi
                    .fn()
                    .mockResolvedValue({ 's-a': 'ka', 's-b': 'kb', 's-c': 'kc', 's-d': 'kd' }),
                studentTests: [
                    {
                        id: 'st-b',
                        testId: 'test-1',
                        studentId: 's-b',
                        answers: [{ questionId: 'q1', response: 'b1' }],
                        status: 'in_progress',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        events: [],
                    },
                    {
                        id: 'st-c',
                        testId: 'test-1',
                        studentId: 's-c',
                        answers: [],
                        status: 'in_progress',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        events: [],
                    },
                    {
                        id: 'st-a',
                        testId: 'test-1',
                        studentId: 's-a',
                        answers: [
                            { questionId: 'q1', response: 'a1' },
                            { questionId: 'q2', response: 'a2' },
                        ],
                        status: 'submitted',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        submittedAt: '2026-01-01T00:00:00.000Z',
                        events: [],
                    },
                    {
                        id: 'st-d',
                        testId: 'test-1',
                        studentId: 's-d',
                        answers: [],
                        status: 'submitted',
                        startedAt: '2026-01-01T00:00:00.000Z',
                        submittedAt: '2026-01-01T00:00:00.000Z',
                        events: [],
                    },
                ],
            };
            renderPage(['/tests/test-1/monitor']);
            const nameOrder = () =>
                screen
                    .getAllByText(/^(Alice|Bob|Carol|Dana)$/)
                    .slice(0, 4)
                    .map((n) => n.textContent)
                    .join(',');
            // Active (default): all disconnected, original order.
            expect(nameOrder()).toBe('Bob,Carol,Alice,Dana');
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } });
            expect(nameOrder()).toBe('Alice,Bob,Carol,Dana');
            // Progress: Alice 2 answers, Bob 1, Carol/Dana 0.
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'progress' } });
            expect(nameOrder()).toBe('Alice,Bob,Carol,Dana');
            // Ungraded: submitted students sink to the bottom.
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ungraded' } });
            const ungraded = nameOrder().split(',');
            expect(ungraded.slice(0, 2).sort()).toEqual(['Bob', 'Carol']);
            expect(ungraded.slice(2).sort()).toEqual(['Alice', 'Dana']);
        });
    });

    describe('essay monitor', () => {
        beforeEach(() => {
            mockHasDb = true;
            mockSupabaseConfig = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' };
        });

        it('shows the loading state while the assignment resolves', async () => {
            let resolve: (v: unknown) => void = () => {};
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi.fn(() => new Promise((r) => (resolve = r))),
            };
            renderPage(['/essays/assn-1/monitor']);
            expect(screen.getByText('tests.monitor.loading')).toBeInTheDocument();
            await act(async () => resolve({ rubricId: 'r1', studentId: 'student-1', title: 'My Essay' }));
            expect(screen.getByText('tests.monitor.title_essay: My Essay')).toBeInTheDocument();
        });

        it('renders the live draft panel for the resolved assignment', async () => {
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi
                    .fn()
                    .mockResolvedValue({ rubricId: 'r1', studentId: 'student-1', title: 'My Essay' }),
            };
            renderPage(['/essays/assn-1/monitor']);
            expect(await screen.findByText('tests.monitor.title_essay: My Essay')).toBeInTheDocument();
            expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
            // The channel key for an essay is assignmentId:studentId.
            await waitFor(() => expect(mockClient.channel).toHaveBeenCalledWith('monitor:essay:assn-1:student-1'));
        });

        it('renders the live draft text from a snapshot broadcast', async () => {
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi
                    .fn()
                    .mockResolvedValue({ rubricId: 'r1', studentId: 'student-1', title: 'My Essay' }),
            };
            renderPage(['/essays/assn-1/monitor']);
            await screen.findByText('tests.monitor.title_essay: My Essay');
            // The assignment resolves asynchronously, so the essay channel opens after render.
            await waitFor(() => expect(channels.length).toBeGreaterThan(0));
            const ch = channels[0];
            act(() => {
                ch.handlers.snapshot({ payload: { text: '<p>Hello draft</p>', wordCount: 2 } });
            });
            fireEvent.click(screen.getByLabelText('tests.monitor.draft.toggle_preview'));
            expect(screen.getByText('Hello draft')).toBeInTheDocument();
            expect(screen.getByText('tests.monitor.draft.word_count (2)')).toBeInTheDocument();
        });

        it('ignores the essay assignment result after unmount', async () => {
            let resolve: (v: unknown) => void = () => {};
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi.fn(() => new Promise((r) => (resolve = r))),
            };
            const { unmount } = renderPage(['/essays/assn-1/monitor']);
            unmount();
            await act(async () => resolve({ rubricId: 'r1', studentId: 'student-1', title: 'Late' }));
            expect(screen.queryByText('tests.monitor.title_essay: Late')).not.toBeInTheDocument();
        });

        it('ignores essay assignment failures after unmount', async () => {
            let reject: (e: Error) => void = () => {};
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi.fn(() => new Promise((_, rj) => (reject = rj))),
            };
            const { unmount } = renderPage(['/essays/assn-1/monitor']);
            unmount();
            await act(async () => reject(new Error('late-boom')));
            expect(screen.queryByText('tests.monitor.not_found')).not.toBeInTheDocument();
        });

        it('shows no students when the essay assignment student is missing', async () => {
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi
                    .fn()
                    .mockResolvedValue({ rubricId: 'r1', studentId: 'ghost', title: 'X' }),
            };
            renderPage(['/essays/assn-1/monitor']);
            expect(await screen.findByText('tests.monitor.no_students')).toBeInTheDocument();
        });

        it('shows not-found when the assignment is missing', async () => {
            renderPage(['/essays/assn-1/monitor']);
            expect(await screen.findByText('tests.monitor.not_found')).toBeInTheDocument();
        });

        it('shows not-found when the assignment fetch fails', async () => {
            mockUseApp = {
                ...mockUseApp,
                fetchEssayAssignmentByKey: vi.fn().mockRejectedValue(new Error('boom')),
            };
            renderPage(['/essays/assn-1/monitor']);
            expect(await screen.findByText('tests.monitor.not_found')).toBeInTheDocument();
        });

        it('shows not-found for an essay when there is no database', async () => {
            mockHasDb = false;
            renderPage(['/essays/assn-1/monitor']);
            expect(screen.getByText('tests.monitor.no_database_title')).toBeInTheDocument();
        });
    });
});
