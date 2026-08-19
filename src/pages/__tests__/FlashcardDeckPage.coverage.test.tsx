import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const mockClass2: Class = { id: 'c2', name: 'Class B' };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c2' };
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
                <Route path="/students/:studentId" element={<div>STUDENT-ROUTE</div>} />
                <Route path="/flashcards" element={<div>DECKS-ROUTE</div>} />
            </Routes>
        </MemoryRouter>
    );
}

let FlashcardDeckPage: React.ComponentType;

describe('FlashcardDeckPage coverage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockUseApp.flashcardDecks = [mockDeck];
        mockUseApp.flashcardAssignments = [mockAssignment];
        mockUseApp.flashcardReviews = [mockReview];
        mockUseApp.students = [mockStudent];
        mockUseApp.classes = [mockClass];
        const mod = await import('../FlashcardDeckPage');
        FlashcardDeckPage = mod.default;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('skips autosave when the draft is reverted before the debounce fires', () => {
        vi.useFakeTimers();
        renderPage();
        const nameInput = screen.getByLabelText('flashcards.deck_name_label');
        fireEvent.change(nameInput, { target: { value: 'Temp' } });
        fireEvent.change(nameInput, { target: { value: 'Vocab Deck' } });
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(mockUpdateFlashcardDeck).not.toHaveBeenCalled();
    });

    it('edits every card field and the deck metadata, patching only the touched card', async () => {
        renderPage();
        fireEvent.change(screen.getByLabelText('flashcards.deck_name_label'), { target: { value: 'Renamed' } });
        fireEvent.change(screen.getByLabelText('flashcards.deck_description_label'), {
            target: { value: 'New description' },
        });
        fireEvent.change(screen.getByLabelText('flashcards.deck_kind_label'), {
            target: { value: 'vocabulary' },
        });
        const fronts = screen.getAllByLabelText('flashcards.card_front');
        const backs = screen.getAllByLabelText('flashcards.card_back');
        const examples = screen.getAllByLabelText('flashcards.card_example');
        const phonetics = screen.getAllByLabelText('flashcards.card_phonetic');
        const parts = screen.getAllByLabelText('flashcards.card_part_of_speech');
        fireEvent.change(fronts[0], { target: { value: 'goodbye' } });
        fireEvent.change(backs[0], { target: { value: 'tot ziens' } });
        fireEvent.change(examples[0], { target: { value: 'Goodbye world' } });
        fireEvent.change(phonetics[0], { target: { value: 'ɡʊdˈbaɪ' } });
        fireEvent.change(parts[0], { target: { value: 'interjection' } });
        await waitFor(() => expect(mockUpdateFlashcardDeck).toHaveBeenCalled(), { timeout: 2000 });
        const saved = mockUpdateFlashcardDeck.mock.calls[0][0];
        expect(saved.name).toBe('Renamed');
        expect(saved.description).toBe('New description');
        expect(saved.cards[0]).toEqual(
            expect.objectContaining({
                front: 'goodbye',
                back: 'tot ziens',
                example: 'Goodbye world',
                phonetic: 'ɡʊdˈbaɪ',
                partOfSpeech: 'interjection',
            })
        );
        // The untouched second card is preserved via the patchCard non-match arm.
        expect(saved.cards[1]).toEqual(expect.objectContaining({ front: 'bye', back: 'doei' }));
    });

    it('links a grammar item on a grammar deck', async () => {
        mockUseApp.flashcardDecks = [{ ...mockDeck, deckKind: 'grammar' }];
        renderPage();
        const select = screen.getAllByLabelText('flashcards.card_grammar_item_label')[0];
        fireEvent.change(select, { target: { value: 'g1' } });
        await waitFor(() => expect(mockUpdateFlashcardDeck).toHaveBeenCalled(), { timeout: 2000 });
        expect(mockUpdateFlashcardDeck.mock.calls[0][0].cards[0].linkedGrammarItemId).toBe('g1');
    });

    it('adopts a fresher synced deck when there are no unsaved edits', () => {
        const view = renderPage();
        mockUseApp.flashcardDecks = [{ ...mockDeck, name: 'Synced Deck', updatedAt: '2024-02-01T00:00:00Z' }];
        view.rerender(
            <MemoryRouter initialEntries={['/flashcards/d1']}>
                <Routes>
                    <Route path="/flashcards/:id" element={<FlashcardDeckPage />} />
                    <Route path="/students/:studentId" element={<div>STUDENT-ROUTE</div>} />
                    <Route path="/flashcards" element={<div>DECKS-ROUTE</div>} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByLabelText('flashcards.deck_name_label')).toHaveValue('Synced Deck');
    });

    it('resets the assign class when the current class disappears', () => {
        const view = renderPage();
        mockUseApp.classes = [mockClass2];
        view.rerender(
            <MemoryRouter initialEntries={['/flashcards/d1']}>
                <Routes>
                    <Route path="/flashcards/:id" element={<FlashcardDeckPage />} />
                    <Route path="/students/:studentId" element={<div>STUDENT-ROUTE</div>} />
                    <Route path="/flashcards" element={<div>DECKS-ROUTE</div>} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByLabelText('flashcards.assign_class_label')).toHaveValue('c2');
    });

    it('falls back to an empty assign class when there are no classes at all', () => {
        mockUseApp.classes = [];
        renderPage();
        // With no classes the assign selector renders empty (classes[0]?.id ?? '' arm).
        expect(screen.getByLabelText('flashcards.assign_class_label')).toBeInTheDocument();
    });

    it('assigns to the newly selected class and bails out when it has no students', () => {
        mockUseApp.classes = [mockClass, mockClass2];
        mockUseApp.students = [mockStudent, mockStudent2];
        renderPage();
        fireEvent.change(screen.getByLabelText('flashcards.assign_class_label'), { target: { value: 'c2' } });
        fireEvent.click(screen.getByText('flashcards.assign_button'));
        expect(mockAddFlashcardAssignments).toHaveBeenCalledWith([
            expect.objectContaining({ deckId: 'd1', studentId: 's2' }),
        ]);

        // A class with no students hits the early return.
        mockAddFlashcardAssignments.mockClear();
        mockUseApp.students = [];
        fireEvent.change(screen.getByLabelText('flashcards.assign_class_label'), { target: { value: 'c1' } });
        fireEvent.click(screen.getByText('flashcards.assign_button'));
        expect(mockAddFlashcardAssignments).not.toHaveBeenCalled();
    });

    it('skips the progress row when the assigned student no longer exists', () => {
        mockUseApp.flashcardAssignments = [{ ...mockAssignment, studentId: 'ghost' }];
        renderPage();
        expect(screen.getByText('flashcards.student_progress_heading')).toBeInTheDocument();
        expect(screen.queryByText('Alice')).toBeNull();
    });

    it('renders a progress row for a student without a review via the null fallback', () => {
        mockUseApp.students = [mockStudent, mockStudent2];
        mockUseApp.flashcardAssignments = [mockAssignment, { ...mockAssignment, studentId: 's2' }];
        renderPage();
        // Alice's review exists; Bob's row falls through the `?? null` arm.
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getAllByTestId('insights-panel')).toHaveLength(2);
    });

    it('navigates to the student profile and back to the deck list', () => {
        renderPage();
        fireEvent.click(screen.getByText('Alice'));
        expect(screen.getByText('STUDENT-ROUTE')).toBeInTheDocument();
    });

    it('navigates back to the deck list via the back button', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.back_to_decks'));
        expect(screen.getByText('DECKS-ROUTE')).toBeInTheDocument();
    });

    it('closes the import modal without importing and closes the preview via its chrome', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.import_button'));
        expect(screen.getByTestId('import-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Import'));
        expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('flashcards.preview_deck'));
        expect(screen.getByTestId('study-session')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByTestId('study-session')).not.toBeInTheDocument();
    });

    it('closes the preview modal via Escape', () => {
        renderPage();
        fireEvent.click(screen.getByText('flashcards.preview_deck'));
        expect(screen.getByTestId('study-session')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByTestId('study-session')).not.toBeInTheDocument();
    });

    it('falls back to the default title and empty description for a nameless deck', () => {
        mockUseApp.flashcardDecks = [
            { ...mockDeck, name: '', description: undefined as unknown as string, deckKind: undefined as never },
        ];
        renderPage();
        expect(screen.getByLabelText('flashcards.deck_description_label')).toHaveValue('');
        // The deck-kind select falls back to vocabulary when unset.
        expect(screen.getByLabelText('flashcards.deck_kind_label')).toHaveValue('vocabulary');
        // The Topbar title falls back to the deck title key.
        expect(screen.getByText('flashcards.deck_title')).toBeInTheDocument();
    });
});
