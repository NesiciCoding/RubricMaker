import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Class, FlashcardAssignment, FlashcardDeck, FlashcardReview, Student } from '../../types';

const mockDeck: FlashcardDeck = {
    id: 'd1',
    name: 'Vocab Deck',
    description: 'A deck',
    cards: [
        { id: 'c1', front: 'hello', back: 'hallo', example: 'Hello world', phonetic: 'həˈləʊ', partOfSpeech: 'noun' },
        { id: 'c2', front: 'bye', back: 'doei' },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deckKind: 'vocabulary',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockAssignment: FlashcardAssignment = {
    deckId: 'd1',
    studentId: 's1',
    deckName: 'Vocab Deck',
    cardCount: 2,
    createdAt: '2024-01-01T00:00:00Z',
};
const mockReview: FlashcardReview = {
    id: 'd1:s1',
    deckId: 'd1',
    studentId: 's1',
    cardStates: {},
    updatedAt: '2024-01-01T00:00:00Z',
};

const mockUpdateFlashcardDeck = vi.fn();
const mockAddFlashcardAssignments = vi.fn();
const mockShowToast = vi.fn();

const mockUseApp: Record<string, unknown> = {
    flashcardDecks: [mockDeck],
    flashcardAssignments: [mockAssignment],
    flashcardReviews: [mockReview],
    students: [mockStudent],
    classes: [mockClass],
    studentRubrics: [],
    settings: { activeClassId: 'c1' },
    updateSettings: vi.fn(),
    updateFlashcardDeck: mockUpdateFlashcardDeck,
    addFlashcardAssignments: mockAddFlashcardAssignments,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockUseApp,
    useRoster: () => mockUseApp,
    useStudents: () => mockUseApp,
    useClasses: () => mockUseApp,
    useGrading: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (params) return `${key}:${JSON.stringify(params)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

vi.mock('../../components/Flashcards/FlashcardImportModal', () => ({
    default: ({
        onImport,
        onClose,
    }: {
        onImport: (parsed: { front: string; back: string }[]) => void;
        onClose: () => void;
    }) => (
        <div data-testid="import-modal">
            <button onClick={() => onImport([{ front: 'imported', back: 'geïmporteerd' }])}>Do Import</button>
            <button onClick={onClose}>Close Import</button>
        </div>
    ),
}));

vi.mock('../../components/Flashcards/FlashcardStudySession', () => ({
    default: ({ onExit }: { onExit: () => void }) => (
        <div data-testid="study-session">
            <button onClick={onExit}>Exit Session</button>
        </div>
    ),
}));

vi.mock('../../components/Flashcards/FlashcardInsightsPanel', () => ({
    default: () => <div data-testid="insights-panel" />,
}));

vi.mock('../../components/CEFR/GrammarItemSelect', () => ({
    default: ({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) => (
        <select
            aria-label="flashcards.card_grammar_item_label"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
        >
            <option value="">none</option>
            <option value="g1">Past Simple</option>
        </select>
    ),
}));

function renderPage(deckId = 'd1') {
    return render(
        <MemoryRouter initialEntries={[`/flashcards/${deckId}`]}>
            <Routes>
                <Route path="/flashcards/:id" element={<FlashcardDeckPage />} />
            </Routes>
        </MemoryRouter>
    );
}

let FlashcardDeckPage: React.ComponentType;

describe('FlashcardDeckPage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockUseApp.flashcardDecks = [mockDeck];
        mockUseApp.flashcardAssignments = [mockAssignment];
        mockUseApp.flashcardReviews = [mockReview];
        const mod = await import('../FlashcardDeckPage');
        FlashcardDeckPage = mod.default;
    });

    it('shows the not-found state for an unknown deck and navigates back', () => {
        renderPage('missing');
        expect(screen.getByText('flashcards.deck_not_found')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.back'));
    });

    it('renders deck metadata and editable cards', () => {
        renderPage();
        expect(screen.getByLabelText('flashcards.deck_name_label')).toHaveValue('Vocab Deck');
        expect(screen.getByLabelText('flashcards.deck_description_label')).toHaveValue('A deck');
        expect(screen.getAllByLabelText('flashcards.card_front')[0]).toHaveValue('hello');
        expect(screen.getAllByLabelText('flashcards.card_back')[0]).toHaveValue('hallo');
        expect(screen.getAllByLabelText('flashcards.card_example')[0]).toHaveValue('Hello world');
        expect(screen.getAllByLabelText('flashcards.card_phonetic')[0]).toHaveValue('həˈləʊ');
        expect(screen.getAllByLabelText('flashcards.card_part_of_speech')[0]).toHaveValue('noun');
        // Two cards rendered with remove buttons
        expect(screen.getAllByLabelText('flashcards.remove_card')).toHaveLength(2);
    });

    it('adds and removes cards', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.add_card'));
        expect(screen.getAllByLabelText('flashcards.remove_card')).toHaveLength(3);

        fireEvent.click(screen.getAllByLabelText('flashcards.remove_card')[0]);
        expect(screen.getAllByLabelText('flashcards.remove_card')).toHaveLength(2);
    });

    it('autosaves edits after the debounce delay', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('flashcards.deck_name_label'), {
            target: { value: 'Renamed Deck' },
        });
        await waitFor(() => expect(mockUpdateFlashcardDeck).toHaveBeenCalled(), { timeout: 2000 });
        expect(mockUpdateFlashcardDeck.mock.calls[0][0].name).toBe('Renamed Deck');
    });

    it('shows the empty-cards hint and disables assign when no card is valid', () => {
        mockUseApp.flashcardDecks = [{ ...mockDeck, cards: [] }];
        renderPage();
        expect(screen.getByText('flashcards.no_cards_hint')).toBeInTheDocument();
        expect(screen.getByText('flashcards.assign_needs_cards')).toBeInTheDocument();
        expect(screen.getByText('flashcards.assign_button').closest('button')).toBeDisabled();
    });

    it('assigns the deck to all students in the selected class', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.assign_button'));
        expect(mockAddFlashcardAssignments).toHaveBeenCalledWith([
            expect.objectContaining({ deckId: 'd1', studentId: 's1', cardCount: 2 }),
        ]);
        expect(mockShowToast).toHaveBeenCalledWith('flashcards.assign_success:{"count":1}', 'success');
    });

    it('imports cards through the import modal and appends them', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.import_button'));
        fireEvent.click(screen.getByText('Do Import'));
        expect(screen.getAllByLabelText('flashcards.remove_card')).toHaveLength(3);
        expect(mockShowToast).toHaveBeenCalledWith('flashcards.import_success:{"count":1}', 'success');
    });

    it('previews the deck in a study session and closes it', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.preview_deck'));
        expect(screen.getByTestId('study-session')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Exit Session'));
        expect(screen.queryByTestId('study-session')).not.toBeInTheDocument();
    });

    it('shows student progress for assigned students', () => {
        renderPage();
        expect(screen.getByText('flashcards.student_progress_heading')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByTestId('insights-panel')).toBeInTheDocument();
    });

    it('renders grammar-specific fields and a grammar item select for grammar decks', () => {
        mockUseApp.flashcardDecks = [{ ...mockDeck, deckKind: 'grammar' }];
        renderPage();
        expect(screen.getAllByLabelText('flashcards.card_front_grammar')).toHaveLength(2);
        expect(screen.getAllByLabelText('flashcards.card_back_grammar')).toHaveLength(2);
        expect(screen.getAllByLabelText('flashcards.card_grammar_item_label')).toHaveLength(2);
        // phonetic/part-of-speech inputs are hidden for grammar decks
        expect(screen.queryByLabelText('flashcards.card_phonetic')).not.toBeInTheDocument();
    });
});
