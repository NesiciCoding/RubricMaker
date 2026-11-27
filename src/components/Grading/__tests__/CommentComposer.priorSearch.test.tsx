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
    const input = screen.getByLabelText('gradeStudent.prior_comments_label') as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    return input;
}

function resultsList() {
    return within(screen.getByRole('listbox', { name: 'gradeStudent.prior_comments_label' }));
}

function statusRegion() {
    return screen.getByTestId('prior-comments-status');
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
        expect(statusRegion()).toHaveTextContent('gradeStudent.prior_comments_no_results');
    });

    it('stays quiet until the query is at least two characters', () => {
        renderComposer();
        searchFor('t');
        expect(
            screen.queryByText('The thesis statement is unclear; state the claim up front.')
        ).not.toBeInTheDocument();
        expect(statusRegion()).toBeEmptyDOMElement();
    });
});

describe('CommentComposer prior-comment search accessibility (#533)', () => {
    it('exposes the field as a combobox driving a labelled listbox', () => {
        renderComposer();
        const input = searchFor('');
        expect(input).toHaveAttribute('role', 'combobox');
        expect(input).toHaveAttribute('aria-autocomplete', 'list');
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

        searchFor('thesis');

        const listbox = screen.getByRole('listbox', { name: 'gradeStudent.prior_comments_label' });
        expect(input).toHaveAttribute('aria-expanded', 'true');
        expect(input).toHaveAttribute('aria-controls', listbox.id);
        expect(input).toHaveAttribute('aria-activedescendant', 'prior-comment-option-0');

        const options = within(listbox).getAllByRole('option');
        expect(options).toHaveLength(2);
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
        expect(options[1]).toHaveAttribute('aria-selected', 'false');
        // The arrows reach every option, so the options themselves stay out of the tab order.
        for (const option of options) expect(option).not.toHaveAttribute('tabindex');
    });

    it('moves the active option with the arrow keys and inserts it on Enter', () => {
        const onInsertPriorComment = vi.fn();
        renderComposer({ onInsertPriorComment });
        const input = searchFor('thesis');
        const options = resultsList().getAllByRole('option');

        fireEvent.keyDown(input, { key: 'End' });
        expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
        expect(options[1]).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(input).toHaveAttribute('aria-activedescendant', options[1].id);

        fireEvent.keyDown(input, { key: 'Home' });
        expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onInsertPriorComment).toHaveBeenCalledTimes(1);
        expect(onInsertPriorComment.mock.calls[0][0].text).toBe(options[1].getAttribute('title'));
    });

    it('dismisses the list on Escape and reopens it with an arrow key', () => {
        renderComposer();
        const input = searchFor('thesis');
        expect(screen.getByRole('listbox')).toBeInTheDocument();

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(input).toHaveAttribute('aria-expanded', 'false');
        expect(input).not.toHaveAttribute('aria-activedescendant');
        // Escape hides the list without discarding the query.
        expect(input).toHaveValue('thesis');

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('announces the result count in a polite live region', () => {
        renderComposer();
        expect(statusRegion()).toHaveAttribute('aria-live', 'polite');
        expect(statusRegion()).toHaveAttribute('aria-atomic', 'true');
        expect(statusRegion()).toHaveClass('sr-only');
        expect(statusRegion()).toBeEmptyDOMElement();

        searchFor('thesis');
        expect(statusRegion()).toHaveTextContent('gradeStudent.prior_comments_results');
    });
});
