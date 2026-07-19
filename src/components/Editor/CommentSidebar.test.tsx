import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentSidebar from './CommentSidebar';
import type { DocumentComment } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

const makeComment = (overrides: Partial<DocumentComment> = {}): DocumentComment => ({
    id: 'c1',
    attachmentId: 'a1',
    authorId: 'u1',
    text: 'Nice work',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolved: false,
    anchor: { from: 2, to: 8 },
    ...overrides,
});

describe('CommentSidebar', () => {
    it('shows an empty state when there are no comments', () => {
        render(
            <CommentSidebar
                comments={[]}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={vi.fn()}
                onResolve={vi.fn()}
                onDelete={vi.fn()}
            />
        );
        expect(screen.getByTestId('comment-sidebar-empty')).toBeInTheDocument();
    });

    it('renders comments sorted by anchor position and labels the current user', () => {
        const comments = [
            makeComment({ id: 'later', text: 'Second', anchor: { from: 20, to: 25 }, authorId: 'other' }),
            makeComment({ id: 'earlier', text: 'First', anchor: { from: 1, to: 5 }, authorId: 'u1' }),
        ];
        render(
            <CommentSidebar
                comments={comments}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={vi.fn()}
                onResolve={vi.fn()}
                onDelete={vi.fn()}
            />
        );
        const items = screen.getAllByTestId('comment-item');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('First');
        expect(items[1]).toHaveTextContent('Second');
        expect(items[0]).toHaveTextContent('attachments.comment_author_you');
        expect(items[1]).toHaveTextContent('attachments.comment_author_teacher');
    });

    it('calls onSelect when a comment is clicked', () => {
        const onSelect = vi.fn();
        render(
            <CommentSidebar
                comments={[makeComment()]}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={onSelect}
                onResolve={vi.fn()}
                onDelete={vi.fn()}
            />
        );
        fireEvent.click(screen.getByTestId('comment-item'));
        expect(onSelect).toHaveBeenCalledWith('c1');
    });

    it('is keyboard-accessible: Enter and Space both trigger onSelect', () => {
        const onSelect = vi.fn();
        render(
            <CommentSidebar
                comments={[makeComment()]}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={onSelect}
                onResolve={vi.fn()}
                onDelete={vi.fn()}
            />
        );
        const item = screen.getByTestId('comment-item');
        expect(item).toHaveAttribute('role', 'button');
        expect(item).toHaveAttribute('tabIndex', '0');
        fireEvent.keyDown(item, { key: 'Enter' });
        fireEvent.keyDown(item, { key: ' ' });
        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(onSelect).toHaveBeenCalledWith('c1');
    });

    it('calls onResolve with the toggled state and does not also trigger onSelect', () => {
        const onResolve = vi.fn();
        const onSelect = vi.fn();
        render(
            <CommentSidebar
                comments={[makeComment({ resolved: false })]}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={onSelect}
                onResolve={onResolve}
                onDelete={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('attachments.comment_resolve'));
        expect(onResolve).toHaveBeenCalledWith('c1', true);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('shows "Reopen" for a resolved comment and calls onResolve(false)', () => {
        const onResolve = vi.fn();
        render(
            <CommentSidebar
                comments={[makeComment({ resolved: true })]}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={vi.fn()}
                onResolve={onResolve}
                onDelete={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('attachments.comment_reopen'));
        expect(onResolve).toHaveBeenCalledWith('c1', false);
    });

    it('calls onDelete without triggering onSelect', () => {
        const onDelete = vi.fn();
        const onSelect = vi.fn();
        render(
            <CommentSidebar
                comments={[makeComment()]}
                activeCommentId={null}
                currentUserId="u1"
                onSelect={onSelect}
                onResolve={vi.fn()}
                onDelete={onDelete}
            />
        );
        fireEvent.click(screen.getByText('attachments.comment_delete'));
        expect(onDelete).toHaveBeenCalledWith('c1');
        expect(onSelect).not.toHaveBeenCalled();
    });
});
