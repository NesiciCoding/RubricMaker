import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentComposer from '../CommentComposer';
import type { CommentBankItem } from '../../../types';
import type { PriorCommentSource } from '../../../utils/commentRecall';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const bank: CommentBankItem[] = [
    { id: 'b1', text: 'Thesis statement needs a clearer claim.', tags: ['writing'], createdAt: '2024-01-01' },
];

const pastFeedback: PriorCommentSource[] = [
    {
        id: 'f1',
        text: 'The thesis statement is unclear; state the claim up front.',
        source: 'feedback',
        label: 'Amara',
    },
];

function renderComposer(overrides: Partial<React.ComponentProps<typeof CommentComposer>> = {}) {
    const props: React.ComponentProps<typeof CommentComposer> = {
        value: '',
        onChange: vi.fn(),
        editorRef: null,
        commentBank: bank,
        pastFeedback,
        onInsertChip: vi.fn(),
        onInsertPriorComment: vi.fn(),
        onBrowseAll: vi.fn(),
        audioRecording: false,
        onStartAudio: vi.fn(),
        onStopAudio: vi.fn(),
        onRemoveAudio: vi.fn(),
        ...overrides,
    };
    return render(<CommentComposer {...props} />);
}

function searchFor(value: string) {
    fireEvent.change(screen.getByLabelText('gradeStudent.prior_comments_label'), { target: { value } });
}

function resultsList() {
    return within(screen.getByRole('list', { name: 'gradeStudent.prior_comments_label' }));
}

describe('CommentComposer prior-comment search', () => {
    it("finds the teacher's past comments without a database connection", () => {
        renderComposer();
        searchFor('thesis');

        expect(
            resultsList().getByText('The thesis statement is unclear; state the claim up front.')
        ).toBeInTheDocument();
        expect(resultsList().getByText('Thesis statement needs a clearer claim.')).toBeInTheDocument();
    });

    it('tolerates a typo and inserts the chosen comment', () => {
        const onInsertPriorComment = vi.fn();
        renderComposer({ onInsertPriorComment });
        searchFor('thesiss statement');

        fireEvent.click(resultsList().getByText('Thesis statement needs a clearer claim.'));
        expect(onInsertPriorComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', source: 'bank' }));
    });

    it('shows the student badge for feedback and the tags for a bank snippet', () => {
        renderComposer();
        searchFor('thesis');
        expect(resultsList().getByText('Amara')).toBeInTheDocument();
        expect(resultsList().getByText('writing')).toBeInTheDocument();
    });

    it('reports when nothing similar exists', () => {
        renderComposer();
        searchFor('photosynthesis');
        expect(screen.getByText('gradeStudent.prior_comments_empty')).toBeInTheDocument();
    });

    it('stays quiet until the query is at least two characters', () => {
        renderComposer();
        searchFor('t');
        expect(
            screen.queryByText('The thesis statement is unclear; state the claim up front.')
        ).not.toBeInTheDocument();
    });
});
