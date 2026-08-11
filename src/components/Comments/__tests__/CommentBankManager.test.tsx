import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentBankManager from '../CommentBankManager';
import type { CommentBankItem } from '../../../types';

const commentBank: CommentBankItem[] = [
    {
        id: 'c1',
        text: 'Great use of vocabulary.',
        tags: ['EFL', 'B1'],
        createdAt: '2026-01-01T00:00:00.000Z',
        usageCount: 3,
    },
    { id: 'c2', text: 'Needs more detail.', tags: ['Grammar'], createdAt: '2026-01-02T00:00:00.000Z' },
];

const makeAppContextMock = () => ({
    commentBank,
    addCommentBankItem: vi.fn(),
    updateCommentBankItem: vi.fn(),
    deleteCommentBankItem: vi.fn(),
});
vi.mock('../../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: false }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, opts?: { count?: number }) => (opts ? `${key}:${opts.count}` : key) }),
}));

describe('CommentBankManager fullPage sidebar', () => {
    it('lists every tag in the sidebar with its item count, plus an "All comments" row', () => {
        render(<CommentBankManager fullPage />);
        const sidebar = within(screen.getByRole('complementary'));
        expect(sidebar.getByText('commentBank.sidebar_all_comments')).toBeInTheDocument();
        expect(sidebar.getByText('EFL')).toBeInTheDocument();
        expect(sidebar.getByText('B1')).toBeInTheDocument();
        expect(sidebar.getByText('Grammar')).toBeInTheDocument();
    });

    it('filters the list when a sidebar tag is clicked', () => {
        render(<CommentBankManager fullPage />);
        expect(screen.getByText('Great use of vocabulary.')).toBeInTheDocument();
        expect(screen.getByText('Needs more detail.')).toBeInTheDocument();

        fireEvent.click(within(screen.getByRole('complementary')).getByText('Grammar'));

        expect(screen.queryByText('Great use of vocabulary.')).not.toBeInTheDocument();
        expect(screen.getByText('Needs more detail.')).toBeInTheDocument();
    });

    it('shows a CEFR badge plus the plain tag chip for an item tagged with a CEFR level', () => {
        render(<CommentBankManager fullPage />);
        const card = screen.getByText('Great use of vocabulary.').closest('.card');
        expect(card).not.toBeNull();
        // One "B1" is the CefrBadge, the other is the item's plain tag chip below it.
        expect(within(card as HTMLElement).getAllByText('B1')).toHaveLength(2);
    });

    it('shows the usage count on a card that has been used', () => {
        render(<CommentBankManager fullPage />);
        expect(screen.getByText('commentBank.usage_count_label:3')).toBeInTheDocument();
    });

    it('does not render the sort toggle or sidebar in compact (non-fullPage) mode', () => {
        render(<CommentBankManager />);
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
        expect(screen.queryByText('commentBank.sort_most_used')).not.toBeInTheDocument();
    });

    it('clicking a card with onSelect passes the full CommentBankItem, not just its text', () => {
        const onSelect = vi.fn();
        render(<CommentBankManager onSelect={onSelect} />);
        fireEvent.click(screen.getByText('Great use of vocabulary.'));
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1', text: 'Great use of vocabulary.', tags: ['EFL', 'B1'] })
        );
    });

    it('"Most used" sort reorders cards by descending usageCount', () => {
        const { container } = render(<CommentBankManager fullPage />);
        // Newest-first (default): c2 (2026-01-02) was created after c1 (2026-01-01).
        expect(container.textContent!.indexOf('Needs more detail.')).toBeLessThan(
            container.textContent!.indexOf('Great use of vocabulary.')
        );

        fireEvent.click(screen.getByText('commentBank.sort_most_used'));

        // Most-used-first: c1 has usageCount 3, c2 has none (treated as 0).
        expect(container.textContent!.indexOf('Great use of vocabulary.')).toBeLessThan(
            container.textContent!.indexOf('Needs more detail.')
        );
    });
});
