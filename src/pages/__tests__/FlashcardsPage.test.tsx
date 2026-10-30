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
const mockUpdateDeck = vi.fn();
const mockAddFolder = vi.fn();
const mockUpdateFolder = vi.fn();
const mockDeleteFolder = vi.fn();
let mockDecks: FlashcardDeck[] = [];
let mockAssignments: FlashcardAssignment[] = [];
let mockFolders: { id: string; name: string; kind: string; createdAt: string }[] = [];

const makeAppValue = () => ({
    flashcardDecks: mockDecks,
    flashcardAssignments: mockAssignments,
    addFlashcardDeck: mockAddDeck,
    updateFlashcardDeck: mockUpdateDeck,
    deleteFlashcardDeck: mockDeleteDeck,
    folders: mockFolders,
    addFolder: mockAddFolder,
    updateFolder: mockUpdateFolder,
    deleteFolder: mockDeleteFolder,
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

// Stands in for the drag machinery so a test can start a drag and end it with a given reason.
const dnd = vi.hoisted(() => ({
    onDragEnd: null as unknown as (r: unknown) => void,
    onBeforeCapture: null as unknown as () => void,
    dragDisabled: new Map<string, boolean>(),
}));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({
        children,
        onBeforeCapture,
        onDragEnd,
    }: {
        children: React.ReactNode;
        onBeforeCapture: () => void;
        onDragEnd: (r: unknown) => void;
    }) => {
        dnd.onDragEnd = onDragEnd;
        dnd.onBeforeCapture = onBeforeCapture;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
    Draggable: ({
        children,
        draggableId,
        isDragDisabled,
    }: {
        children: (p: unknown, s: unknown) => React.ReactNode;
        draggableId: string;
        isDragDisabled?: boolean;
    }) => {
        dnd.dragDisabled.set(draggableId, !!isDragDisabled);
        return children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false });
    },
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
        mockUpdateDeck.mockReset();
        mockAddFolder.mockReset();
        mockDeleteFolder.mockReset();
        mockDecks = [];
        mockAssignments = [];
        mockFolders = [];
        dnd.dragDisabled.clear();
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

describe('FlashcardsPage folders', () => {
    const folder = { id: 'deck-f1', name: 'Term 1', kind: 'flashcard', createdAt: '2024-01-01T00:00:00Z' };
    const deckB: FlashcardDeck = {
        id: 'd2',
        name: 'Week 2 Words',
        cards: [],
        createdAt: '2024-03-01T00:00:00Z',
    };

    beforeEach(() => {
        mockNavigate.mockClear();
        mockUpdateDeck.mockReset();
        mockAddFolder.mockReset();
        mockDeleteFolder.mockReset();
        mockFolders = [folder];
        mockAssignments = [];
    });

    it('counts filed decks on the tile and filters to the folder when it is clicked', async () => {
        mockDecks = [{ ...deckA, folderId: 'deck-f1' }, deckB];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        expect(screen.getByText('folders.items_count:{"count":1}')).toBeInTheDocument();
        expect(screen.getByText('Week 2 Words')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Term 1'));

        expect(screen.getByText('Week 1 Words')).toBeInTheDocument();
        expect(screen.queryByText('Week 2 Words')).not.toBeInTheDocument();
    });

    it('creates a flashcard folder that is separate from the rubric and test trees', async () => {
        mockDecks = [deckA];
        mockAddFolder.mockReturnValue({ ...folder, id: 'deck-f-new', name: 'Term 2' });
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        fireEvent.click(screen.getByText('folders.new_folder'));
        fireEvent.change(screen.getByLabelText('folders.folder_name'), { target: { value: 'Term 2' } });
        fireEvent.click(screen.getByText('folders.create'));

        expect(mockAddFolder).toHaveBeenCalledWith({ name: 'Term 2', kind: 'flashcard', displayOrder: 0 });
    });

    it('files a deck on a real drop over a folder tile but not on a cancelled drag', async () => {
        mockDecks = [deckA];
        mockFolders = [{ id: 'deck-f1', name: 'Term 1', kind: 'flashcard', createdAt: '2024-02-01T00:00:00Z' }];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        const tile = document.createElement('div');
        tile.setAttribute('data-drop-folder-id', 'deck-f1');
        const label = document.createElement('span');
        tile.appendChild(label);
        document.body.appendChild(tile);
        // jsdom has no layout, and with it no elementFromPoint at all; stand in for the hit test.
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            writable: true,
            value: () => label,
        });

        const dragOntoTile = () => {
            act(() => dnd.onBeforeCapture());
            act(() => {
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
            });
        };

        // Escape ends the drag with reason CANCEL and a null destination; the pointer is still there.
        dragOntoTile();
        act(() => {
            dnd.onDragEnd({ source: { index: 0, droppableId: 'deck-list' }, destination: null, reason: 'CANCEL' });
        });
        expect(mockUpdateDeck).not.toHaveBeenCalled();

        dragOntoTile();
        act(() => {
            dnd.onDragEnd({ source: { index: 0, droppableId: 'deck-list' }, destination: null, reason: 'DROP' });
        });
        expect(mockUpdateDeck).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', folderId: 'deck-f1' }));

        Reflect.deleteProperty(document, 'elementFromPoint');
        tile.remove();
    });

    it('offers no drag for a shared student deck, which cannot be filed', async () => {
        mockDecks = [
            deckA,
            { ...deckA, id: 'd2', name: 'Student deck', ownerStudentId: 's1', sharedWithTeacher: true },
        ];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        const { container } = renderWithRouter(<FlashcardsPage />);

        expect(screen.getByText('Student deck')).toBeInTheDocument();
        expect(dnd.dragDisabled.get('d1')).toBe(false);
        expect(dnd.dragDisabled.get('d2')).toBe(true);
        // One grip for the teacher deck, none for the read-only one.
        expect(container.querySelectorAll('[aria-label="folders.drag_to_file"]')).toHaveLength(1);
    });

    it('unfiles the decks but keeps them when the folder is deleted', async () => {
        mockDecks = [{ ...deckA, folderId: 'deck-f1' }];
        const { default: FlashcardsPage } = await import('../FlashcardsPage');
        renderWithRouter(<FlashcardsPage />);

        fireEvent.click(screen.getByLabelText('folders.delete'));
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });

        expect(mockDeleteFolder).toHaveBeenCalledWith('deck-f1', 'flashcard');
        expect(mockDeleteDeck).not.toHaveBeenCalled();
    });
});
