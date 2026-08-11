import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommentableDocumentView from './CommentableDocumentView';
import type { DocumentComment } from '../../types';

const fakeEditor = vi.hoisted(() => ({
    state: { selection: { from: 3, to: 8, empty: false } },
    commands: {
        setDocumentComments: vi.fn(),
        setActiveDocumentComment: vi.fn(),
    },
}));

const mockAddDocumentComment = vi.fn();
const mockResolveDocumentComment = vi.fn();
const mockDeleteDocumentComment = vi.fn();
const mockGetCurrentDatabaseUserId = vi.fn(() => 'user-1');

const mockDocumentComments: DocumentComment[] = [];

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        documentComments: mockDocumentComments,
        addDocumentComment: mockAddDocumentComment,
        resolveDocumentComment: mockResolveDocumentComment,
        deleteDocumentComment: mockDeleteDocumentComment,
        getCurrentDatabaseUserId: mockGetCurrentDatabaseUserId,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./EssayEditor', () => {
    const MockEssayEditor = ({ onEditorReady }: { onEditorReady?: (editor: typeof fakeEditor | null) => void }) => {
        React.useEffect(() => {
            onEditorReady?.(fakeEditor);
            return () => onEditorReady?.(null);
        }, [onEditorReady]);
        return <div data-testid="mock-essay-editor" />;
    };
    return { default: MockEssayEditor };
});

vi.mock('@tiptap/react/menus', () => ({
    BubbleMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./commentDecorations', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./commentDecorations')>();
    return {
        ...actual,
        CommentHighlight: { configure: vi.fn(() => ({ name: 'commentHighlightMock' })) },
    };
});

function makeComment(overrides: Partial<DocumentComment> = {}): DocumentComment {
    return {
        id: 'c1',
        attachmentId: 'att-1',
        authorId: 'user-1',
        text: 'Nice work',
        anchor: { from: 0, to: 5 },
        createdAt: '2024-01-01T00:00:00Z',
        resolved: false,
        ...overrides,
    };
}

describe('CommentableDocumentView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocumentComments.length = 0;
        mockGetCurrentDatabaseUserId.mockReturnValue('user-1');
        fakeEditor.commands.setDocumentComments.mockClear();
        fakeEditor.commands.setActiveDocumentComment.mockClear();
    });

    it('renders the document and pushes only matching comments to the editor', async () => {
        mockDocumentComments.push(
            makeComment({ id: 'c1' }),
            makeComment({ id: 'c2', attachmentId: 'att-other', text: 'Other doc' })
        );
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        await waitFor(() => {
            expect(fakeEditor.commands.setDocumentComments).toHaveBeenCalledWith([
                expect.objectContaining({ id: 'c1' }),
            ]);
        });
        expect(screen.getByTestId('mock-essay-editor')).toBeInTheDocument();
        expect(screen.getByText('Nice work')).toBeInTheDocument();
        expect(screen.queryByText('Other doc')).not.toBeInTheDocument();
    });

    it('shows the empty state when there are no comments for the attachment', async () => {
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);
        await waitFor(() => expect(screen.getByText('attachments.comments_empty')).toBeInTheDocument());
    });

    it('resolves and deletes comments through the app callbacks', async () => {
        mockDocumentComments.push(makeComment({ id: 'c1' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        fireEvent.click(await screen.findByText('attachments.comment_resolve'));
        expect(mockResolveDocumentComment).toHaveBeenCalledWith('c1', true);

        fireEvent.click(screen.getByText('attachments.comment_delete'));
        expect(mockDeleteDocumentComment).toHaveBeenCalledWith('c1');
    });

    it('selecting a sidebar comment activates it in the editor', async () => {
        mockDocumentComments.push(makeComment({ id: 'c1' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        fireEvent.click(await screen.findByText('Nice work'));
        await waitFor(() => {
            expect(fakeEditor.commands.setActiveDocumentComment).toHaveBeenCalledWith('c1');
        });
    });

    it('adds a comment anchored at the current selection after a prompt', async () => {
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  A new comment  ');
        mockDocumentComments.push(makeComment({ id: 'c1' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        fireEvent.click(await screen.findByText('attachments.comment_add'));
        expect(mockAddDocumentComment).toHaveBeenCalledWith({
            attachmentId: 'att-1',
            authorId: 'user-1',
            text: 'A new comment',
            anchor: { from: 3, to: 8 },
        });
        promptSpy.mockRestore();
    });

    it('does not add a comment when the prompt is dismissed or empty', async () => {
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
        mockDocumentComments.push(makeComment({ id: 'c1' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        fireEvent.click(await screen.findByText('attachments.comment_add'));
        expect(mockAddDocumentComment).not.toHaveBeenCalled();
        promptSpy.mockRestore();
    });

    it('attributes comments to the local user when no database user is set', async () => {
        mockGetCurrentDatabaseUserId.mockReturnValue(null as unknown as string);
        const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('local note');
        mockDocumentComments.push(makeComment({ id: 'c1' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        fireEvent.click(await screen.findByText('attachments.comment_add'));
        expect(mockAddDocumentComment).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'local' }));
        promptSpy.mockRestore();
    });
});
