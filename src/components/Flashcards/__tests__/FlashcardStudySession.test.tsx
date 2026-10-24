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
        // Full phonetic · part-of-speech meta line for the first card (meadow).
        expect(screen.getByText('/ˈmɛdəʊ/ · noun')).toBeInTheDocument();
    });

    it('never shows vocabulary metadata for a grammar deck, even when card fields persist', () => {
        const grammarDeck: FlashcardDeck = {
            ...deck,
            deckKind: 'grammar',
            // A card carrying leftover phonetic/POS from before the deck was switched to grammar.
            cards: [{ id: 'g1', front: 'past simple', back: 'walked', phonetic: '/wɔːkt/', partOfSpeech: 'verb' }],
        };
        render(<FlashcardStudySession deck={grammarDeck} initialStates={{}} />);
        expect(screen.queryByText(/·/)).not.toBeInTheDocument();
        expect(screen.queryByText('/wɔːkt/', { exact: false })).not.toBeInTheDocument();
    });

    it('reveals the back and advances the progress bar after a rating', () => {
        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        // A rating button (Good) is now shown; click it to complete one review.
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        // 'Good' on a new card is scheduled exactly the 10-minute learning step, which sits
        // inside the session's requeue window, so the card comes back later in the session:
        // 1 review landed, 2 cards still queued → 33%.
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    });

    it('shows the rating hint and wires it to each rating button as an accessible description', () => {
        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        expect(screen.getByText('flashcards.rate_hint')).toBeInTheDocument();
        for (const key of [
            'flashcards.rate_again',
            'flashcards.rate_hard',
            'flashcards.rate_good',
            'flashcards.rate_easy',
        ]) {
            expect(screen.getByText(key).closest('button')).toHaveAttribute('aria-describedby', 'flashcard-rate-hint');
        }
    });

    it('lays the four rating buttons out as an even grid, not a flex row that wraps one alone', () => {
        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        const easyButton = screen.getByText('flashcards.rate_easy').closest('button');
        const row = easyButton?.parentElement;
        expect(row).toHaveStyle({ display: 'grid' });
    });

    it('re-queues a card rated Good (the 10-minute step) but drops one rated Easy (8 days)', () => {
        const first = render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        // The Good card is re-queued behind the untouched second card.
        expect(screen.getByText('flashcards.study_progress_count:{"done":1,"remaining":2}')).toBeInTheDocument();
        first.unmount();

        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_easy'));
        // Easy pushes the card out to the 8-day step — past the window, so it leaves.
        expect(screen.getByText('flashcards.study_progress_count:{"done":1,"remaining":1}')).toBeInTheDocument();
    });
});
