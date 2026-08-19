import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    {
        id: 'c3',
        text: 'Shared with school.',
        tags: ['Grammar'],
        createdAt: '2026-01-03T00:00:00.000Z',
        sharedWithSchool: true,
    },
];

const sharedItem: CommentBankItem = {
    id: 's1',
    text: 'Department comment.',
    tags: ['EFL'],
    createdAt: '2026-01-04T00:00:00.000Z',
    usageCount: 2,
};

const { mockFetchSchoolShared, mockDbStatus } = vi.hoisted(() => ({
    mockFetchSchoolShared: vi.fn(),
    mockDbStatus: { isConnected: false },
}));

const mockAddCommentBankItem = vi.fn();
const mockUpdateCommentBankItem = vi.fn();
const mockDeleteCommentBankItem = vi.fn();

vi.mock('../../../context/AppContext', () => ({
    useRoster: () => ({}),
    useStudents: () => ({}),
    useClasses: () => ({}),
    useGrading: () => ({}),
    useAuthoring: () => ({
        commentBank,
        addCommentBankItem: mockAddCommentBankItem,
        updateCommentBankItem: mockUpdateCommentBankItem,
        deleteCommentBankItem: mockDeleteCommentBankItem,
    }),
    useAssessment: () => ({}),
    useEssays: () => ({}),
    useFlashcards: () => ({}),
    useSettings: () => ({}),
    usePlatform: () => ({}),
}));

vi.mock('../../../hooks/useDbStatus', () => ({
    useDbStatus: () => mockDbStatus,
}));

vi.mock('../../../services/database', () => ({
    storageSync: { adapter: { fetchSchoolSharedCommentBank: mockFetchSchoolShared } },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, opts?: { count?: number }) => (opts ? `${key}:${opts.count}` : key) }),
}));

describe('CommentBankManager coverage', () => {
    beforeEach(() => {
        mockDbStatus.isConnected = false;
        mockFetchSchoolShared.mockReset();
        mockAddCommentBankItem.mockClear();
        mockUpdateCommentBankItem.mockClear();
        mockDeleteCommentBankItem.mockClear();
    });

    it('loads school-shared items when connected and shows the department badge', async () => {
        mockDbStatus.isConnected = true;
        mockFetchSchoolShared.mockResolvedValue([sharedItem]);
        render(<CommentBankManager />);
        expect(await screen.findByText('Department comment.')).toBeInTheDocument();
        expect(screen.getByText('rubricList.department_badge')).toBeInTheDocument();
        expect(mockFetchSchoolShared).toHaveBeenCalledTimes(1);
    });

    it('cancels the fetch result when the component unmounts first', () => {
        mockDbStatus.isConnected = true;
        let resolveFetch: (items: CommentBankItem[]) => void = () => undefined;
        mockFetchSchoolShared.mockReturnValue(
            new Promise<CommentBankItem[]>((resolve) => {
                resolveFetch = resolve;
            })
        );
        const { unmount } = render(<CommentBankManager />);
        unmount();
        resolveFetch([sharedItem]);
        // No state update warning, and nothing to assert beyond the cleanup running.
        expect(mockFetchSchoolShared).toHaveBeenCalledTimes(1);
    });

    it('searches by tag when the text does not match', () => {
        render(<CommentBankManager />);
        fireEvent.change(screen.getByPlaceholderText('commentBank.search_placeholder'), { target: { value: 'EFL' } });
        expect(screen.getByText('Great use of vocabulary.')).toBeInTheDocument();
        expect(screen.queryByText('Needs more detail.')).not.toBeInTheDocument();
    });

    it('shows the empty state when nothing matches', () => {
        render(<CommentBankManager />);
        fireEvent.change(screen.getByPlaceholderText('commentBank.search_placeholder'), { target: { value: 'zzz' } });
        expect(screen.getByText('commentBank.empty_state')).toBeInTheDocument();
        expect(screen.queryByText('Great use of vocabulary.')).not.toBeInTheDocument();
    });

    it('surfaces suggested items for matching tags without hiding the main list', () => {
        render(<CommentBankManager suggestedTags={['B1']} />);
        expect(screen.getByText('commentBank.suggested_for_criterion')).toBeInTheDocument();
        // c1 matches the suggestion and still appears in the main list below.
        expect(screen.getAllByText('Great use of vocabulary.')).toHaveLength(2);
    });

    it('creates a new item from the form', () => {
        render(<CommentBankManager />);
        fireEvent.click(screen.getByText('commentBank.new_button'));
        fireEvent.change(screen.getByPlaceholderText('commentBank.form_placeholder'), {
            target: { value: 'New comment' },
        });
        fireEvent.change(screen.getByPlaceholderText('commentBank.tags_placeholder'), {
            target: { value: 'Grammar, B1, , spaced ' },
        });
        fireEvent.click(screen.getByText('common.save'));
        expect(mockAddCommentBankItem).toHaveBeenCalledWith('New comment', ['Grammar', 'B1', 'spaced']);
        // The editor closes after saving.
        expect(screen.queryByPlaceholderText('commentBank.form_placeholder')).not.toBeInTheDocument();
    });

    it('cancels creating without saving', () => {
        render(<CommentBankManager />);
        fireEvent.click(screen.getByText('commentBank.new_button'));
        fireEvent.change(screen.getByPlaceholderText('commentBank.form_placeholder'), { target: { value: 'Draft' } });
        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockAddCommentBankItem).not.toHaveBeenCalled();
        expect(screen.queryByPlaceholderText('commentBank.form_placeholder')).not.toBeInTheDocument();
    });

    it('edits an existing item and saves the update', () => {
        render(<CommentBankManager />);
        const card = screen.getByText('Great use of vocabulary.').closest('.card') as HTMLElement;
        fireEvent.click(within(card).getByLabelText('common.edit'));
        // The edited card gets the accent border.
        expect(card.style.border).toContain('var(--accent)');
        const textarea = screen.getByPlaceholderText('commentBank.form_placeholder');
        expect(textarea).toHaveValue('Great use of vocabulary.');
        fireEvent.change(textarea, { target: { value: 'Updated comment' } });
        fireEvent.click(screen.getByText('common.save'));
        expect(mockUpdateCommentBankItem).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1', text: 'Updated comment', tags: ['EFL', 'B1'] })
        );
        expect(screen.queryByPlaceholderText('commentBank.form_placeholder')).not.toBeInTheDocument();
    });

    it('deletes an item', () => {
        render(<CommentBankManager />);
        const card = screen.getByText('Needs more detail.').closest('.card') as HTMLElement;
        fireEvent.click(within(card).getByLabelText('common.delete'));
        expect(mockDeleteCommentBankItem).toHaveBeenCalledWith('c2');
    });

    it('toggles the school-share flag in both directions', () => {
        render(<CommentBankManager />);
        const c1Card = screen.getByText('Great use of vocabulary.').closest('.card') as HTMLElement;
        fireEvent.click(within(c1Card).getByLabelText('rubricList.share_with_department'));
        expect(mockUpdateCommentBankItem).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1', sharedWithSchool: true })
        );
        const c3Card = screen.getByText('Shared with school.').closest('.card') as HTMLElement;
        fireEvent.click(within(c3Card).getByLabelText('rubricList.share_with_department'));
        expect(mockUpdateCommentBankItem).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c3', sharedWithSchool: false })
        );
    });

    it('selects via Enter, Space, and ignores other keys', () => {
        const onSelect = vi.fn();
        render(<CommentBankManager onSelect={onSelect} />);
        const c1Card = screen.getByText('Great use of vocabulary.').closest('.card') as HTMLElement;
        const c2Card = screen.getByText('Needs more detail.').closest('.card') as HTMLElement;
        fireEvent.keyDown(c1Card, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
        fireEvent.keyDown(c2Card, { key: ' ' });
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
        fireEvent.keyDown(c1Card, { key: 'a' });
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it('ignores keyboard selection when onSelect is absent', () => {
        render(<CommentBankManager />);
        const c1Card = screen.getByText('Great use of vocabulary.').closest('.card') as HTMLElement;
        fireEvent.keyDown(c1Card, { key: 'Enter' });
        expect(screen.getByText('Great use of vocabulary.')).toBeInTheDocument();
    });

    it('toggles a sidebar tag filter off and resets via All comments', () => {
        render(<CommentBankManager fullPage />);
        const sidebar = within(screen.getByRole('complementary'));
        fireEvent.click(sidebar.getByText('Grammar'));
        expect(screen.queryByText('Great use of vocabulary.')).not.toBeInTheDocument();
        // Toggle off → everything visible again.
        fireEvent.click(sidebar.getByText('Grammar'));
        expect(screen.getByText('Great use of vocabulary.')).toBeInTheDocument();
        // Filter again, then reset through "All comments".
        fireEvent.click(sidebar.getByText('EFL'));
        expect(screen.queryByText('Needs more detail.')).not.toBeInTheDocument();
        fireEvent.click(sidebar.getByText('commentBank.sidebar_all_comments'));
        expect(screen.getByText('Needs more detail.')).toBeInTheDocument();
    });

    it('sorts back to newest via the toggle', () => {
        const { container } = render(<CommentBankManager fullPage />);
        fireEvent.click(screen.getByText('commentBank.sort_most_used'));
        fireEvent.click(screen.getByText('commentBank.sort_newest'));
        expect(container.textContent!.indexOf('Needs more detail.')).toBeLessThan(
            container.textContent!.indexOf('Great use of vocabulary.')
        );
    });

    it('filters through the compact tag chips with toggle-off', () => {
        render(<CommentBankManager />);
        fireEvent.click(screen.getByRole('button', { name: 'Grammar' }));
        expect(screen.queryByText('Great use of vocabulary.')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Grammar' }));
        expect(screen.getByText('Great use of vocabulary.')).toBeInTheDocument();
    });
});
