import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, FlashcardCardState, FlashcardDeck, FlashcardReview, Student } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    userRole: 'student',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const deck: FlashcardDeck = {
    id: 'd1',
    name: 'Week 1 Words',
    cards: [
        { id: 'c1', front: 'apple', back: 'appel' },
        { id: 'c2', front: 'book', back: 'boek' },
    ],
    createdAt: '2024-02-01T00:00:00Z',
};

const mockSaveFlashcardReview = vi.fn();
const mockSaveFlashcardReviewAsStudent = vi.fn();

let mockDecks: FlashcardDeck[] = [];
let mockReviews: FlashcardReview[] = [];
let mockIsConnected = false;
let mockUserRole: string | undefined = 'student';

const makeAppValue = () => ({
    students: [mockStudent],
    settings: { ...mockSettings, userRole: mockUserRole },
    flashcardDecks: mockDecks,
    flashcardReviews: mockReviews,
    saveFlashcardReview: mockSaveFlashcardReview,
    fetchAssignedFlashcardDeck: vi.fn().mockResolvedValue(null),
    fetchMyFlashcardReview: vi.fn().mockResolvedValue(null),
    saveFlashcardReviewAsStudent: mockSaveFlashcardReviewAsStudent,
});

vi.mock('../../context/AppContext', () => ({
    useApp: () => makeAppValue(),
    useRoster: () => makeAppValue(),
    useAuthoring: () => makeAppValue(),
    useAssessment: () => makeAppValue(),
    useEssays: () => makeAppValue(),
    useFlashcards: () => makeAppValue(),
    useSettings: () => makeAppValue(),
    usePlatform: () => makeAppValue(),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockIsConnected }),
}));

vi.mock('../../components/Flashcards/FlashcardStudySession', () => ({
    default: ({ onStatesChange }: { onStatesChange: (states: Record<string, FlashcardCardState>) => void }) =>
        React.createElement(
            'button',
            {
                'data-testid': 'session-save',
                onClick: () =>
                    onStatesChange({
                        c1: {
                            due: '',
                            stability: 0,
                            difficulty: 0,
                            elapsed_days: 0,
                            scheduled_days: 0,
                            learning_steps: 0,
                            reps: 1,
                            lapses: 0,
                            state: 1,
                        },
                    }),
            },
            'session'
        ),
}));

vi.mock('../../components/Flashcards/FlashcardInsightsPanel', () => ({
    default: () => null,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/portal/s1/flashcards/d1']}>
            <Routes>
                <Route path="/portal/:studentId/flashcards/:deckId" element={<StudentStudyPage />} />
            </Routes>
        </MemoryRouter>
    );
}

let StudentStudyPage: React.ComponentType;

describe('StudentFlashcardStudyPage', () => {
    beforeEach(async () => {
        mockSaveFlashcardReview.mockClear();
        mockSaveFlashcardReviewAsStudent.mockClear();
        mockDecks = [deck];
        mockReviews = [];
        mockIsConnected = false;
        mockUserRole = 'student';
        const mod = await import('../StudentFlashcardStudyPage');
        StudentStudyPage = mod.default;
    });

    it('renders the deck, student name, and back link', () => {
        renderPage();
        expect(screen.getByText('Week 1 Words')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('flashcards.back_to_portal')).toBeInTheDocument();
    });

    it('shows the not-found state when the deck is missing', () => {
        mockDecks = [];
        renderPage();
        expect(screen.getByText('flashcards.deck_not_found')).toBeInTheDocument();
    });

    it('saves review progress offline to local state', () => {
        renderPage();
        fireEvent.click(screen.getByTestId('session-save'));
        expect(mockSaveFlashcardReview).toHaveBeenCalledTimes(1);
        const [review] = mockSaveFlashcardReview.mock.calls[0] as [FlashcardReview];
        expect(review.id).toBe('d1:s1');
        expect(review.deckId).toBe('d1');
        expect(review.studentId).toBe('s1');
        expect(review.cardStates.c1.state).toBe(1);
    });

    it('shows the teacher-preview banner and skips saving when a teacher previews', async () => {
        mockIsConnected = true;
        mockUserRole = 'teacher';
        renderPage();
        expect(screen.getByText('flashcards.teacher_preview_no_save')).toBeInTheDocument();
        // Loading until the remote fetch settles; the session then appears.
        const sessionBtn = await waitFor(() => screen.getByTestId('session-save'));
        fireEvent.click(sessionBtn);
        await act(async () => {});
        expect(mockSaveFlashcardReview).not.toHaveBeenCalled();
        expect(mockSaveFlashcardReviewAsStudent).not.toHaveBeenCalled();
    });
});
