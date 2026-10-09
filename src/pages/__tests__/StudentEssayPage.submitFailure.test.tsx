import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    default: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
        <textarea data-testid="essay-editor" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock('../../components/Essay/EssayTTSControls', () => ({ default: () => null }));
vi.mock('../../utils/nanoid', () => ({ nanoid: () => 'test-submission-id' }));
vi.mock('../../hooks/useLiveSessionTelemetry', () => ({
    useLiveSessionTelemetry: () => ({
        events: [],
        flush: () => [],
        isBroadcasting: false,
        broadcast: vi.fn().mockResolvedValue('ok'),
    }),
}));
vi.mock('../../services/logging/clientLogger', () => ({ initClientLogger: vi.fn(), logEvent: vi.fn() }));

const mockSubmitEssay = vi.fn();
let mockTimeLimit: number | null = null;
vi.mock('../../services/database/EssayAdapter', () => ({
    EssayAdapter: class {
        getClient() {
            return {};
        }
        getSession() {
            return Promise.resolve({ userId: 'u1', email: 'alice@example.com' });
        }
        fetchAssignmentContent() {
            return Promise.resolve({
                ok: true,
                data: {
                    rubricId: 'r1',
                    studentId: 's1',
                    title: 'Test Essay',
                    prompt: null,
                    minWords: null,
                    maxWords: null,
                    timeLimitMinutes: mockTimeLimit,
                    requireSEB: false,
                    expiresAt: null,
                    readOnlyAfterSubmit: false,
                },
            });
        }
        submitEssay(...args: unknown[]) {
            return mockSubmitEssay(...args);
        }
        clearStoredEmail() {}
    },
}));

import StudentEssayPage from '../StudentEssayPage';

// Supabase-backed links are short codes (the bare teacherKey) resolved against the stored project config.
const code = 'teacherkey1234';
const draftKey = `rm_essay_draft_${code}`;

async function renderAndWrite() {
    render(
        <MemoryRouter initialEntries={[`/essay/${code}`]}>
            <Routes>
                <Route path="/essay/:code" element={<StudentEssayPage />} />
            </Routes>
        </MemoryRouter>
    );
    const editor = await screen.findByTestId('essay-editor');
    fireEvent.change(editor, { target: { value: 'my precious essay' } });
}

describe('StudentEssayPage — failed DB submission (#608)', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(
            'rm_supabase_config',
            JSON.stringify({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' })
        );
        mockSubmitEssay.mockReset();
    });

    it('keeps the draft, shows a translated alert with Retry and never shows Submitted', async () => {
        mockSubmitEssay.mockResolvedValue({ success: false, error: 'Network error: TypeError' });
        await renderAndWrite();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('essay.submit_failed');
        expect(alert).not.toHaveTextContent('Network error');
        expect(screen.queryByText('essay.submitted_title_db')).not.toBeInTheDocument();
        expect(localStorage.getItem(draftKey)).toBe('my precious essay');
        expect(screen.getByRole('button', { name: /essay\.submit_btn/i })).toBeInTheDocument();
    });

    it('retries on Retry and on reconnect, and treats a 409 "already submitted" as success', async () => {
        mockSubmitEssay.mockResolvedValueOnce({ success: false, error: 'Network error' });
        mockSubmitEssay.mockResolvedValueOnce({ success: false, error: 'Network error' });
        mockSubmitEssay.mockResolvedValueOnce({
            success: false,
            error: 'You have already submitted this assignment',
        });
        await renderAndWrite();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'essay.retry_submit' }));
        });
        expect(mockSubmitEssay).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await act(async () => {
            window.dispatchEvent(new Event('online'));
        });
        await waitFor(() => expect(screen.getByText('essay.submitted_title_db')).toBeInTheDocument());
        expect(mockSubmitEssay).toHaveBeenCalledTimes(3);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(localStorage.getItem(draftKey)).toBeNull();
    });

    it('reports an existing hand-in instead of claiming success when the first attempt gets a 409', async () => {
        mockSubmitEssay.mockResolvedValue({ success: false, error: 'You have already submitted this assignment' });
        await renderAndWrite();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        expect(await screen.findByRole('alert')).toHaveTextContent('essay.already_submitted');
        expect(screen.queryByText('essay.submitted_title_db')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'essay.retry_submit' })).not.toBeInTheDocument();
        expect(localStorage.getItem(draftKey)).toBe('my precious essay');
    });

    it('does not confirm a 409 retry when the draft was edited after the failed attempt', async () => {
        mockSubmitEssay.mockResolvedValueOnce({ success: false, error: 'Network error' });
        mockSubmitEssay.mockResolvedValueOnce({
            success: false,
            error: 'You have already submitted this assignment',
        });
        await renderAndWrite();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        fireEvent.change(screen.getByTestId('essay-editor'), { target: { value: 'my edited essay' } });
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'essay.retry_submit' }));
        });
        expect(screen.getByRole('alert')).toHaveTextContent('essay.already_submitted');
        expect(screen.queryByText('essay.submitted_title_db')).not.toBeInTheDocument();
        expect(localStorage.getItem(draftKey)).toBe('my edited essay');
    });

    it('says the draft was not kept when saving it locally fails', async () => {
        mockSubmitEssay.mockResolvedValue({ success: false, error: 'Network error' });
        await renderAndWrite();
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });
        try {
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
            });
            expect(await screen.findByRole('alert')).toHaveTextContent('essay.submit_failed_unsaved');
        } finally {
            setItem.mockRestore();
        }
    });
});

describe('StudentEssayPage — timed short-code essays (#717)', () => {
    const deadlineKey = `rm_essay_timer_${code}:s1_endsAt`;
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem(
            'rm_supabase_config',
            JSON.stringify({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' })
        );
        mockSubmitEssay.mockReset();
        mockTimeLimit = 30;
    });
    afterEach(() => {
        mockTimeLimit = null;
    });

    it('keeps the deadline per student, since a short code is shared by the class', async () => {
        await renderAndWrite();
        await waitFor(() => expect(localStorage.getItem(deadlineKey)).not.toBeNull());
        expect(localStorage.getItem(`rm_essay_timer_${code}_endsAt`)).toBeNull();
    });

    it('does not let the deadline start a second hand-in while one is pending, but fires if it fails', async () => {
        localStorage.setItem(deadlineKey, String(Date.now() + 300));
        let settle: (result: { success: boolean; error?: string }) => void = () => {};
        mockSubmitEssay.mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)));
        mockSubmitEssay.mockResolvedValue({ success: false, error: 'Network error' });
        await renderAndWrite();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 1300));
        });
        expect(mockSubmitEssay).toHaveBeenCalledTimes(1);
        await act(async () => {
            settle({ success: false, error: 'Network error' });
        });
        await waitFor(() => expect(mockSubmitEssay).toHaveBeenCalledTimes(2), { timeout: 3000 });
    });
});
