import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';

const addFlashcardDeck = vi.fn(() => ({ id: 'new-deck', name: 'Pre-teaching: >A2' }));

const ctx = {
    rubrics: [],
    students: [],
    classes: [],
    analysisResults: [],
    studentRubrics: [],
    settings: { language: 'en' },
    updateSettings: vi.fn(),
    flashcardDecks: [
        { id: 'd1', name: 'Travel words', createdAt: '2026-01-01', cards: [{ id: 'c1', front: 'a', back: 'b' }] },
    ],
    flashcardAssignments: [
        { deckId: 'd1', studentId: 's1', deckName: 'Travel words', cardCount: 1, createdAt: '2026-01-01' },
    ],
    flashcardReviews: [],
    addFlashcardDeck,
};

vi.mock('../../context/AppContext', () => ({
    useStudents: () => ctx,
    useClasses: () => ctx,
    useAuthoring: () => ctx,
    useAssessment: () => ctx,
    useFlashcards: () => ctx,
    useRoster: () => ctx,
    useGrading: () => ctx,
    useSettings: () => ({ ...ctx, settings: { language: 'en' }, updateSettings: vi.fn() }),
    usePlatform: () => ctx,
    useEssays: () => ctx,
}));

vi.mock('../../services/wordLookup', () => ({
    translationTarget: () => null,
    lookupManyWordDetails: async (words: string[]) =>
        words.map(() => ({
            definition: 'a def',
            phonetic: null,
            partOfSpeech: 'noun',
            example: null,
            translation: null,
        })),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const HARD_TEXT =
    'The phenomenon of globalisation has fundamentally transformed contemporary economic structures. ' +
    'Significant disparities in wealth distribution persist despite unprecedented technological advancement.';

describe('VocabularyDashboardPage hub views', () => {
    it('shows cross-deck flashcard progress on the flashcards view', async () => {
        const { default: Page } = await import('../VocabularyDashboardPage');
        renderWithRouter(<Page />);
        fireEvent.click(screen.getByRole('button', { name: 'vocabProfile.view_flashcards' }));
        expect(screen.getByText('vocabProfile.fc_title')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Travel words' })).toBeInTheDocument();
    });

    it('screens pasted text against a target level and seeds a deck from above-target words', async () => {
        const { default: Page } = await import('../VocabularyDashboardPage');
        renderWithRouter(<Page />);
        fireEvent.click(screen.getByRole('button', { name: 'vocabProfile.view_screen' }));
        expect(screen.getByText('vocabProfile.screen_empty')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'vocabProfile.wordnet_get' })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('vocabProfile.screen_text_label'), { target: { value: HARD_TEXT } });
        fireEvent.change(screen.getByLabelText('vocabProfile.target_level_label'), { target: { value: 'A2' } });
        expect(screen.getByText('analysis.above_target')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /vocabProfile.seed_deck$/ }));
        await waitFor(() =>
            expect(addFlashcardDeck).toHaveBeenCalledWith(
                expect.objectContaining({
                    deckKind: 'vocabulary',
                    cards: expect.arrayContaining([expect.objectContaining({ back: 'a def', partOfSpeech: 'noun' })]),
                })
            )
        );
    });
});
