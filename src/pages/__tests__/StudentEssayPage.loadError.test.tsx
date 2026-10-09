import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
    initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

vi.mock('../../components/Editor/EssayEditor', () => ({
    default: () => <textarea data-testid="essay-editor" />,
}));
vi.mock('../../components/Essay/EssayTTSControls', () => ({ default: () => null }));
vi.mock('../../hooks/useLiveSessionTelemetry', () => ({
    useLiveSessionTelemetry: () => ({
        events: [],
        flush: () => [],
        isBroadcasting: false,
        broadcast: vi.fn().mockResolvedValue('ok'),
    }),
}));
vi.mock('../../services/logging/clientLogger', () => ({ initClientLogger: vi.fn(), logEvent: vi.fn() }));

const mockFetchContent = vi.fn();
vi.mock('../../services/database/EssayAdapter', () => ({
    EssayAdapter: class {
        getClient() {
            return {};
        }
        getSession() {
            return Promise.resolve({ userId: 'u1', email: 'alice@example.com' });
        }
        fetchAssignmentContent(...args: unknown[]) {
            return mockFetchContent(...args);
        }
        submitEssay() {
            return Promise.resolve({ success: true });
        }
        clearStoredEmail() {}
    },
}));

import StudentEssayPage from '../StudentEssayPage';

const code = 'teacherkey1234';
const content = {
    rubricId: 'r1',
    studentId: 's1',
    title: 'Timed Essay',
    prompt: 'Describe your weekend',
    minWords: 100,
    maxWords: 200,
    timeLimitMinutes: 30,
    requireSEB: false,
    expiresAt: null,
    readOnlyAfterSubmit: false,
};

function renderPage() {
    render(
        <MemoryRouter initialEntries={[`/essay/${code}`]}>
            <Routes>
                <Route path="/essay/:code" element={<StudentEssayPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('StudentEssayPage — assignment content fails to load (#708)', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem(
            'rm_supabase_config',
            JSON.stringify({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' })
        );
        mockFetchContent.mockReset();
    });

    it('shows a translated error with Retry instead of an editor without the assignment', async () => {
        mockFetchContent.mockResolvedValueOnce({ ok: false, reason: 'error' });
        renderPage();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('essay.load_error_title');
        expect(screen.queryByTestId('essay-editor')).not.toBeInTheDocument();

        mockFetchContent.mockResolvedValueOnce({ ok: true, data: content });
        fireEvent.click(screen.getByRole('button', { name: 'essay.load_retry' }));
        expect(await screen.findByTestId('essay-editor')).toBeInTheDocument();
        expect(screen.getByText('Describe your weekend')).toBeInTheDocument();
        expect(mockFetchContent).toHaveBeenCalledTimes(2);
    });

    it('resolves the spinner into the error when the fetch throws', async () => {
        mockFetchContent.mockRejectedValueOnce(new Error('network down'));
        renderPage();
        expect(await screen.findByText('essay.load_error')).toBeInTheDocument();
        expect(screen.queryByTestId('essay-editor')).not.toBeInTheDocument();
    });

    it('still shows the expired screen for an expired assignment', async () => {
        mockFetchContent.mockResolvedValueOnce({ ok: false, reason: 'expired' });
        renderPage();
        await waitFor(() => expect(screen.getByText('essay.expired_title')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'essay.load_retry' })).not.toBeInTheDocument();
    });
});
