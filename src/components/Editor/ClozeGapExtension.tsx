import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { renderClozeSegments } from '../../utils/clozeParse';
import { openPillPopover } from './pillPopover';

export interface ClozeGapOptions {
    /** Label shown above the alternatives input in the click-to-edit popover. */
    editLabel: string;
    /** Label for the popover's save button. */
    saveLabel: string;
    /** Label for the popover's cancel button. */
    cancelLabel: string;
    /** Label for the word-formation stem input, shown only while the editor's wordFormation storage flag is on. */
    stemLabel: string;
}

// Parentheses delimit the stem in the stored `{{answer}}(STEM)` form (see gapStems), so one inside it would end the stem early.
function cleanStem(stem: string): string {
    return stem.replace(/[()]/g, '').trim();
}

declare module '@tiptap/core' {
    interface Storage {
        clozeGap: { wordFormation: boolean };
    }
    interface Commands<ReturnType> {
        clozeGap: {
            insertClozeGap: (alternatives: string[]) => ReturnType;
        };
    }
}

/**
 * An inline atom node representing one cloze gap. Renders as a clickable pill; clicking opens an
 * in-app popover anchored to the pill with a pipe-separated alternatives list (first = correct
 * answer), matching the existing {{correct|wrong1|wrong2}} grammar in clozeParse.ts. This node's
 * only job is to let a gap be inserted/edited without hand-typing the raw {{...}} syntax; the
 * parse/scoring layer is untouched.
 */
export const ClozeGap = Node.create<ClozeGapOptions>({
    name: 'clozeGap',
    group: 'inline',
    inline: true,
    atom: true,

    addOptions() {
        return {
            editLabel: 'Alternatives (pipe-separated), first = correct answer:',
            saveLabel: 'Save',
            cancelLabel: 'Cancel',
            stemLabel: 'Stem word (word formation):',
        };
    },

    addStorage() {
        return { wordFormation: false };
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
            stem: {
                default: null as string | null,
                parseHTML: (el: HTMLElement) => el.getAttribute('data-stem') || null,
                renderHTML: (attrs: Record<string, unknown>) =>
                    attrs.stem ? { 'data-stem': attrs.stem as string } : {},
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
                    commands.insertContent({ type: this.name, attrs: { alternatives, stem: null } }),
        };
    },

    addNodeView() {
        const { editLabel, saveLabel, cancelLabel, stemLabel } = this.options;
        const storage = this.storage;
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
                const stem = node.attrs.stem as string | null;
                if (stem) {
                    const hint = document.createElement('span');
                    hint.className = 'cloze-gap-stem';
                    hint.textContent = `(${stem})`;
                    pill.appendChild(hint);
                }
                pill.title = alternatives.join(' | ');
            };
            render();

            let closePopover: (() => void) | null = null;

            function save(input: HTMLInputElement, stemInput?: HTMLInputElement) {
                const alternatives = input.value
                    .split('|')
                    .map((alt) => alt.trim())
                    .filter((alt) => alt.length > 0);
                if (alternatives.length === 0) {
                    closePopover?.();
                    return;
                }
                /* v8 ignore next -- provably dead: tiptap always provides getPos for node views */
                const pos = typeof getPos === 'function' ? getPos() : undefined;
                /* v8 ignore next -- provably dead: getPos is always a function */
                if (pos === undefined) {
                    closePopover?.();
                    return;
                }
                editor
                    .chain()
                    .focus()
                    .command(({ tr }) => {
                        tr.setNodeMarkup(pos, undefined, {
                            alternatives,
                            stem: stemInput ? cleanStem(stemInput.value) || null : (node.attrs.stem as string | null),
                        });
                        return true;
                    })
                    .run();
                closePopover?.();
            }

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                closePopover = openPillPopover(pill, 'cloze-gap-popover', (popover, close) => {
                    const label = document.createElement('div');
                    label.className = 'cloze-gap-popover-label';
                    label.textContent = editLabel;

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'cloze-gap-popover-input';
                    input.value = (node.attrs.alternatives as string[]).join('|');
                    let stemInput: HTMLInputElement | undefined;
                    input.addEventListener('keydown', (ke) => {
                        if (ke.key === 'Enter') {
                            ke.preventDefault();
                            save(input, stemInput);
                        } else if (ke.key === 'Escape') {
                            ke.preventDefault();
                            close();
                        }
                    });

                    const actions = document.createElement('div');
                    actions.className = 'cloze-gap-popover-actions';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.textContent = cancelLabel;
                    cancelBtn.addEventListener('click', () => close());
                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'button';
                    saveBtn.className = 'cloze-gap-popover-save';
                    saveBtn.textContent = saveLabel;
                    saveBtn.addEventListener('click', () => save(input, stemInput));
                    actions.append(cancelBtn, saveBtn);

                    popover.append(label, input);
                    if (storage.wordFormation) {
                        const stemText = document.createElement('div');
                        stemText.className = 'cloze-gap-popover-label';
                        stemText.textContent = stemLabel;
                        stemInput = document.createElement('input');
                        stemInput.type = 'text';
                        stemInput.className = 'cloze-gap-popover-input';
                        stemInput.value = (node.attrs.stem as string | null) ?? '';
                        stemInput.addEventListener('keydown', (ke) => {
                            if (ke.key === 'Enter') {
                                ke.preventDefault();
                                save(input, stemInput);
                            } else if (ke.key === 'Escape') {
                                ke.preventDefault();
                                close();
                            }
                        });
                        popover.append(stemText, stemInput);
                    }
                    popover.append(actions);
                    input.focus();
                    input.select();
                });
            });

            return {
                dom: pill,
                update: (updatedNode) => {
                    /* v8 ignore next -- provably dead: tiptap only calls update with the same node type */
                    if (updatedNode.type.name !== 'clozeGap') return false;
                    node = updatedNode;
                    pill.textContent = '';
                    render();
                    return true;
                },
                destroy: () => closePopover?.(),
            };
        };
    },
});

/** Builds TipTap JSON content for a single-paragraph doc from an existing {{gap|alt}} prompt string; with `wordFormation`, a `(STEM)` right after a gap becomes that gap's stem. */
export function promptToClozeContent(prompt: string, wordFormation = false): JSONContent {
    const segments = renderClozeSegments(prompt);
    const content: JSONContent[] = [];
    segments.forEach((segment, i) => {
        if (segment.type === 'gap') {
            const next = segments[i + 1];
            const match = wordFormation && next?.type === 'text' ? /^\(([^()]+)\)/.exec(next.text) : null;
            content.push({
                type: 'clozeGap',
                attrs: { alternatives: segment.gap.alternatives, ...(match && { stem: match[1].trim() }) },
            });
            return;
        }
        const prev = segments[i - 1];
        const consumed = wordFormation && prev?.type === 'gap' ? /^\(([^()]+)\)/.exec(segment.text) : null;
        const text = consumed ? segment.text.slice(consumed[0].length) : segment.text;
        if (text) content.push({ type: 'text', text });
    });
    return { type: 'doc', content: [{ type: 'paragraph', content: content.length > 0 ? content : undefined }] };
}

/** Reconstructs the flat {{gap|alt}} prompt string (with `(STEM)` after a gap that has one) from the editor's current document. */
export function clozeContentToPrompt(editor: Editor): string {
    let result = '';
    editor.state.doc.descendants((node) => {
        if (node.type.name === 'text') {
            /* v8 ignore next -- provably dead: tiptap text nodes always carry text */
            result += node.text ?? '';
        } else if (node.type.name === 'clozeGap') {
            const stem = node.attrs.stem as string | null;
            result += `{{${(node.attrs.alternatives as string[]).join('|')}}}${stem ? `(${stem})` : ''}`;
        } else if (node.type.name === 'paragraph' && result.length > 0) {
            result += '\n';
        }
        return true;
    });
    return result.trimEnd();
}
