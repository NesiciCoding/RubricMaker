import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentDecksSection from '../StudentDecksSection';
import type { FlashcardDeck } from '../../../types';

const showToast = vi.fn();

const addFlashcardDeck = vi.fn();
const updateFlashcardDeck = vi.fn();
const deleteFlashcardDeck = vi.fn();
const saveFlashcardDeckAsStudent = vi.fn().mockResolvedValue({ success: true });
const deleteFlashcardDeckAsStudent = vi.fn().mockResolvedValue({ success: true });
const fetchMyStudentFlashcardDecks = vi.fn().mockResolvedValue([]);

let decks: FlashcardDeck[] = [];
let connected = false;

const makeAppContextMock = () => ({
    flashcardDecks: decks,
    addFlashcardDeck,
    updateFlashcardDeck,
    deleteFlashcardDeck,
    saveFlashcardDeckAsStudent,
    deleteFlashcardDeckAsStudent,
    fetchMyStudentFlashcardDecks,
});
vi.mock('../../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));
vi.mock('../../../hooks/useDbStatus', () => ({ useDbStatus: () => ({ isConnected: connected }) }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../Flashcards/FlashcardStudySession', () => ({
    default: ({ onExit }: { onExit?: () => void }) => (
        <div data-testid="study">
            <button type="button" aria-label="study-exit" onClick={onExit} />
        </div>
    ),
}));
vi.mock('../../ui/Modal', () => ({
    default: ({
        children,
        titleId,
        onClose,
    }: {
        children: React.ReactNode;
        titleId?: string;
        onClose?: () => void;
    }) => (
        <div role="dialog">
            {titleId === 'student-deck-study' && <button type="button" aria-label="modal-onclose" onClick={onClose} />}
            {children}
        </div>
    ),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

describe('StudentDecksSection (offline)', () => {
    beforeEach(() => {
        decks = [];
        connected = false;
        vi.clearAllMocks();
    });

    it("lists only the current student's own decks", () => {
        decks = [
            { id: 'd1', name: 'Mine', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
            { id: 'd2', name: 'Other student', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's2' },
            { id: 'd3', name: 'Teacher deck', cards: [], createdAt: '2024-01-01T00:00:00Z' },
        ];
        render(<StudentDecksSection studentId="s1" />);
        expect(screen.getByText('Mine')).toBeInTheDocument();
        expect(screen.queryByText('Other student')).not.toBeInTheDocument();
        expect(screen.queryByText('Teacher deck')).not.toBeInTheDocument();
    });

    it('creates a new deck owned by the student', () => {
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByText('studentDecks.create'));
        fireEvent.change(screen.getByPlaceholderText('studentDecks.name_placeholder'), {
            target: { value: 'Animals' },
        });
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_front'), { target: { value: 'cat' } });
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_back'), { target: { value: 'kat' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(addFlashcardDeck).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Animals',
                ownerStudentId: 's1',
                cards: [expect.objectContaining({ front: 'cat', back: 'kat' })],
            })
        );
    });

    it('toggles share-with-teacher on an existing deck', () => {
        decks = [{ id: 'd1', name: 'Mine', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' }];
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByLabelText('studentDecks.share'));
        expect(updateFlashcardDeck).toHaveBeenCalledWith(expect.objectContaining({ sharedWithTeacher: true }));
    });

    it('edits an existing deck, preserving card examples and updating via updateFlashcardDeck', () => {
        decks = [
            {
                id: 'd1',
                name: 'Mine',
                cards: [{ id: 'c1', front: 'cat', back: 'kat', example: 'A cat' }],
                createdAt: '2024-01-01T00:00:00Z',
                ownerStudentId: 's1',
            },
        ];
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByLabelText('common.edit'));
        expect(screen.getByDisplayValue('A cat')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_front'), { target: { value: 'dog' } });
        fireEvent.change(screen.getByLabelText('flashcards.card_example'), { target: { value: 'A dog' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(updateFlashcardDeck).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Mine',
                cards: [expect.objectContaining({ id: 'c1', front: 'dog', back: 'kat', example: 'A dog' })],
            })
        );
    });

    it('adds and removes card rows in the editor and falls back to untitled for an empty name', () => {
        decks = [{ id: 'd1', name: '', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' }];
        render(<StudentDecksSection studentId="s1" />);
        expect(screen.getByText('studentDecks.untitled')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.edit'));
        fireEvent.click(screen.getByText('studentDecks.add_card'));
        fireEvent.click(screen.getAllByLabelText('flashcards.remove_card')[0]);
        fireEvent.click(screen.getByText('common.save'));
        expect(updateFlashcardDeck).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'studentDecks.untitled', cards: [] })
        );
    });

    it('opens the study modal for a deck with cards and closes it via every close path', () => {
        decks = [
            {
                id: 'd1',
                name: 'Mine',
                cards: [{ id: 'c1', front: 'cat', back: 'kat' }],
                createdAt: '2024-01-01T00:00:00Z',
                ownerStudentId: 's1',
            },
        ];
        render(<StudentDecksSection studentId="s1" />);

        fireEvent.click(screen.getByText('flashcards.study_button'));
        expect(screen.getByTestId('study')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('study-exit'));
        expect(screen.queryByTestId('study')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('flashcards.study_button'));
        fireEvent.click(screen.getByLabelText('modal-onclose'));
        expect(screen.queryByTestId('study')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('flashcards.study_button'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByTestId('study')).not.toBeInTheDocument();
    });

    it('disables the study button for a deck with no cards', () => {
        decks = [{ id: 'd1', name: 'Mine', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' }];
        render(<StudentDecksSection studentId="s1" />);
        expect(screen.getByText('flashcards.study_button')).toBeDisabled();
    });

    it('deletes an offline deck via the local store', () => {
        decks = [{ id: 'd1', name: 'Mine', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' }];
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByLabelText('common.delete'));
        expect(deleteFlashcardDeck).toHaveBeenCalledWith('d1');
    });

    it('closes the editor modal without saving', () => {
        decks = [{ id: 'd1', name: 'Mine', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' }];
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByLabelText('common.edit'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByPlaceholderText('studentDecks.name_placeholder')).not.toBeInTheDocument();
    });

    it('patches one card in a multi-card deck, preserving the others', () => {
        decks = [
            {
                id: 'd1',
                name: 'Multi',
                cards: [
                    { id: 'c1', front: 'cat', back: 'kat', example: 'A cat' },
                    { id: 'c2', front: 'dog', back: 'hond' },
                ],
                createdAt: '2024-01-01T00:00:00Z',
                ownerStudentId: 's1',
            },
        ];
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByLabelText('common.edit'));
        const fronts = screen.getAllByPlaceholderText('flashcards.card_front');
        fireEvent.change(fronts[0], { target: { value: 'kitten' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(updateFlashcardDeck).toHaveBeenCalledWith(
            expect.objectContaining({
                cards: [
                    expect.objectContaining({ id: 'c1', front: 'kitten' }),
                    expect.objectContaining({ id: 'c2', front: 'dog', back: 'hond' }),
                ],
            })
        );
    });
});

describe('StudentDecksSection (online)', () => {
    beforeEach(() => {
        decks = [];
        connected = true;
        vi.clearAllMocks();
        fetchMyStudentFlashcardDecks.mockResolvedValue([]);
        saveFlashcardDeckAsStudent.mockResolvedValue({ success: true });
        deleteFlashcardDeckAsStudent.mockResolvedValue({ success: true });
    });

    it('loads online decks through the student adapter', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            { id: 'od1', name: 'Online Deck', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
        ]);
        render(<StudentDecksSection studentId="s1" />);
        expect(await screen.findByText('Online Deck')).toBeInTheDocument();
        expect(fetchMyStudentFlashcardDecks).toHaveBeenCalledWith('s1');
    });

    it('shows a load error when the online fetch fails', async () => {
        fetchMyStudentFlashcardDecks.mockRejectedValue(new Error('boom'));
        render(<StudentDecksSection studentId="s1" />);
        expect(await screen.findByText('studentDecks.load_error')).toBeInTheDocument();
    });

    it('deletes an online deck through the student adapter and removes it from the list', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            { id: 'od1', name: 'Online Deck', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
        ]);
        render(<StudentDecksSection studentId="s1" />);
        await screen.findByText('Online Deck');
        fireEvent.click(screen.getByLabelText('common.delete'));
        await waitFor(() => expect(deleteFlashcardDeckAsStudent).toHaveBeenCalledWith('od1'));
        await waitFor(() => expect(screen.queryByText('Online Deck')).not.toBeInTheDocument());
    });

    it('shows an error toast when the online deletion fails', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            { id: 'od1', name: 'Online Deck', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
        ]);
        deleteFlashcardDeckAsStudent.mockResolvedValueOnce({ success: false });
        render(<StudentDecksSection studentId="s1" />);
        await screen.findByText('Online Deck');
        fireEvent.click(screen.getByLabelText('common.delete'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('studentDecks.save_error', 'error'));
        expect(screen.getByText('Online Deck')).toBeInTheDocument();
    });

    it('persists a share toggle online via the student adapter', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            { id: 'od1', name: 'Online Deck', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
        ]);
        render(<StudentDecksSection studentId="s1" />);
        await screen.findByText('Online Deck');
        fireEvent.click(screen.getByLabelText('studentDecks.share'));
        await waitFor(() =>
            expect(saveFlashcardDeckAsStudent).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'od1', sharedWithTeacher: true })
            )
        );
        expect(showToast).toHaveBeenCalledWith('studentDecks.shared_toast', 'success');
    });

    it('shows an error toast when an online share persist fails', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            { id: 'od1', name: 'Online Deck', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
        ]);
        saveFlashcardDeckAsStudent.mockResolvedValueOnce({ success: false });
        render(<StudentDecksSection studentId="s1" />);
        await screen.findByText('Online Deck');
        fireEvent.click(screen.getByLabelText('studentDecks.share'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('studentDecks.save_error', 'error'));
    });

    it('creates a deck online and upserts it into the online list', async () => {
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByText('studentDecks.create'));
        fireEvent.change(screen.getByPlaceholderText('studentDecks.name_placeholder'), {
            target: { value: 'Online Animals' },
        });
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_front'), { target: { value: 'cat' } });
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_back'), { target: { value: 'kat' } });
        fireEvent.click(screen.getByText('common.save'));
        await waitFor(() =>
            expect(saveFlashcardDeckAsStudent).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Online Animals', ownerStudentId: 's1' })
            )
        );
        expect(await screen.findByText('Online Animals')).toBeInTheDocument();
    });

    it('unshares a deck online and shows the unshared toast', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            {
                id: 'od1',
                name: 'Online Deck',
                cards: [],
                createdAt: '2024-01-01T00:00:00Z',
                ownerStudentId: 's1',
                sharedWithTeacher: true,
            },
        ]);
        render(<StudentDecksSection studentId="s1" />);
        await screen.findByText('Online Deck');
        fireEvent.click(screen.getByLabelText('studentDecks.share'));
        await waitFor(() =>
            expect(saveFlashcardDeckAsStudent).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'od1', sharedWithTeacher: false })
            )
        );
        expect(showToast).toHaveBeenCalledWith('studentDecks.unshared_toast', 'success');
    });

    it('keeps the editor open when an online save fails', async () => {
        fetchMyStudentFlashcardDecks.mockResolvedValue([
            { id: 'od1', name: 'Online Deck', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
        ]);
        saveFlashcardDeckAsStudent.mockResolvedValueOnce({ success: false });
        render(<StudentDecksSection studentId="s1" />);
        await screen.findByText('Online Deck');
        fireEvent.click(screen.getByLabelText('common.edit'));
        fireEvent.click(screen.getByText('common.save'));
        await waitFor(() => expect(saveFlashcardDeckAsStudent).toHaveBeenCalled());
        expect(screen.getByPlaceholderText('studentDecks.name_placeholder')).toBeInTheDocument();
    });

    it('ignores a late fetch resolution after unmount', async () => {
        let resolveFetch!: (d: FlashcardDeck[]) => void;
        fetchMyStudentFlashcardDecks.mockReturnValue(
            new Promise<FlashcardDeck[]>((resolve) => {
                resolveFetch = resolve;
            })
        );
        const { unmount } = render(<StudentDecksSection studentId="s1" />);
        unmount();
        await act(async () => {
            resolveFetch([
                { id: 'od1', name: 'Late', cards: [], createdAt: '2024-01-01T00:00:00Z', ownerStudentId: 's1' },
            ]);
        });
    });

    it('ignores a late fetch rejection after unmount', async () => {
        let rejectFetch!: (e: Error) => void;
        fetchMyStudentFlashcardDecks.mockReturnValue(
            new Promise<FlashcardDeck[]>((_resolve, reject) => {
                rejectFetch = reject;
            })
        );
        const { unmount } = render(<StudentDecksSection studentId="s1" />);
        unmount();
        await act(async () => {
            rejectFetch(new Error('late failure'));
        });
    });

    it('upserts a created deck before the initial fetch resolves', async () => {
        let resolveFetch!: (d: FlashcardDeck[]) => void;
        fetchMyStudentFlashcardDecks.mockReturnValue(
            new Promise<FlashcardDeck[]>((resolve) => {
                resolveFetch = resolve;
            })
        );
        render(<StudentDecksSection studentId="s1" />);
        fireEvent.click(screen.getByText('studentDecks.create'));
        fireEvent.change(screen.getByPlaceholderText('studentDecks.name_placeholder'), {
            target: { value: 'Fast Deck' },
        });
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_front'), { target: { value: 'cat' } });
        fireEvent.change(screen.getByPlaceholderText('flashcards.card_back'), { target: { value: 'kat' } });
        fireEvent.click(screen.getByText('common.save'));
        await waitFor(() =>
            expect(saveFlashcardDeckAsStudent).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Fast Deck', ownerStudentId: 's1' })
            )
        );
        await act(async () => {
            resolveFetch([]);
        });
    });
});
