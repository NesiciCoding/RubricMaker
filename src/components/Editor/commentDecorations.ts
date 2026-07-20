import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { DocumentComment } from '../../types';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        commentHighlight: {
            setDocumentComments: (comments: DocumentComment[]) => ReturnType;
            setActiveDocumentComment: (id: string | null) => ReturnType;
        };
    }
    interface Storage {
        commentHighlight: CommentHighlightStorage;
    }
}

interface CommentHighlightOptions {
    onCommentClick: (id: string) => void;
}

interface CommentHighlightStorage {
    comments: DocumentComment[];
    activeCommentId: string | null;
}

const commentPluginKey = new PluginKey<DecorationSet>('commentHighlight');

/**
 * Pure range computation, kept separate from DecorationSet construction so it's testable
 * without a real ProseMirror document — an out-of-bounds or zero-length anchor (e.g. from a
 * corrupted/hand-edited record) is silently dropped rather than throwing at render time.
 */
export function commentDecorationSpecs(comments: DocumentComment[], docSize: number, activeCommentId: string | null) {
    return comments
        .filter((c) => c.anchor.from >= 0 && c.anchor.to <= docSize && c.anchor.from < c.anchor.to)
        .map((c) => ({ from: c.anchor.from, to: c.anchor.to, id: c.id, active: c.id === activeCommentId }));
}

function buildDecorationSet(doc: Parameters<typeof DecorationSet.create>[0], storage: CommentHighlightStorage) {
    const specs = commentDecorationSpecs(storage.comments, doc.content.size, storage.activeCommentId);
    const decorations = specs.map((s) =>
        Decoration.inline(s.from, s.to, {
            class: s.active ? 'comment-highlight comment-highlight-active' : 'comment-highlight',
            'data-comment-id': s.id,
        })
    );
    return DecorationSet.create(doc, decorations);
}

/**
 * Renders DocumentComment anchors as view-only decorations — never touches the document
 * schema/HTML, unlike a Mark-based approach. Comments are pushed in imperatively via the
 * setDocumentComments/setActiveDocumentComment commands (see CommentableDocumentView), not
 * reactive extension options, since TipTap only reads extension options at editor creation.
 */
export const CommentHighlight = Extension.create<CommentHighlightOptions, CommentHighlightStorage>({
    name: 'commentHighlight',

    addOptions() {
        return { onCommentClick: () => {} };
    },

    addStorage() {
        return { comments: [], activeCommentId: null };
    },

    addCommands() {
        return {
            setDocumentComments:
                (comments: DocumentComment[]) =>
                ({ editor }) => {
                    editor.storage.commentHighlight.comments = comments;
                    editor.view.dispatch(editor.state.tr.setMeta(commentPluginKey, true));
                    return true;
                },
            setActiveDocumentComment:
                (id: string | null) =>
                ({ editor }) => {
                    editor.storage.commentHighlight.activeCommentId = id;
                    editor.view.dispatch(editor.state.tr.setMeta(commentPluginKey, true));
                    return true;
                },
        };
    },

    addProseMirrorPlugins() {
        const extensionStorage = this.storage;
        const onCommentClick = this.options.onCommentClick;

        return [
            new Plugin({
                key: commentPluginKey,
                state: {
                    init: (_config, state) => buildDecorationSet(state.doc, extensionStorage),
                    apply(tr, old, _oldState, newState) {
                        if (tr.docChanged || tr.getMeta(commentPluginKey)) {
                            return buildDecorationSet(newState.doc, extensionStorage);
                        }
                        return old.map(tr.mapping, tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return commentPluginKey.getState(state);
                    },
                    handleClick(_view, _pos, event) {
                        const target = (event.target as HTMLElement | null)?.closest('[data-comment-id]');
                        const id = target?.getAttribute('data-comment-id');
                        if (id) {
                            onCommentClick(id);
                            return true;
                        }
                        return false;
                    },
                },
            }),
        ];
    },
});
