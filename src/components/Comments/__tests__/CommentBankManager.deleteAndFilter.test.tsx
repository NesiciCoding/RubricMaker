import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommentBankManager from '../CommentBankManager';
import type { CommentBankItem } from '../../../types';

const commentBank: CommentBankItem[] = [
    {
        id: 'c1',
        text: 'Great use of B1 grammar.',
        tags: ['B1', 'Grammar'],
        createdAt: '2026-01-01T00:00:00.000Z',
        usageCount: 3,
        sharedWithSchool: true,
    },
    { id: 'c2', text: 'Check your verb tenses.', tags: ['Grammar'], createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c3', text: 'Good B1 vocabulary.', tags: ['B1'], createdAt: '2026-01-03T00:00:00.000Z' },
];

const bank = vi.hoisted(() => ({ items: [] as CommentBankItem[] }));
const mocks = vi.hoisted(() => ({
    deleteCommentBankItem: vi.fn(),
    restoreCommentBankItem: vi.fn(),
    showToast: vi.fn(),
}));

vi.mock('../../../context/AppContext', () => ({
    useAuthoring: () => ({
        commentBank: bank.items,
        addCommentBankItem: vi.fn(),
        updateCommentBankItem: vi.fn(),
        deleteCommentBankItem: mocks.deleteCommentBankItem,
        restoreCommentBankItem: mocks.restoreCommentBankItem,
    }),
}));
vi.mock('../../../hooks/useDbStatus', () => ({ useDbStatus: () => ({ isConnected: false }) }));
vi.mock('../../../hooks/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, opts?: { count?: number }) => (opts ? `${key}:${opts.count}` : key) }),
}));

describe('CommentBankManager delete undo and tag filter (#686)', () => {
    beforeEach(() => {
        Object.values(mocks).forEach((m) => m.mockClear());
        bank.items = commentBank;
    });

    it('deletes a comment with an Undo toast that restores the original item', () => {
        render(<CommentBankManager fullPage />);
        const card = screen.getByText('Great use of B1 grammar.').closest('.card') as HTMLElement;
        fireEvent.click(within(card).getByLabelText('common.delete'));
        expect(mocks.deleteCommentBankItem).toHaveBeenCalledWith('c1');
        const [message, type, options] = mocks.showToast.mock.calls[0];
        expect([message, type, options.action.label]).toEqual(['commentBank.deleted_toast', 'info', 'common.undo']);
        act(() => options.action.onClick());
        expect(mocks.restoreCommentBankItem).toHaveBeenCalledWith(commentBank[0]);
    });

    it('narrows the list to comments carrying every selected tag', () => {
        render(<CommentBankManager fullPage />);
        const sidebar = within(screen.getByRole('complementary'));
        fireEvent.click(sidebar.getByText('B1'));
        fireEvent.click(sidebar.getByText('Grammar'));
        expect(screen.getByText('Great use of B1 grammar.')).toBeInTheDocument();
        expect(screen.queryByText('Check your verb tenses.')).not.toBeInTheDocument();
        expect(screen.queryByText('Good B1 vocabulary.')).not.toBeInTheDocument();
        expect(screen.getByText('commentBank.filter_all_tags_hint:2')).toBeInTheDocument();
        expect(sidebar.getByText('B1').closest('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('applies the same narrowing to the compact tag chips', () => {
        render(<CommentBankManager />);
        fireEvent.click(screen.getByRole('button', { name: 'B1' }));
        fireEvent.click(screen.getByRole('button', { name: 'Grammar' }));
        expect(screen.getByText('Great use of B1 grammar.')).toBeInTheDocument();
        expect(screen.queryByText('Good B1 vocabulary.')).not.toBeInTheDocument();
    });

    it('stops filtering by a tag once its last comment is gone, since its chip disappears too', () => {
        const { rerender } = render(<CommentBankManager />);
        fireEvent.click(screen.getByRole('button', { name: 'Grammar' }));
        expect(screen.queryByText('Good B1 vocabulary.')).not.toBeInTheDocument();
        bank.items = commentBank.filter((item) => !item.tags.includes('Grammar'));
        rerender(<CommentBankManager />);
        expect(screen.queryByRole('button', { name: 'Grammar' })).not.toBeInTheDocument();
        expect(screen.getByText('Good B1 vocabulary.')).toBeInTheDocument();
    });
});
