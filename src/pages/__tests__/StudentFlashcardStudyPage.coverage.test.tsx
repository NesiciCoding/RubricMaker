import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { FlashcardDeck, FlashcardReview } from '../../types';

const mocks = vi.hoisted(() => ({
    fetchAssignedFlashcardDeck: vi.fn(),
    fetchMyFlashcardReview: vi.fn(),
    saveFlashcardReview: vi.fn(),
    saveFlashcardReviewAsStudent: vi.fn(),
    computeDeckInsights: vi.fn(),
}));

const state = vi.hoisted(() => ({
    isConnected: false,
    userRole: 'student',
    deck: null as FlashcardDeck | null,
    review: null as FlashcardReview | null,
}));

vi.mock('../../context/AppContext', () => ({
    useRoster: () => ({}),
    useStudents: () => ({ students: [{ id: 's1', name: 'Alice', classId: 'c1' }] }),
    useClasses: () => ({ classes: [] }),
    useGrading: () => ({}),
    useAuthoring: () => ({}),
    useAssessment: () => ({}),
    useEssays: () => ({}),
    useFlashcards: () => ({
        flashcardDecks: state.deck ? [state.deck] : [],
        flashcardReviews: state.review ? [state.review] : [],
        saveFlashcardReview: mocks.saveFlashcardReview,
        fetchAssignedFlashcardDeck: mocks.fetchAssignedFlashcardDeck,
        fetchMyFlashcardReview: mocks.fetchMyFlashcardReview,
        saveFlashcardReviewAsStudent: mocks.saveFlashcardReviewAsStudent,
    }),
    useSettings: () => ({ settings: { userRole: state.userRole } }),
    usePlatform: () => ({}),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: state.isConnected }),
}));

vi.mock('../../utils/flashcardInsights', () => ({
    computeDeckInsights: mocks.computeDeckInsights,
}));

vi.mock('../../components/Flashcards/FlashcardInsightsPanel', () => ({
    default: () => <div data-testid="insights-panel" />,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

const deck: FlashcardDeck = {
    id: 'd1',
    name: 'Animals',
    createdAt: '2024-01-01T00:00:00Z',
    deckKind: 'vocabulary',
    cards: [
        { id: 'c1', front: 'meadow', back: 'weide' },
        { id: 'c2', front: 'swift', back: 'snel' },
    ],
};

const review: FlashcardReview = {
    id: 'd1:s1',
    deckId: 'd1',
    studentId: 's1',
    cardStates: {},
    updatedAt: '2024-01-02T00:00:00Z',
};

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/portal/s1/flashcards/d1']}>
            <Routes>
                <Route path="/portal/:studentId/flashcards/:deckId" element={<StudentFlashcardStudyPage />} />
            </Routes>
        </MemoryRouter>
    );
}

let StudentFlashcardStudyPage: React.ComponentType;

beforeEach(async () => {
    state.isConnected = false;
    state.userRole = 'student';
    state.deck = deck;
    state.review = null;
    mocks.fetchAssignedFlashcardDeck.mockResolvedValue(null);
    mocks.fetchMyFlashcardReview.mockResolvedValue(null);
    mocks.saveFlashcardReview.mockResolvedValue(undefined);
    mocks.saveFlashcardReviewAsStudent.mockResolvedValue({ success: true });
    mocks.computeDeckInsights.mockReturnValue({ totalCards: 1, newCount: 1, dueCount: 0 });
    StudentFlashcardStudyPage = (await import('../StudentFlashcardStudyPage')).default;
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('StudentFlashcardStudyPage coverage', () => {
    it('shows the loading state while the remote deck and review are fetched', async () => {
        state.isConnected = true;
        let resolveDeck: (d: FlashcardDeck | null) => void = () => undefined;
        mocks.fetchAssignedFlashcardDeck.mockReturnValueOnce(
            new Promise<FlashcardDeck | null>((res) => {
                resolveDeck = res;
            })
        );
        mocks.fetchMyFlashcardReview.mockResolvedValueOnce(null);
        renderPage();
        // loading spinner while the remote fetch is pending
        expect(document.querySelector('.spin')).not.toBeNull();
        expect(mocks.fetchAssignedFlashcardDeck).toHaveBeenCalledWith('d1');
        expect(mocks.fetchMyFlashcardReview).toHaveBeenCalledWith('d1', 's1');
        await act(async () => resolveDeck(deck));
        expect(await screen.findByText('Animals')).toBeInTheDocument();
        expect(document.querySelector('.spin')).toBeNull();
    });

    it('shows the not-found state without a local deck', async () => {
        state.deck = null;
        renderPage();
        expect(await screen.findByText('flashcards.deck_not_found')).toBeInTheDocument();
    });

    it('renders the session with insights and a teacher preview note without saving', async () => {
        state.isConnected = true;
        state.userRole = 'teacher';
        mocks.fetchAssignedFlashcardDeck.mockResolvedValueOnce(deck);
        renderPage();

        expect(await screen.findByText('flashcards.teacher_preview_no_save')).toBeInTheDocument();
        expect(screen.getByTestId('insights-panel')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();

        // rate a card — teacher preview must not persist
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        expect(mocks.saveFlashcardReview).not.toHaveBeenCalled();
        expect(mocks.saveFlashcardReviewAsStudent).not.toHaveBeenCalled();
    });

    it('persists a student review via the remote path and reports failures', async () => {
        state.isConnected = true;
        state.userRole = 'student';
        mocks.fetchAssignedFlashcardDeck.mockResolvedValueOnce(deck);
        mocks.fetchMyFlashcardReview.mockResolvedValueOnce(review);
        renderPage();
        await screen.findByText('Animals');

        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        expect(mocks.saveFlashcardReviewAsStudent).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'd1:s1', deckId: 'd1', studentId: 's1' })
        );
        expect(screen.queryByText('flashcards.save_failed')).not.toBeInTheDocument();

        // failure path
        mocks.saveFlashcardReviewAsStudent.mockResolvedValueOnce({ success: false });
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        expect(await screen.findByText('flashcards.save_failed')).toBeInTheDocument();
    });

    it('uses the local review and falls back to the local deck when the remote fetch returns nothing', async () => {
        state.isConnected = true;
        state.review = review;
        mocks.fetchAssignedFlashcardDeck.mockResolvedValueOnce(null);
        mocks.fetchMyFlashcardReview.mockResolvedValueOnce(null);
        renderPage();
        // local deck + local review render without a remote response
        expect(await screen.findByText('Animals')).toBeInTheDocument();
        expect(screen.getByTestId('insights-panel')).toBeInTheDocument();
    });

    it('ignores the remote fetch result after unmount', async () => {
        state.isConnected = true;
        let resolveDeck: (d: FlashcardDeck | null) => void = () => undefined;
        mocks.fetchAssignedFlashcardDeck.mockReturnValueOnce(
            new Promise<FlashcardDeck | null>((res) => {
                resolveDeck = res;
            })
        );
        const { unmount } = renderPage();
        unmount();
        await act(async () => resolveDeck(deck));
        // no crash — the cancelled guard returned early
        expect(mocks.fetchMyFlashcardReview).toHaveBeenCalled();
    });

    it('reports remote save failures via the catch path', async () => {
        state.isConnected = true;
        mocks.fetchAssignedFlashcardDeck.mockResolvedValueOnce(deck);
        mocks.saveFlashcardReviewAsStudent.mockRejectedValueOnce(new Error('offline'));
        renderPage();
        await screen.findByText('Animals');

        const showAnswer = await screen.findByText('flashcards.show_answer');
        fireEvent.click(showAnswer);
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        expect(await screen.findByText('flashcards.save_failed')).toBeInTheDocument();
    });

    it('falls back to the local deck when the remote fetch rejects', async () => {
        state.isConnected = true;
        mocks.fetchAssignedFlashcardDeck.mockRejectedValueOnce(new Error('offline'));
        renderPage();
        expect(await screen.findByText('Animals')).toBeInTheDocument();
        expect(screen.getByTestId('insights-panel')).toBeInTheDocument();
    });

    it('persists a student review locally when not connected', async () => {
        state.isConnected = false;
        state.userRole = 'student';
        renderPage();
        await screen.findByText('Animals');

        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        expect(mocks.saveFlashcardReview).toHaveBeenCalledWith(
            expect.objectContaining({ deckId: 'd1', studentId: 's1' })
        );
        expect(mocks.saveFlashcardReviewAsStudent).not.toHaveBeenCalled();
    });
});
