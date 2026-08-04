import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FlashcardStudySession from '../FlashcardStudySession';
import type { FlashcardDeck } from '../../../types';

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
        { id: 'c1', front: 'meadow', back: 'weide', phonetic: '/ˈmɛdəʊ/', partOfSpeech: 'noun' },
        { id: 'c2', front: 'swift', back: 'snel', phonetic: '/swɪft/', partOfSpeech: 'adjective' },
    ],
};

describe('FlashcardStudySession', () => {
    it('renders the progress bar, phonetic/part-of-speech meta, and the deck word list', () => {
        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        // Progress bar (replaces the old plain "cards remaining" text).
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        // The deck word-list sidebar lists every card front (the current one also
        // appears in the main card, hence getAllByText).
        expect(screen.getAllByText('meadow').length).toBeGreaterThan(0);
        expect(screen.getAllByText('swift').length).toBeGreaterThan(0);
        // Phonetic · part-of-speech meta line for the first card.
        expect(screen.getByText(/·/)).toBeInTheDocument();
    });

    it('reveals the back and advances the progress bar after a rating', () => {
        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        // A rating button (Good) is now shown; click it to complete one review.
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        // One of two cards reviewed → 50%.
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    });
});
