import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FlashcardStudySession from '../FlashcardStudySession';
import type { FlashcardCardState, FlashcardDeck } from '../../../types';

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
        {
            id: 'c1',
            front: 'meadow',
            back: 'weide',
            phonetic: '/ˈmɛdəʊ/',
            partOfSpeech: 'noun',
            example: 'a green meadow',
        },
        { id: 'c2', front: 'swift', back: 'snel', phonetic: '/swɪft/', partOfSpeech: 'adjective' },
    ],
};

function cardEl() {
    return screen.getByTestId('study-card-front').closest('[role="button"]') as HTMLElement;
}

describe('FlashcardStudySession coverage', () => {
    it('requeues a card rated again and dedupes the reviewed ids', () => {
        const onStatesChange = vi.fn();
        render(<FlashcardStudySession deck={deck} initialStates={{}} onStatesChange={onStatesChange} />);

        // rate "again" → card requeued, same card stays current, count advances
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_again'));
        expect(screen.queryByText('weide')).not.toBeInTheDocument(); // revealed state resets
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33'); // 1 reviewed of 3 pending
        expect(onStatesChange).toHaveBeenCalledTimes(1);
        expect(Object.keys(onStatesChange.mock.calls[0][0])).toEqual(['c1']);

        // rate "again" a second time on the same card — dedup arm of reviewedIds
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_again'));
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50'); // 2 of 4
        expect(screen.getAllByText('meadow').length).toBeGreaterThan(0);

        // rate "hard" → card is dropped from the queue, next card appears
        fireEvent.click(screen.getByText('flashcards.show_answer'));
        fireEvent.click(screen.getByText('flashcards.rate_hard'));
        expect(screen.getAllByText('swift').length).toBeGreaterThan(0);
    });

    it('reaches the done state with a summary and an exit button', () => {
        const onExit = vi.fn();
        render(<FlashcardStudySession deck={deck} initialStates={{}} onExit={onExit} />);

        for (const rating of ['flashcards.rate_good', 'flashcards.rate_good']) {
            fireEvent.click(screen.getByText('flashcards.show_answer'));
            fireEvent.click(screen.getByText(rating));
        }

        expect(screen.getByText('flashcards.session_done_title')).toBeInTheDocument();
        expect(screen.getByText('flashcards.session_done_summary:{"count":2,"again":0}')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.close'));
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('shows the nothing-due state without an exit button', () => {
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const states: Record<string, FlashcardCardState> = {
            c1: {
                due: future,
                stability: 10,
                difficulty: 0.4,
                elapsed_days: 1,
                scheduled_days: 1,
                learning_steps: 0,
                reps: 2,
                lapses: 0,
                state: 2,
                last_review: new Date().toISOString(),
            },
            c2: {
                due: future,
                stability: 10,
                difficulty: 0.4,
                elapsed_days: 1,
                scheduled_days: 1,
                learning_steps: 0,
                reps: 2,
                lapses: 0,
                state: 2,
                last_review: new Date().toISOString(),
            },
        };
        render(<FlashcardStudySession deck={deck} initialStates={states} />);

        expect(screen.getByText('flashcards.session_done_title')).toBeInTheDocument();
        expect(screen.getByText('flashcards.session_nothing_due')).toBeInTheDocument();
        expect(screen.queryByText('common.close')).not.toBeInTheDocument();
    });

    it('reveals via card click and keyboard, and ignores other keys', () => {
        const { unmount } = render(<FlashcardStudySession deck={deck} initialStates={{}} />);

        // non-Enter key does nothing
        fireEvent.keyDown(cardEl(), { key: 'x' });
        expect(screen.queryByText('weide')).not.toBeInTheDocument();

        // Enter reveals, including the example line
        fireEvent.keyDown(cardEl(), { key: 'Enter' });
        expect(screen.getByText('weide')).toBeInTheDocument();
        expect(screen.getByText('a green meadow')).toBeInTheDocument();

        // clicking the revealed card is a no-op (event bubbles to the card div)
        fireEvent.click(screen.getByTestId('study-card-front'));
        expect(screen.getByText('weide')).toBeInTheDocument();

        // space reveals the next card after a rating
        fireEvent.click(screen.getByText('flashcards.rate_good'));
        expect(screen.getAllByText('swift').length).toBeGreaterThan(0);
        fireEvent.keyDown(cardEl(), { key: ' ' });
        expect(screen.getByText('snel')).toBeInTheDocument();
        unmount();

        // plain click on the hidden card also reveals
        render(<FlashcardStudySession deck={deck} initialStates={{}} />);
        fireEvent.click(cardEl());
        expect(screen.getByText('weide')).toBeInTheDocument();
    });
});
