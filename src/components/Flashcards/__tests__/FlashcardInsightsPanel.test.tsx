import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FlashcardInsightsPanel from '../FlashcardInsightsPanel';
import type { DeckInsights } from '../../../utils/flashcardInsights';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en' },
    }),
}));

const insights: DeckInsights = {
    totalCards: 10,
    newCount: 3,
    learningCount: 2,
    reviewCount: 4,
    masteredCount: 1,
    dueCount: 5,
    lastStudied: '2024-06-01T09:00:00Z',
    focusCards: [
        { id: 'c1', front: 'word A', back: 'meaning A' },
        { id: 'c2', front: 'word B', back: 'meaning B' },
    ],
};

describe('FlashcardInsightsPanel', () => {
    it('renders a stage legend with counts for every FSRS stage', () => {
        render(<FlashcardInsightsPanel insights={insights} />);
        expect(screen.getByText(/flashcards\.stage_new: 3/)).toBeInTheDocument();
        expect(screen.getByText(/flashcards\.stage_learning: 2/)).toBeInTheDocument();
        expect(screen.getByText(/flashcards\.stage_review: 4/)).toBeInTheDocument();
        expect(screen.getByText(/flashcards\.stage_mastered: 1/)).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAccessibleName('flashcards.progress_bar_label');
    });

    it('shows the due count only when due cards exist', () => {
        const { rerender } = render(<FlashcardInsightsPanel insights={insights} />);
        expect(screen.getByText('flashcards.due_count:{"count":5}')).toBeInTheDocument();

        rerender(<FlashcardInsightsPanel insights={{ ...insights, dueCount: 0 }} />);
        expect(screen.queryByText(/due_count/)).not.toBeInTheDocument();
    });

    it('lists the focus cards as badges with the front text', () => {
        render(<FlashcardInsightsPanel insights={insights} />);
        expect(screen.getByText('flashcards.focus_words')).toBeInTheDocument();
        expect(screen.getByText('word A')).toBeInTheDocument();
        expect(screen.getByText('word B')).toBeInTheDocument();
    });

    it('uses the kind-neutral label for grammar decks', () => {
        render(<FlashcardInsightsPanel insights={insights} deckKind="grammar" />);
        expect(screen.getByText('flashcards.focus_items')).toBeInTheDocument();
    });

    it('hides the focus list and last-studied line in compact mode', () => {
        render(<FlashcardInsightsPanel insights={insights} compact />);
        expect(screen.queryByText('word A')).not.toBeInTheDocument();
        expect(screen.queryByText(/last_studied/)).not.toBeInTheDocument();
    });

    it('renders the last-studied date when present', () => {
        render(<FlashcardInsightsPanel insights={insights} />);
        // The localized date string depends on the host timezone — assert the key prefix only.
        const text = screen.getByText(/flashcards\.last_studied:/).textContent!;
        expect(text).toContain('2024');
    });
});
