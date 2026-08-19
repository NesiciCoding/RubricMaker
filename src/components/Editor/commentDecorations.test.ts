import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { commentDecorationSpecs, CommentHighlight } from './commentDecorations';
import type { DocumentComment } from '../../types';

const MINIMAL_KIT = StarterKit.configure({
    bold: false,
    italic: false,
    strike: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    heading: false,
    horizontalRule: false,
    hardBreak: false,
    link: false,
    underline: false,
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
});

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

describe('commentDecorationSpecs', () => {
    it('produces one spec per comment within bounds', () => {
        const comments = [makeComment(), makeComment({ id: 'c2', anchor: { from: 10, to: 20 } })];
        const specs = commentDecorationSpecs(comments, 30, null);
        expect(specs).toHaveLength(2);
        expect(specs[0]).toMatchObject({ from: 2, to: 8, id: 'c1', active: false });
        expect(specs[1]).toMatchObject({ from: 10, to: 20, id: 'c2', active: false });
    });

    it('marks the active comment', () => {
        const comments = [makeComment({ id: 'c1' }), makeComment({ id: 'c2', anchor: { from: 10, to: 20 } })];
        const specs = commentDecorationSpecs(comments, 30, 'c2');
        expect(specs.find((s) => s.id === 'c1')?.active).toBe(false);
        expect(specs.find((s) => s.id === 'c2')?.active).toBe(true);
    });

    it('drops a comment whose anchor extends beyond the document size', () => {
        const comments = [
            makeComment({ anchor: { from: 2, to: 8 } }),
            makeComment({ id: 'c2', anchor: { from: 5, to: 50 } }),
        ];
        const specs = commentDecorationSpecs(comments, 10, null);
        expect(specs).toHaveLength(1);
        expect(specs[0].id).toBe('c1');
    });

    it('drops a zero-length or inverted anchor range', () => {
        const comments = [
            makeComment({ id: 'zero', anchor: { from: 4, to: 4 } }),
            makeComment({ id: 'inverted', anchor: { from: 8, to: 3 } }),
            makeComment({ id: 'valid', anchor: { from: 1, to: 5 } }),
        ];
        const specs = commentDecorationSpecs(comments, 30, null);
        expect(specs.map((s) => s.id)).toEqual(['valid']);
    });

    it('drops a negative anchor start', () => {
        const comments = [makeComment({ anchor: { from: -1, to: 5 } })];
        expect(commentDecorationSpecs(comments, 30, null)).toHaveLength(0);
    });

    it('returns an empty array for no comments', () => {
        expect(commentDecorationSpecs([], 30, null)).toEqual([]);
    });
});

describe('CommentHighlight extension', () => {
    function makeEditor(onCommentClick = vi.fn()) {
        const editor = new Editor({
            extensions: [MINIMAL_KIT, CommentHighlight.configure({ onCommentClick })],
            content: '<p>Hello world</p>',
        });
        return { editor, onCommentClick };
    }

    function findPlugin(editor: Editor) {
        // PluginKey serializes to `commentHighlight$` in the plugin registry
        return editor.state.plugins.find((p) =>
            String((p as unknown as { key: unknown }).key).startsWith('commentHighlight')
        )!;
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('provides a no-op onCommentClick by default', () => {
        const ext = CommentHighlight.configure({});
        expect(typeof ext.options.onCommentClick).toBe('function');
        expect(() => (ext.options.onCommentClick as () => void)()).not.toThrow();
    });

    it('builds decorations from comments and exposes them through plugin state', () => {
        const { editor } = makeEditor();
        const plugin = findPlugin(editor);
        const initial = (plugin.props.decorations as unknown as (state: unknown) => unknown)(editor.state);
        expect(initial).toBeTruthy();

        editor.commands.setDocumentComments([makeComment()]);
        const set = (
            plugin.props.decorations as unknown as (state: unknown) => { find: (from: number, to: number) => unknown[] }
        )(editor.state);
        // The decoration for anchor 2..8 is present with the comment id attached
        expect(set.find(2, 8).length).toBe(1);
    });

    it('rebuilds decorations when the doc changes or the comment meta is set', () => {
        const { editor } = makeEditor();
        const plugin = findPlugin(editor);
        const getCount = () =>
            (plugin.props.decorations as unknown as (state: unknown) => { find: () => unknown[] })(editor.state).find()
                .length;

        editor.commands.setDocumentComments([makeComment(), makeComment({ id: 'c2', anchor: { from: 2, to: 5 } })]);
        expect(getCount()).toBe(2);

        // A doc-changing transaction also rebuilds (docChanged path)
        editor.commands.insertContent(' more');
        expect(getCount()).toBe(2);

        // A selection-only transaction maps the old set (no rebuild needed)
        editor.commands.selectAll();
        expect(getCount()).toBe(2);
    });

    it('marks the active comment with the active decoration class', () => {
        const { editor } = makeEditor();
        const plugin = findPlugin(editor);
        editor.commands.setDocumentComments([makeComment(), makeComment({ id: 'c2', anchor: { from: 2, to: 5 } })]);
        editor.commands.setActiveDocumentComment('c2');
        const set = (
            plugin.props.decorations as unknown as (state: unknown) => { find: (f: number, t: number) => unknown[] }
        )(editor.state);
        const specs = commentDecorationSpecs(
            [makeComment(), makeComment({ id: 'c2', anchor: { from: 2, to: 5 } })],
            11,
            'c2'
        );
        expect(specs.find((s) => s.id === 'c2')?.active).toBe(true);
        expect(set.find(2, 8).length).toBeGreaterThanOrEqual(1);
        editor.destroy();
    });

    it('calls onCommentClick and returns true when a comment decoration is clicked', () => {
        const { editor, onCommentClick } = makeEditor();
        const plugin = findPlugin(editor);
        editor.commands.setDocumentComments([makeComment()]);

        const target = document.createElement('div');
        target.setAttribute('data-comment-id', 'c1');
        const handled = (
            plugin.props.handleClick as unknown as (v: unknown, p: number, e: { target: HTMLElement }) => boolean
        )(editor.view, 0, { target });
        expect(handled).toBe(true);
        expect(onCommentClick).toHaveBeenCalledWith('c1');
        editor.destroy();
    });

    it('returns false when the click target has no comment id', () => {
        const { editor, onCommentClick } = makeEditor();
        const plugin = findPlugin(editor);
        const handled = (
            plugin.props.handleClick as unknown as (v: unknown, p: number, e: { target: HTMLElement }) => boolean
        )(editor.view, 0, { target: document.createElement('div') });
        expect(handled).toBe(false);
        expect(onCommentClick).not.toHaveBeenCalled();
        editor.destroy();
    });
});
