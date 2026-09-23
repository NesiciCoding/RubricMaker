import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { parseHotTextFragments } from '../../utils/clozeParse';
import { openPillPopover } from './pillPopover';

// A raw `[[`/`]]` anywhere in the serialized passage — whether typed as plain text or inside a
// fragment's own text — would be reparsed as a fragment boundary by parseHotTextFragments on the
// next load, silently shifting every later fragment's index and corrupting which one is "correct".
// Collapsing the doubled bracket to a single one keeps the text close to what was typed while
// making it impossible to round-trip into a fake fragment marker.
function stripBracketSyntax(text: string): string {
    return text.replace(/\[\[/g, '[').replace(/\]\]/g, ']');
}

export interface HotTextFragmentOptions {
    /** Label shown above the text input in the click-to-edit popover. */
    textLabel: string;
    /** Label for the "correct answer" checkbox in the popover. */
    correctLabel: string;
    /** Label for the popover's save button. */
    saveLabel: string;
    /** Label for the popover's cancel button. */
    cancelLabel: string;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        hotTextFragment: {
            /** Wraps the current selection (or inserts a placeholder) as a new, not-yet-correct fragment. */
            markSelectionAsFragment: () => ReturnType;
        };
    }
}

/**
 * An inline atom node representing one hot-text selectable fragment. Renders as a clickable pill
 * (green when marked correct); clicking opens an in-app popover — mirroring ClozeGap's — to edit
 * the fragment's text and toggle whether it's a correct answer, matching the existing [[word]]
 * grammar in clozeParse.ts. This node's only job is to let fragments be marked without hand-typing
 * the raw [[...]] syntax; the parse/scoring layer is untouched.
 */
export const HotTextFragment = Node.create<HotTextFragmentOptions>({
    name: 'hotTextFragment',
    group: 'inline',
    inline: true,
    atom: true,

    addOptions() {
        return {
            textLabel: 'Fragment text:',
            correctLabel: 'Correct answer',
            saveLabel: 'Save',
            cancelLabel: 'Cancel',
        };
    },

    addAttributes() {
        return {
            text: {
                default: 'word',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-text') ?? 'word',
                renderHTML: (attrs: Record<string, unknown>) => ({ 'data-text': attrs.text as string }),
            },
            correct: {
                default: false,
                parseHTML: (el: HTMLElement) => el.getAttribute('data-correct') === 'true',
                renderHTML: (attrs: Record<string, unknown>) => ({ 'data-correct': String(!!attrs.correct) }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-hot-text-fragment]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes({ 'data-hot-text-fragment': '' }, HTMLAttributes)];
    },

    addCommands() {
        return {
            markSelectionAsFragment:
                () =>
                ({ state, chain }) => {
                    const { from, to } = state.selection;
                    const text = stripBracketSyntax(state.doc.textBetween(from, to)) || 'word';
                    return chain()
                        .insertContentAt({ from, to }, { type: this.name, attrs: { text, correct: false } })
                        .run();
                },
        };
    },

    addNodeView() {
        const { textLabel, correctLabel, saveLabel, cancelLabel } = this.options;
        return ({ node, editor, getPos }) => {
            const pill = document.createElement('span');
            pill.contentEditable = 'false';

            const render = () => {
                pill.className = node.attrs.correct ? 'hot-text-fragment-pill correct' : 'hot-text-fragment-pill';
                pill.textContent = (node.attrs.text as string) || '—';
            };
            render();

            let closePopover: (() => void) | null = null;

            function save(input: HTMLInputElement, checkbox: HTMLInputElement) {
                const text = stripBracketSyntax(input.value.trim());
                if (!text) {
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
                        tr.setNodeMarkup(pos, undefined, { text, correct: checkbox.checked });
                        return true;
                    })
                    .run();
                closePopover?.();
            }

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                closePopover = openPillPopover(pill, 'hot-text-popover', (popover, close) => {
                    const label = document.createElement('div');
                    label.className = 'hot-text-popover-label';
                    label.textContent = textLabel;

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'hot-text-popover-input';
                    input.value = node.attrs.text as string;

                    const checkboxRow = document.createElement('label');
                    checkboxRow.className = 'hot-text-popover-checkbox-row';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = !!node.attrs.correct;
                    checkboxRow.append(checkbox, document.createTextNode(correctLabel));

                    input.addEventListener('keydown', (ke) => {
                        if (ke.key === 'Enter') {
                            ke.preventDefault();
                            save(input, checkbox);
                        } else if (ke.key === 'Escape') {
                            ke.preventDefault();
                            close();
                        }
                    });

                    const actions = document.createElement('div');
                    actions.className = 'hot-text-popover-actions';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.textContent = cancelLabel;
                    cancelBtn.addEventListener('click', () => close());
                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'button';
                    saveBtn.className = 'hot-text-popover-save';
                    saveBtn.textContent = saveLabel;
                    saveBtn.addEventListener('click', () => save(input, checkbox));
                    actions.append(cancelBtn, saveBtn);

                    popover.append(label, input, checkboxRow, actions);
                    input.focus();
                    input.select();
                });
            });

            return {
                dom: pill,
                update: (updatedNode) => {
                    /* v8 ignore next -- provably dead: tiptap only calls update with the same node type */
                    if (updatedNode.type.name !== 'hotTextFragment') return false;
                    node = updatedNode;
                    render();
                    return true;
                },
                destroy: () => closePopover?.(),
            };
        };
    },
});

/** Builds TipTap JSON content for a single-paragraph doc from an existing [[word]] passage string. */
export function passageToHotTextContent(passage: string, correctIndices: number[]): JSONContent {
    const segments = parseHotTextFragments(passage);
    const content: JSONContent[] = segments.map((segment) =>
        segment.type === 'fragment'
            ? {
                  type: 'hotTextFragment',
                  attrs: { text: segment.text, correct: correctIndices.includes(segment.index) },
              }
            : { type: 'text', text: segment.text }
    );
    return { type: 'doc', content: [{ type: 'paragraph', content: content.length > 0 ? content : undefined }] };
}

/** Reconstructs the flat [[word]] passage string, plus the correct fragment indices, from the editor's current document. */
export function hotTextContentToPassage(editor: Editor): { passage: string; correctIndices: number[] } {
    let passage = '';
    const correctIndices: number[] = [];
    let fragmentIndex = 0;
    editor.state.doc.descendants((node) => {
        if (node.type.name === 'text') {
            /* v8 ignore next -- provably dead: tiptap text nodes always carry text */
            passage += stripBracketSyntax(node.text ?? '');
        } else if (node.type.name === 'hotTextFragment') {
            passage += `[[${node.attrs.text as string}]]`;
            if (node.attrs.correct) correctIndices.push(fragmentIndex);
            fragmentIndex += 1;
        } else if (node.type.name === 'paragraph' && passage.length > 0) {
            passage += '\n';
        }
        return true;
    });
    return { passage: passage.trimEnd(), correctIndices };
}
