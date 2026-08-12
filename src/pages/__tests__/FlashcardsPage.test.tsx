import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import type { FlashcardAssignment, FlashcardDeck } from '../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const mockAddDeck = vi.fn();
const mockDeleteDeck = vi.fn();
let mockDecks: FlashcardDeck[] = [];
let mockAssignments: FlashcardAssignment[] = [];

const makeAppValue = () => ({
    flashcardDecks: mockDecks,
    flashcardAssignments: mockAssignments,
    addFlashcardDeck: mockAddDeck,
    deleteFlashcardDeck: mockDeleteDeck,
    students: [],
    studentRubrics: [],
    settings: {
        defaultGradeScaleId: 'gs1',
        theme: 'dark',
        language: 'en',
        accentColor: '#3b82f6',
    },
    updateSettings: vi.fn(),
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

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const deckA: FlashcardDeck = {
    id: 'd1',
    name: 'Week 1 Words',
    cards: [{ id: 'c1', front: 'apple', back: 'appel' }],
    createdAt: '2024-02-01T00:00:00Z',
};

describe('FlashcardsPage', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
        mockAddDeck.mockClear();
        mockDeleteDeck.mockClear();
        mockDecks = [];
        mockAssignments = [];
        mockAddDeck.mockImplementation((deck: Partial<FlashcardDeck>) => ({
            id: 'deck-new',
            name: deck.name ?? '',
            cards: [],
            createdAt: '2024-02-02T00:00:00Z',
        }));
    });

    it('shows the empty state and creates a deck from it', async () => {
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        expect(screen.getByText('flashcards.no_decks')).toBeInTheDocument();
        fireEvent.click(screen.getAllByText('flashcards.new_deck')[0]);
        expect(mockAddDeck).toHaveBeenCalledWith({ name: 'flashcards.untitled_deck', cards: [] });
        expect(mockNavigate).toHaveBeenCalledWith('/flashcards/deck-new');
    });

    it('lists decks with card counts and navigates to edit', async () => {
        mockDecks = [deckA];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        expect(screen.getByText('Week 1 Words')).toBeInTheDocument();
        expect(screen.getByText('flashcards.card_count:{"count":1}')).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('flashcards.action_edit'));
        expect(mockNavigate).toHaveBeenCalledWith('/flashcards/d1');
    });

    it('cancels the delete confirmation without deleting', async () => {
        mockDecks = [deckA];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        fireEvent.click(screen.getByTitle('flashcards.action_delete'));
        expect(screen.getByText('flashcards.delete_deck_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockDeleteDeck).not.toHaveBeenCalled();
    });

    it('deletes a deck after confirming', async () => {
        mockDecks = [deckA];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        fireEvent.click(screen.getByTitle('flashcards.action_delete'));
        expect(screen.getByText('flashcards.delete_deck_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.delete'));
        await waitFor(() => expect(mockDeleteDeck).toHaveBeenCalledWith('d1'));
    });

    it('shows the assigned-count badge and shared student deck badge', async () => {
        const sharedDeck: FlashcardDeck = {
            ...deckA,
            id: 'd2',
            name: 'My Study Deck',
            ownerStudentId: 's1',
            sharedWithTeacher: true,
        };
        mockDecks = [deckA, sharedDeck];
        mockAssignments = [
            { id: 'a1', deckId: 'd1', studentId: 's1' },
            { id: 'a2', deckId: 'd1', studentId: 's2' },
        ] as unknown as FlashcardAssignment[];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        expect(screen.getByText('flashcards.assigned_count:{"count":2}')).toBeInTheDocument();
        expect(screen.getByText('studentDecks.from_student_badge')).toBeInTheDocument();
        // The shared student deck has no edit/delete buttons.
        const editButtons = screen.getAllByTitle('flashcards.action_edit');
        expect(editButtons).toHaveLength(1);
    });

    it('filters out private student decks from the teacher list', async () => {
        const privateDeck: FlashcardDeck = {
            ...deckA,
            id: 'd3',
            name: 'Private Deck',
            ownerStudentId: 's1',
            sharedWithTeacher: false,
        };
        mockDecks = [deckA, privateDeck];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        expect(screen.getByText('Week 1 Words')).toBeInTheDocument();
        expect(screen.queryByText('Private Deck')).not.toBeInTheDocument();
    });
});
