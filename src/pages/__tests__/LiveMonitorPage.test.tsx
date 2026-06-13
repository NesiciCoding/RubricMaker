import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Student, Test } from '../../types';
import LiveMonitorPage from '../LiveMonitorPage';

const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
};
const mockClient = {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
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
    useApp: () => mockUseApp,
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
            studentTests: [],
            classes: [],
            fetchEssayAssignmentByKey: vi.fn().mockResolvedValue(null),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
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
    });
});
