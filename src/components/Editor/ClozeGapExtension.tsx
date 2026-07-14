import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { renderClozeSegments } from '../../utils/clozeParse';

export interface ClozeGapOptions {
    /** Prompt shown by the click-to-edit window.prompt(); overridden per call site via commands. */
    editLabel: string;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        clozeGap: {
            insertClozeGap: (alternatives: string[]) => ReturnType;
        };
    }
}

/**
 * An inline atom node representing one cloze gap. Renders as a clickable pill; clicking prompts
 * for a pipe-separated alternatives list (first = correct answer), matching the existing
 * {{correct|wrong1|wrong2}} grammar in clozeParse.ts. Kept deliberately plain (window.prompt, no
 * popover UI) — this node's only job is to let a gap be inserted/edited without hand-typing the
 * raw {{...}} syntax; the parse/scoring layer is untouched.
 */
export const ClozeGap = Node.create<ClozeGapOptions>({
    name: 'clozeGap',
    group: 'inline',
    inline: true,
    atom: true,

    addOptions() {
        return { editLabel: 'Alternatives (pipe-separated), first = correct answer:' };
    },

    addAttributes() {
        return {
            alternatives: {
                default: ['answer'],
                parseHTML: (el: HTMLElement) => (el.getAttribute('data-alternatives') ?? 'answer').split('|'),
                renderHTML: (attrs: Record<string, unknown>) => ({
                    'data-alternatives': (attrs.alternatives as string[]).join('|'),
                }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-cloze-gap]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes({ 'data-cloze-gap': '' }, HTMLAttributes)];
    },

    addCommands() {
        return {
            insertClozeGap:
                (alternatives: string[]) =>
                ({ commands }) =>
                    commands.insertContent({ type: this.name, attrs: { alternatives } }),
        };
    },

    addNodeView() {
        const { editLabel } = this.options;
        return ({ node, editor, getPos }) => {
            const pill = document.createElement('span');
            pill.className = 'cloze-gap-pill';
            pill.contentEditable = 'false';

            const render = () => {
                const alternatives = node.attrs.alternatives as string[];
                pill.textContent = alternatives[0] || '—';
                if (alternatives.length > 1) {
                    const badge = document.createElement('sup');
                    badge.textContent = `+${alternatives.length - 1}`;
                    pill.appendChild(badge);
                }
                pill.title = alternatives.join(' | ');
            };
            render();

            pill.addEventListener('click', () => {
                const current = (node.attrs.alternatives as string[]).join('|');
                const next = window.prompt(editLabel, current);
                if (next === null) return;
                const alternatives = next
                    .split('|')
                    .map((alt) => alt.trim())
                    .filter((alt) => alt.length > 0);
                if (alternatives.length === 0) return;
                const pos = typeof getPos === 'function' ? getPos() : undefined;
                if (pos === undefined) return;
                editor.chain().focus().command(({ tr }) => {
                    tr.setNodeMarkup(pos, undefined, { alternatives });
                    return true;
                }).run();
            });

            return {
                dom: pill,
                update: (updatedNode) => {
                    if (updatedNode.type.name !== 'clozeGap') return false;
                    node = updatedNode;
                    pill.textContent = '';
                    render();
                    return true;
                },
            };
        };
    },
});

/** Builds TipTap JSON content for a single-paragraph doc from an existing {{gap|alt}} prompt string. */
export function promptToClozeContent(prompt: string): JSONContent {
    const segments = renderClozeSegments(prompt);
    const content: JSONContent[] = segments.map((segment) =>
        segment.type === 'gap'
            ? { type: 'clozeGap', attrs: { alternatives: segment.gap.alternatives } }
            : { type: 'text', text: segment.text }
    );
    return { type: 'doc', content: [{ type: 'paragraph', content: content.length > 0 ? content : undefined }] };
}

/** Reconstructs the flat {{gap|alt}} prompt string from the editor's current document. */
export function clozeContentToPrompt(editor: Editor): string {
    let result = '';
    editor.state.doc.descendants((node) => {
        if (node.type.name === 'text') {
            result += node.text ?? '';
        } else if (node.type.name === 'clozeGap') {
            result += `{{${(node.attrs.alternatives as string[]).join('|')}}}`;
        } else if (node.type.name === 'paragraph' && result.length > 0) {
            result += '\n';
        }
        return true;
    });
    return result.trimEnd();
}
