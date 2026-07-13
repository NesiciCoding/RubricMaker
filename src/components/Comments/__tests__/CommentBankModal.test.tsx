import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentBankModal from '../CommentBankModal';
import type { CommentBankItem } from '../../../types';

const commentBank: CommentBankItem[] = [
    { id: 'c1', text: 'Great use of vocabulary.', tags: ['EFL', 'Vocabulary'], createdAt: '2026-01-01T00:00:00.000Z' },
    {
        id: 'c2',
        text: 'Great turn-taking today.',
        tags: ['speaking_interaction', 'B1'],
        createdAt: '2026-01-02T00:00:00.000Z',
    },
];

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        commentBank,
        addCommentBankItem: vi.fn(),
        updateCommentBankItem: vi.fn(),
        deleteCommentBankItem: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CommentBankModal suggested group', () => {
    it('shows no "Suggested" heading when suggestedTags is absent', () => {
        render(<CommentBankModal onClose={() => {}} />);
        expect(screen.queryByText('commentBank.suggested_for_criterion')).toBeNull();
    });

    it('shows a "Suggested" heading with the matching item when a criterion tag matches', () => {
        render(<CommentBankModal onClose={() => {}} suggestedTags={['speaking_interaction', 'B1']} />);
        expect(screen.getByText('commentBank.suggested_for_criterion')).toBeInTheDocument();
        // The matching item is echoed (additive, not filtering) — appears twice: once in the
        // suggested group, once in the regular list below.
        expect(screen.getAllByText('Great turn-taking today.').length).toBe(2);
        expect(screen.getAllByText('Great use of vocabulary.').length).toBe(1);
    });

    it('does not show the heading when suggestedTags matches nothing', () => {
        render(<CommentBankModal onClose={() => {}} suggestedTags={['reading', 'C2']} />);
        expect(screen.queryByText('commentBank.suggested_for_criterion')).toBeNull();
    });
});
