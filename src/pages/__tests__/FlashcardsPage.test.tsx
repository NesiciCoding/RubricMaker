import React from 'react';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
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
    useStudents: () => makeAppValue(),
    useClasses: () => makeAppValue(),
    useGrading: () => makeAppValue(),
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

    it('prunes an empty untitled deck once the hydrated decks arrive (#693)', async () => {
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        let bump: () => void = () => {};
        function Harness() {
            const [, force] = React.useState(0);
            bump = () => force((n) => n + 1);
            return <FlashcardsPage />;
        }
        renderWithRouter(<Harness />);
        // Mounted empty, the way it is before storageSync.hydrate() resolves: nothing to prune yet.
        expect(mockDeleteDeck).not.toHaveBeenCalled();

        mockDecks = [{ id: 'untitled', name: 'Untitled deck', cards: [], createdAt: '2024-02-03T00:00:00Z' }, deckA];
        act(() => bump());
        await waitFor(() => expect(mockDeleteDeck).toHaveBeenCalledWith('untitled'));
    });

    it('does not prune the untitled deck it just created (#693)', async () => {
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        let bump: () => void = () => {};
        function Harness() {
            const [, force] = React.useState(0);
            bump = () => force((n) => n + 1);
            return <FlashcardsPage />;
        }
        renderWithRouter(<Harness />);
        fireEvent.click(screen.getAllByText('flashcards.new_deck')[0]);

        // The list stays mounted until the navigation lands, so the new empty deck appears in it.
        mockDecks = [{ id: 'deck-new', name: 'Untitled deck', cards: [], createdAt: '2024-02-05T00:00:00Z' }];
        act(() => bump());
        expect(mockDeleteDeck).not.toHaveBeenCalled();
    });

    it('recognises an untitled deck created while another language was active (#693)', async () => {
        mockDecks = [{ id: 'fr', name: 'Paquet sans titre', cards: [], createdAt: '2024-02-04T00:00:00Z' }];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        await waitFor(() => expect(mockDeleteDeck).toHaveBeenCalledWith('fr'));
    });

    it('keeps UNTITLED_DECK_NAMES in step with every shipped locale', async () => {
        const { UNTITLED_DECK_NAMES } = await import('../../utils/flashcardDecks');
        const [en, nl, fr, de, es] = await Promise.all([
            import('../../locales/en.json'),
            import('../../locales/nl.json'),
            import('../../locales/fr.json'),
            import('../../locales/de.json'),
            import('../../locales/es.json'),
        ]);
        const label = (m: { default: { flashcards: { untitled_deck: string } } }) => m.default.flashcards.untitled_deck;
        for (const shipped of [en, nl, fr, de, es].map(label)) {
            expect(UNTITLED_DECK_NAMES.has(shipped)).toBe(true);
        }
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

    it('highlights a deck card on hover and navigates from its name', async () => {
        mockDecks = [deckA];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        const card = screen.getByText('Week 1 Words').closest('.card') as HTMLElement;
        fireEvent.mouseEnter(card);
        expect(card.style.borderColor).toBe('var(--accent)');
        fireEvent.mouseLeave(card);
        expect(card.style.borderColor).toBe('var(--border)');

        fireEvent.click(screen.getByText('Week 1 Words'));
        expect(mockNavigate).toHaveBeenCalledWith('/flashcards/d1');
    });

    it('omits the description paragraph when a deck has none', async () => {
        mockDecks = [{ ...deckA, description: undefined }];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        expect(screen.getByText('Week 1 Words')).toBeInTheDocument();
    });

    it('renders a deck description when one exists', async () => {
        mockDecks = [{ ...deckA, description: 'Weekly vocabulary from the reading unit' }];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);
        expect(screen.getByText('Weekly vocabulary from the reading unit')).toBeInTheDocument();
    });
});
