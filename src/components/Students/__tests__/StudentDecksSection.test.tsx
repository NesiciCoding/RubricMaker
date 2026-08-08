import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentDecksSection from '../StudentDecksSection';
import type { FlashcardDeck } from '../../../types';

const addFlashcardDeck = vi.fn();
const updateFlashcardDeck = vi.fn();
const deleteFlashcardDeck = vi.fn();
const saveFlashcardDeckAsStudent = vi.fn().mockResolvedValue({ success: true });
const deleteFlashcardDeckAsStudent = vi.fn().mockResolvedValue({ success: true });
const fetchMyStudentFlashcardDecks = vi.fn().mockResolvedValue([]);

let decks: FlashcardDeck[] = [];
let connected = false;

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        flashcardDecks: decks,
        addFlashcardDeck,
        updateFlashcardDeck,
        deleteFlashcardDeck,
        saveFlashcardDeckAsStudent,
        deleteFlashcardDeckAsStudent,
        fetchMyStudentFlashcardDecks,
    }),
}));
vi.mock('../../../hooks/useDbStatus', () => ({ useDbStatus: () => ({ isConnected: connected }) }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../Flashcards/FlashcardStudySession', () => ({ default: () => <div data-testid="study" /> }));
vi.mock('../../ui/Modal', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
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
});
