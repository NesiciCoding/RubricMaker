import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CommentableDocumentView from './CommentableDocumentView';
import type { DocumentComment, DocumentMark } from '../../types';

const fakeEditor = vi.hoisted(() => ({
    state: {
        selection: { from: 3, to: 8, empty: false },
        doc: { textBetween: () => 'Hello' },
    },
    commands: {
        setDocumentComments: vi.fn(),
        setActiveDocumentComment: vi.fn(),
        setDocumentMarks: vi.fn(),
        setActiveDocumentMarks: vi.fn(),
    },
    on: vi.fn(),
    off: vi.fn(),
}));

const mockCommentHighlightConfig = vi.hoisted(() => ({
    config: null as { onCommentClick?: (id: string) => void } | null,
}));

const mockAddDocumentComment = vi.fn();
const mockResolveDocumentComment = vi.fn();
const mockDeleteDocumentComment = vi.fn();
const mockUpdateDocumentMark = vi.fn();
const mockDeleteDocumentMark = vi.fn();
const mockRestoreDocumentMark = vi.fn();
const mockShowToast = vi.hoisted(() =>
    vi.fn((_message?: string, _type?: string, _options?: { action?: { onClick: () => void } }) => 1)
);
const mockGetCurrentDatabaseUserId = vi.fn(() => 'user-1');

const mockDocumentComments: DocumentComment[] = [];
const mockDocumentMarks: DocumentMark[] = [];

const makeAppValue = () => ({
    documentComments: mockDocumentComments,
    documentMarks: mockDocumentMarks,
    addDocumentComment: mockAddDocumentComment,
    resolveDocumentComment: mockResolveDocumentComment,
    deleteDocumentComment: mockDeleteDocumentComment,
    updateDocumentMark: mockUpdateDocumentMark,
    deleteDocumentMark: mockDeleteDocumentMark,
    restoreDocumentMark: mockRestoreDocumentMark,
    getCurrentDatabaseUserId: mockGetCurrentDatabaseUserId,
});

vi.mock('../../context/AppContext', () => ({
    useApp: () => makeAppValue(),
    useRoster: () => makeAppValue(),
    useAuthoring: () => makeAppValue(),
    useAssessment: () => makeAppValue(),
    useEssays: () => makeAppValue(),
    useFlashcards: () => makeAppValue(),
    useSettings: () => makeAppValue(),
    usePlatform: () => makeAppValue(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast, dismissToast: vi.fn() }),
}));

// jsdom has no layout, so the rail's measurement finds no line boxes. The editor panel is what is
// under test here, so the measured rows are supplied directly.
const mockRailRows = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('./useProofRail', () => ({
    useProofRail: () => ({
        rows: mockRailRows.rows,
        box: { top: 0, left: 0, height: 0 },
        dir: 'ltr',
        remeasure: vi.fn(),
    }),
}));

vi.mock('./EssayEditor', () => {
    const MockEssayEditor = ({
        onEditorReady,
        onChange,
        allowPageMode,
        defaultPageMode,
    }: {
        onEditorReady?: (editor: typeof fakeEditor | null) => void;
        onChange?: (html: string) => void;
        allowPageMode?: boolean;
        defaultPageMode?: boolean;
    }) => {
        React.useEffect(() => {
            onEditorReady?.(fakeEditor);
            // Simulate TipTap emitting an edit so the read-only onChange (noop) runs.
            onChange?.('<p>edited</p>');
            return () => onEditorReady?.(null);
        }, [onEditorReady, onChange]);
        return (
            <div
                data-testid="mock-essay-editor"
                data-allow-page-mode={allowPageMode ? 'true' : 'false'}
                data-page-mode={defaultPageMode ? 'true' : 'false'}
            />
        );
    };
    return { default: MockEssayEditor };
});

const bubbleShouldShowFns = vi.hoisted(() => [] as Array<(p: { state: { selection: { empty: boolean } } }) => boolean>);

vi.mock('@tiptap/react/menus', () => ({
    BubbleMenu: ({
        shouldShow,
        children,
    }: {
        shouldShow: (p: { state: { selection: { empty: boolean } } }) => boolean;
        children: React.ReactNode;
    }) => {
        bubbleShouldShowFns.push(shouldShow);
        return <div>{children}</div>;
    },
}));

vi.mock('./commentDecorations', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./commentDecorations')>();
    return {
        ...actual,
        CommentHighlight: {
            configure: vi.fn((config: { onCommentClick?: (id: string) => void }) => {
                mockCommentHighlightConfig.config = config;
                return { name: 'commentHighlightMock' };
            }),
        },
    };
});

function makeMark(overrides: Partial<DocumentMark> = {}): DocumentMark {
    return {
        id: 'm1',
        attachmentId: 'att-1',
        authorId: 'user-1',
        symbolId: 'sp',
        anchor: { from: 0, to: 5 },
        status: 'noted',
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

function railRowFor(marks: DocumentMark[]) {
    return {
        id: '1',
        center: 10,
        top: 0,
        drift: 0,
        stacked: false,
        overflow: false,
        line: 1,
        ids: marks.map((mark) => mark.id),
        multiLine: false,
        marks,
    };
}

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
        mockDocumentMarks.length = 0;
        mockRailRows.rows = [];
        mockGetCurrentDatabaseUserId.mockReturnValue('user-1');
        fakeEditor.commands.setDocumentComments.mockClear();
        fakeEditor.commands.setActiveDocumentComment.mockClear();
        fakeEditor.commands.setDocumentMarks.mockClear();
        fakeEditor.commands.setActiveDocumentMarks.mockClear();
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

    it('pushes only the marks for this attachment to the editor', async () => {
        render(
            <CommentableDocumentView
                content="<p>Hello</p>"
                attachmentId="att-1"
                marks={[makeMark({ id: 'm1' }), makeMark({ id: 'm2', attachmentId: 'att-other' })]}
            />
        );

        await waitFor(() => {
            expect(fakeEditor.commands.setDocumentMarks).toHaveBeenCalledWith([expect.objectContaining({ id: 'm1' })]);
        });
        expect(fakeEditor.commands.setActiveDocumentMarks).toHaveBeenCalledWith([]);
    });

    it('draws the stored marks for this document when no marks prop is passed', async () => {
        mockDocumentMarks.push(makeMark({ id: 'stored-1' }), makeMark({ id: 'stored-2', attachmentId: 'att-other' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        await waitFor(() => {
            expect(fakeEditor.commands.setDocumentMarks).toHaveBeenCalledWith([
                expect.objectContaining({ id: 'stored-1' }),
            ]);
        });
    });

    it('sends no marks when the document has none', async () => {
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        await waitFor(() => expect(fakeEditor.commands.setDocumentMarks).toHaveBeenCalledWith([]));
    });

    it('switches the editor to page mode when marks arrive for this document', () => {
        const { rerender } = render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);
        const editor = () => screen.getByTestId('mock-essay-editor');

        // The document mounts before its marks load, so it starts compact.
        expect(editor()).toHaveAttribute('data-allow-page-mode', 'false');
        expect(editor()).toHaveAttribute('data-page-mode', 'false');

        // Marks for another attachment do not give this document a margin rail.
        rerender(
            <CommentableDocumentView
                content="<p>Hello</p>"
                attachmentId="att-1"
                marks={[makeMark({ attachmentId: 'att-other' })]}
            />
        );
        expect(editor()).toHaveAttribute('data-page-mode', 'false');

        rerender(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" marks={[makeMark()]} />);
        expect(editor()).toHaveAttribute('data-allow-page-mode', 'true');
        expect(editor()).toHaveAttribute('data-page-mode', 'true');
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

    it('activates a comment when its highlight is clicked in the document', async () => {
        mockDocumentComments.push(makeComment({ id: 'c1' }));
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);
        await waitFor(() => expect(mockCommentHighlightConfig.config).not.toBeNull());

        mockCommentHighlightConfig.config!.onCommentClick?.('c1');
        await waitFor(() => {
            expect(fakeEditor.commands.setActiveDocumentComment).toHaveBeenCalledWith('c1');
        });
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

    it('offers no mark palette while the surface has nowhere to store a mark', async () => {
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        await waitFor(() => expect(screen.getByTestId('mock-essay-editor')).toBeInTheDocument());
        expect(screen.queryByRole('group', { name: 'proofMarks.palette.label' })).not.toBeInTheDocument();
    });

    it('creates a mark from the palette against the current selection', async () => {
        const onCreateMark = vi.fn();
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" onCreateMark={onCreateMark} />);

        fireEvent.click(await screen.findByRole('button', { name: 'proofMarks.ital.label' }));

        expect(onCreateMark).toHaveBeenCalledWith({
            attachmentId: 'att-1',
            authorId: 'user-1',
            symbolId: 'ital',
            anchor: { from: 3, to: 8 },
            snippetHash: expect.any(String),
            status: 'noted',
        });
    });

    it('writes no mark when the selection is empty', async () => {
        const onCreateMark = vi.fn();
        fakeEditor.state.selection = { from: 4, to: 4, empty: true };
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" onCreateMark={onCreateMark} />);

        fireEvent.click(await screen.findByRole('button', { name: 'proofMarks.ital.label' }));

        expect(onCreateMark).not.toHaveBeenCalled();
        fakeEditor.state.selection = { from: 3, to: 8, empty: false };
    });
});

describe('Mark editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocumentMarks.length = 0;
        mockRailRows.rows = [];
    });

    const openEditor = (marks: DocumentMark[]) => {
        mockDocumentMarks.push(...marks);
        mockRailRows.rows = [railRowFor(marks)];
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.rail.chipLabel' }));
    };

    it('opens the mark editor for the rail line a teacher selects', () => {
        openEditor([makeMark()]);

        expect(screen.getByRole('group', { name: 'proofMarks.edit.label' })).toBeInTheDocument();
    });

    it('keeps the mark editor closed until a rail line is selected', () => {
        const stored = makeMark();
        mockDocumentMarks.push(stored);
        mockRailRows.rows = [railRowFor([stored])];
        render(<CommentableDocumentView content="<p>Hello</p>" attachmentId="att-1" />);

        expect(screen.queryByRole('group', { name: 'proofMarks.edit.label' })).not.toBeInTheDocument();
    });

    it('writes an edited note through the store', () => {
        openEditor([makeMark()]);
        const note = screen.getByLabelText('proofMarks.edit.note');

        fireEvent.change(note, { target: { value: 'needs a comma' } });
        fireEvent.blur(note);

        expect(mockUpdateDocumentMark).toHaveBeenCalledWith('m1', { note: 'needs a comma' });
    });

    it('moves the mark to the current selection', () => {
        fakeEditor.state.selection = { from: 9, to: 14, empty: false };
        openEditor([makeMark()]);

        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.edit.moveHere' }));

        expect(mockUpdateDocumentMark).toHaveBeenCalledWith('m1', {
            anchor: { from: 9, to: 14 },
            snippetHash: expect.any(String),
        });
        fakeEditor.state.selection = { from: 3, to: 8, empty: false };
    });

    it('deletes a mark and restores it from the toast action', () => {
        const stored = makeMark();
        openEditor([stored]);

        fireEvent.click(screen.getByRole('button', { name: /proofMarks.edit.delete/ }));
        expect(mockDeleteDocumentMark).toHaveBeenCalledWith('m1');

        act(() => mockShowToast.mock.calls[0]![2]!.action!.onClick());
        expect(mockRestoreDocumentMark).toHaveBeenCalledWith(stored);
    });

    it('closes the editor from its close button', () => {
        openEditor([makeMark()]);

        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.edit.close' }));
        expect(screen.queryByRole('group', { name: 'proofMarks.edit.label' })).not.toBeInTheDocument();
    });
});

describe('BubbleMenu visibility predicate', () => {
    it('runs the shouldShow predicate for both selection states', () => {
        render(<CommentableDocumentView content="<p>hi</p>" attachmentId="att-1" />);
        expect(bubbleShouldShowFns.length).toBeGreaterThan(0);
        for (const fn of bubbleShouldShowFns) {
            expect(fn({ state: { selection: { empty: false } } })).toBe(true);
            expect(fn({ state: { selection: { empty: true } } })).toBe(false);
        }
    });
});
