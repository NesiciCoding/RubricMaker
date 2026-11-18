import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EssayDraftProjectorPage from '../EssayDraftProjectorPage';

const channelHandlers: Record<string, (msg: { payload: unknown }) => void> = {};
const mockSend = vi.fn();
const mockChannel = {
    on: vi.fn((_type: string, opts: { event: string }, cb: (msg: { payload: unknown }) => void) => {
        channelHandlers[opts.event] = cb;
        return mockChannel;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
        cb?.('SUBSCRIBED');
        return mockChannel;
    }),
    send: mockSend,
};

vi.mock('../../context/AppContext', () => ({
    useStudents: () => ({ students: [{ id: 'student-1', name: 'Ada Lovelace' }] }),
}));

let mockConfig: { supabaseUrl: string; supabaseAnonKey: string } | null = {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
};

vi.mock('../../services/database', () => ({ loadSupabaseConfig: () => mockConfig }));

vi.mock('../../utils/monitorClient', () => ({
    getMonitorClient: () => ({ channel: () => mockChannel, removeChannel: vi.fn() }),
    releaseStaleChannels: () => null,
}));

const listSnapshots = vi.fn();

vi.mock('../../services/database/LiveDraftAdapter', () => ({
    LiveDraftAdapter: { forTeacher: () => ({ listSnapshots }) },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) =>
            options?.count !== undefined ? `${key}:${options.count}` : key,
    }),
}));

function renderProjector() {
    return render(
        <MemoryRouter initialEntries={['/essays/essay-1/monitor/project/student-1']}>
            <Routes>
                <Route path="/essays/:assignmentId/monitor/project/:studentId" element={<EssayDraftProjectorPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('EssayDraftProjectorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        channelHandlers.snapshot = undefined as never;
        listSnapshots.mockResolvedValue(new Map());
        mockConfig = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' };
    });

    it('explains that the projector needs a database connection when none is configured', () => {
        mockConfig = null;
        renderProjector();
        expect(screen.getByText('tests.monitor.projector.db_required')).toBeTruthy();
    });

    it('shows the stored draft and marks the sentence the newest snapshot added', async () => {
        const at = Date.now();
        listSnapshots.mockResolvedValue(
            new Map([
                [
                    'student-1',
                    [
                        { studentId: 'student-1', at: at - 60_000, wordCount: 9, text: 'The first sentence.' },
                        {
                            studentId: 'student-1',
                            at,
                            wordCount: 15,
                            text: 'The first sentence. A brand new second sentence.',
                        },
                    ],
                ],
            ])
        );

        renderProjector();

        await waitFor(() => {
            expect(screen.getByTestId('essay-projector-text').textContent).toContain('A brand new second sentence.');
        });
        expect(screen.getByTestId('essay-projector-text').querySelector('mark')?.textContent).toBe(
            'A brand new second sentence.'
        );
        // It shows the words and the writer, and nothing about the rest of the class.
        expect(screen.getByText('Ada Lovelace')).toBeTruthy();
        expect(screen.getByText('tests.monitor.projector.words:15')).toBeTruthy();
        expect(listSnapshots).toHaveBeenCalledWith(['essay-1'], [expect.any(String)]);
    });

    it('replaces the draft on a live snapshot and asks the student for the fast cadence', async () => {
        renderProjector();

        await waitFor(() => expect(mockSend).toHaveBeenCalled());
        expect(mockSend).toHaveBeenCalledWith({
            type: 'broadcast',
            event: 'spotlight',
            payload: { on: true },
        });

        channelHandlers.snapshot({ payload: { text: '<p>Live words only.</p>', wordCount: 3 } });

        await waitFor(() => {
            expect(screen.getByTestId('essay-projector-text').textContent).toBe('Live words only.');
        });
    });
});
