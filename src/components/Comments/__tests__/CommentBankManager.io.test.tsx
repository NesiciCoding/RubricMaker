import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAs } from 'file-saver';
import CommentBankManager from '../CommentBankManager';
import type { CommentBankItem } from '../../../types';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

vi.mock('../../../hooks/useDbStatus', () => ({ useDbStatus: () => ({ isConnected: false }) }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

const addCommentBankItem = vi.fn();
const updateCommentBankItem = vi.fn();
const deleteCommentBankItem = vi.fn();
const restoreCommentBankItem = vi.fn();
let commentBank: CommentBankItem[];

vi.mock('../../../context/AppContext', () => ({
    useAuthoring: () => ({
        commentBank,
        addCommentBankItem,
        updateCommentBankItem,
        deleteCommentBankItem,
        restoreCommentBankItem,
    }),
}));

beforeEach(() => {
    commentBank = [
        {
            id: 'c1',
            text: 'Clear thesis statement',
            tags: ['b2'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ];
    vi.mocked(saveAs).mockClear();
    addCommentBankItem.mockClear();
});

describe('CommentBankManager bank import/export', () => {
    it('exports the bank as JSON', () => {
        render(<CommentBankManager fullPage />);

        fireEvent.click(screen.getByRole('button', { name: /commentBank\.export_button/ }));

        expect(saveAs).toHaveBeenCalledTimes(1);
        expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('comment-bank-export.json');
    });

    it('imports every comment from the chosen file', async () => {
        render(<CommentBankManager fullPage />);

        const file = {
            text: async () =>
                JSON.stringify({
                    items: [
                        { text: 'Strong opening', tags: ['b2', 'writing'] },
                        { text: 'Watch your tenses', tags: [] },
                    ],
                }),
        } as unknown as File;

        fireEvent.change(screen.getByLabelText('commentBank.import_button'), { target: { files: [file] } });

        await waitFor(() => expect(addCommentBankItem).toHaveBeenCalledTimes(2));
        expect(addCommentBankItem).toHaveBeenCalledWith('Strong opening', ['b2', 'writing']);
        expect(addCommentBankItem).toHaveBeenCalledWith('Watch your tenses', []);
    });

    it('adds nothing when the file has no usable comments', async () => {
        render(<CommentBankManager fullPage />);

        const file = { text: async () => JSON.stringify({ items: [] }) } as unknown as File;
        fireEvent.change(screen.getByLabelText('commentBank.import_button'), { target: { files: [file] } });

        await waitFor(() => expect(screen.queryByText(/commentBank\.import_success_toast/)).not.toBeInTheDocument());
        expect(addCommentBankItem).not.toHaveBeenCalled();
    });
});
