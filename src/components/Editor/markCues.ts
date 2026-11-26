import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { DocumentMark } from '../../types';
import { getSymbol, type ProofMarkFamily } from '../../data/proofMarks';
import { resolveMarkRange } from '../../utils/proofRail';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        markCues: {
            setDocumentMarks: (marks: DocumentMark[]) => ReturnType;
            setActiveDocumentMarks: (ids: string[]) => ReturnType;
        };
    }
    interface Storage {
        markCues: MarkCueStorage;
    }
}

interface MarkCueStorage {
    marks: DocumentMark[];
    activeMarkIds: string[];
}

export interface MarkCueSpec {
    id: string;
    from: number;
    to: number;
    family: ProofMarkFamily;
    status: DocumentMark['status'];
    active: boolean;
}

const cuePluginKey = new PluginKey<DecorationSet>('markCues');

/**
 * The inline half of a proofreading mark: one cue style per family under the words the margin chip
 * refers to. Pure so it can be tested without a ProseMirror view; unresolvable anchors are dropped
 * rather than thrown.
 */
export function markCueSpecs(
    doc: PMNode,
    marks: readonly DocumentMark[],
    activeMarkIds: readonly string[] = []
): MarkCueSpec[] {
    const active = new Set(activeMarkIds);
    return marks.flatMap((mark) => {
        const range = resolveMarkRange(doc, mark);
        if (!range) return [];
        return [
            {
                id: mark.id,
                from: range.from,
                to: range.to,
                family: getSymbol(mark.symbolId).family,
                status: mark.status,
                active: active.has(mark.id),
            },
        ];
    });
}

function buildDecorationSet(doc: PMNode, storage: MarkCueStorage) {
    return DecorationSet.create(
        doc,
        markCueSpecs(doc, storage.marks, storage.activeMarkIds).map((spec) =>
            Decoration.inline(spec.from, spec.to, {
                class: [
                    'proof-cue',
                    `proof-cue-${spec.family}`,
                    spec.active ? 'proof-cue-active' : '',
                    spec.status === 'rejected' ? 'proof-cue-rejected' : '',
                ]
                    .filter(Boolean)
                    .join(' '),
                'data-mark-id': spec.id,
                'data-mark-status': spec.status,
            })
        )
    );
}

/**
 * Renders `DocumentMark` anchors as view-only decorations. Marks are pushed in imperatively via
 * `setDocumentMarks`/`setActiveDocumentMarks` (see CommentableDocumentView) because TipTap only
 * reads extension options at creation — same contract as CommentHighlight, and for the same
 * reason: a mark must never enter the document schema or the exported HTML.
 */
export const MarkCues = Extension.create<Record<string, never>, MarkCueStorage>({
    name: 'markCues',

    addStorage() {
        return { marks: [], activeMarkIds: [] };
    },

    addCommands() {
        return {
            setDocumentMarks:
                (marks: DocumentMark[]) =>
                ({ editor }) => {
                    editor.storage.markCues.marks = marks;
                    editor.view.dispatch(editor.state.tr.setMeta(cuePluginKey, true));
                    return true;
                },
            setActiveDocumentMarks:
                (ids: string[]) =>
                ({ editor }) => {
                    editor.storage.markCues.activeMarkIds = ids;
                    editor.view.dispatch(editor.state.tr.setMeta(cuePluginKey, true));
                    return true;
                },
        };
    },

    addProseMirrorPlugins() {
        const extensionStorage = this.storage;

        return [
            new Plugin<DecorationSet>({
                key: cuePluginKey,
                state: {
                    init: (_config, state) => buildDecorationSet(state.doc, extensionStorage),
                    apply(tr, old, _oldState, newState) {
                        if (tr.docChanged || tr.getMeta(cuePluginKey)) {
                            return buildDecorationSet(newState.doc, extensionStorage);
                        }
                        return old.map(tr.mapping, tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return cuePluginKey.getState(state);
                    },
                },
            }),
        ];
    },
});
