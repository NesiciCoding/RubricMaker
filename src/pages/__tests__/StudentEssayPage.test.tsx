import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { encodeEssayAssignment } from '../../utils/essayShareCode';
import type { EssayAssignment } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
    initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Replace TipTap-heavy editor with a plain textarea
vi.mock('../../components/Editor/EssayEditor', () => ({
    default: ({
        content,
        onChange,
    }: {
        content: string;
        onChange: (html: string) => void;
        editable?: boolean;
        placeholder?: string;
    }) => <textarea data-testid="essay-editor" value={content} onChange={(e) => onChange(e.target.value)} />,
}));

// Stub TTS controls added in the main-branch merge
vi.mock('../../components/Essay/EssayTTSControls', () => ({
    default: () => null,
}));

// Capture what gets encoded so we can assert on wordLimitStatus without DB calls
vi.mock('../../utils/essaySubmissionCode', () => ({
    encodeEssaySubmission: vi.fn().mockReturnValue('MOCK_SUBMISSION_CODE'),
}));

vi.mock('../../utils/nanoid', () => ({ nanoid: () => 'test-submission-id' }));

import { encodeEssaySubmission } from '../../utils/essaySubmissionCode';
import StudentEssayPage from '../StudentEssayPage';

const mockEncode = vi.mocked(encodeEssaySubmission);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Assignments without supabaseUrl/supabaseAnonKey use the offline (legacy-code) path,
// keeping tests free of network activity.
const makeAssignment = (overrides: Partial<EssayAssignment> = {}): EssayAssignment => ({
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'Test Essay',
    readOnlyAfterSubmit: false,
    requireSEB: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

function renderPage(assignment: EssayAssignment) {
    const code = encodeEssayAssignment(assignment);
    render(
        <MemoryRouter initialEntries={[`/essay/${code}`]}>
            <Routes>
                <Route path="/essay/:code" element={<StudentEssayPage />} />
            </Routes>
        </MemoryRouter>
    );
}

function setContent(words: number) {
    // Plain text works fine — countWords strips HTML so no tags needed
    const text = Array.from({ length: words }, (_, i) => `word${i + 1}`).join(' ');
    fireEvent.change(screen.getByTestId('essay-editor'), { target: { value: text } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StudentEssayPage — submit button state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    it('shows submit button and is enabled when no word limits are configured', () => {
        renderPage(makeAssignment());
        setContent(500);
        // t('essay.submit_btn') returns the key verbatim with the mock
        const btn = screen.getByRole('button', { name: /essay\.submit_btn/i });
        expect(btn).not.toBeDisabled();
    });

    it('shows submit button and is enabled when word count is within the configured range', () => {
        renderPage(makeAssignment({ minWords: 5, maxWords: 100 }));
        setContent(50);
        expect(screen.getByRole('button', { name: /essay\.submit_btn/i })).not.toBeDisabled();
    });

    it('shows word-limit warning and is disabled when word count exceeds maxWords', () => {
        renderPage(makeAssignment({ maxWords: 5 }));
        setContent(6);
        // t('essay.too_many_words') returns the key verbatim with the mock
        const btn = screen.getByRole('button', { name: /essay\.too_many_words/i });
        expect(btn).toBeInTheDocument();
        expect(btn).toBeDisabled();
    });

    it('shows over-limit message next to the button when over maxWords', () => {
        renderPage(makeAssignment({ maxWords: 5 }));
        setContent(6);
        // t('essay.over_limit', { count: 1 }) returns the key verbatim with the mock
        expect(screen.getByText(/essay\.over_limit/i)).toBeInTheDocument();
    });

    it('re-enables the submit button once word count drops back to or below maxWords', () => {
        renderPage(makeAssignment({ maxWords: 5 }));
        setContent(6); // over
        expect(screen.getByRole('button', { name: /essay\.too_many_words/i })).toBeDisabled();
        setContent(5); // exactly at limit
        expect(screen.getByRole('button', { name: /essay\.submit_btn/i })).not.toBeDisabled();
    });

    it('shows submit button and is enabled when under minWords (under-limit is flagged, not blocked)', () => {
        renderPage(makeAssignment({ minWords: 50, maxWords: 200 }));
        setContent(10); // under minWords — submission is still allowed
        expect(screen.getByRole('button', { name: /essay\.submit_btn/i })).not.toBeDisabled();
    });
});

describe('StudentEssayPage — wordLimitStatus in submission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    it('encodes wordLimitStatus "ok" when within range', async () => {
        renderPage(makeAssignment({ minWords: 2, maxWords: 10 }));
        setContent(5);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ wordLimitStatus: 'ok' }));
    });

    it('encodes wordLimitStatus "under" when below minWords', async () => {
        renderPage(makeAssignment({ minWords: 10, maxWords: 100 }));
        setContent(3); // under minWords — submit is still allowed
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ wordLimitStatus: 'under' }));
    });

    it('encodes wordLimitStatus undefined when no limits are configured', async () => {
        renderPage(makeAssignment()); // no minWords / maxWords
        setContent(20);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /essay\.submit_btn/i }));
        });
        expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ wordLimitStatus: undefined }));
    });
});

describe('StudentEssayPage — timer auto-submit', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        sessionStorage.clear();
        localStorage.clear();
    });

    it('auto-submits when time expires and word count is within the limit', async () => {
        vi.useFakeTimers();
        renderPage(makeAssignment({ maxWords: 10, timeLimitMinutes: 1 }));
        setContent(5); // within limit

        await act(async () => {
            vi.advanceTimersByTime(61_000);
        });

        expect(mockEncode).toHaveBeenCalled();
        expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ wordLimitStatus: 'ok' }));
    });

    it('auto-submits even when word count exceeds maxWords — word limit does not block the timer', async () => {
        vi.useFakeTimers();
        renderPage(makeAssignment({ maxWords: 3, timeLimitMinutes: 1 }));
        setContent(6); // over limit

        await act(async () => {
            vi.advanceTimersByTime(61_000);
        });

        // Submission must fire; word limit affects the button only, not the countdown
        expect(mockEncode).toHaveBeenCalled();
        expect(mockEncode).toHaveBeenCalledWith(expect.objectContaining({ wordLimitStatus: 'over' }));
    });
});
