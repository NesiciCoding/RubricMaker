import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBankManager from '../QuestionBankManager';
import type { QuestionBankItem } from '../../../types';

const questionBank: QuestionBankItem[] = [
    {
        id: 'q1',
        question: { id: 'src1', prompt: 'What is 2 + 2?', type: 'short-answer', points: 1 },
        tags: ['math', 'easy'],
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'q2',
        question: { id: 'src2', prompt: 'Name a primary color.', type: 'multiple-choice', points: 2 },
        tags: ['art'],
        createdAt: '2026-01-02T00:00:00.000Z',
    },
];

const updateQuestionBankItem = vi.fn();
const deleteQuestionBankItem = vi.fn();

vi.mock('../../../context/AppContext', () => ({
    useApp: () => ({
        questionBank,
        updateQuestionBankItem,
        deleteQuestionBankItem,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

describe('QuestionBankManager', () => {
    it('lists all bank items by default', () => {
        render(<QuestionBankManager />);
        expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
    });

    it('filters by search term across prompt and tags', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'primary' },
        });
        expect(screen.queryByText('What is 2 + 2?')).toBeNull();
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
    });

    it('filters by tag chip toggle', () => {
        render(<QuestionBankManager />);
        const mathChip = screen.getByRole('button', { name: 'math' });
        fireEvent.click(mathChip);
        expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
        expect(screen.queryByText('Name a primary color.')).toBeNull();
        // toggling off restores both
        fireEvent.click(mathChip);
        expect(screen.getByText('Name a primary color.')).toBeInTheDocument();
    });

    it('deletes an item', () => {
        render(<QuestionBankManager />);
        // List is sorted newest first, so index 0 is q2.
        fireEvent.click(screen.getAllByLabelText('common.delete')[0]);
        expect(deleteQuestionBankItem).toHaveBeenCalledWith('q2');
    });

    it('edits and saves tags', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByText('questionBank.edit_tags')[0]);
        const input = screen.getByPlaceholderText('commentBank.tags_placeholder');
        fireEvent.change(input, { target: { value: 'art, revised' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(updateQuestionBankItem).toHaveBeenCalledWith({ ...questionBank[1], tags: ['art', 'revised'] });
    });

    it('cancels a tag edit', () => {
        render(<QuestionBankManager />);
        fireEvent.click(screen.getAllByText('questionBank.edit_tags')[0]);
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByPlaceholderText('commentBank.tags_placeholder')).toBeNull();
    });

    it('renders as a pick target and calls onSelect', () => {
        const onSelect = vi.fn();
        render(<QuestionBankManager onSelect={onSelect} />);
        fireEvent.click(screen.getByText('What is 2 + 2?'));
        expect(onSelect).toHaveBeenCalledWith(questionBank[0]);
    });

    it('shows the empty state when the bank has no matches', () => {
        render(<QuestionBankManager />);
        fireEvent.change(screen.getByPlaceholderText('questionBank.search_placeholder'), {
            target: { value: 'nothing matches this' },
        });
        expect(screen.getByText('questionBank.empty_state')).toBeInTheDocument();
    });
});
