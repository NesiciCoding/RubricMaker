import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { parseErrorPassage } from '../../../supabase/functions/_shared/testScoring';
import { openPillPopover } from './pillPopover';

// `[`, `]` and `|` are the passage grammar, so none of them may survive inside a fragment or its
// corrections: a stray one would be reparsed as a boundary or an extra alternative on the next load.
function stripSyntax(text: string): string {
    return text.replace(/[[\]|]/g, '');
}

export interface ErrorFragmentOptions {
    textLabel: string;
    isErrorLabel: string;
    correctionsLabel: string;
    addCorrectionLabel: string;
    removeCorrectionLabel: string;
    saveLabel: string;
    cancelLabel: string;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        errorFragment: {
            /** Wraps the current selection as a selectable fragment; an error starts with one empty correction to fill in. */
            markSelectionAsErrorFragment: (isError: boolean) => ReturnType;
        };
    }
}

export const ERROR_PILL_CLASS = 'error-fragment-pill';

/**
 * An inline atom node for one selectable fragment of an error-correction passage: red when it
 * holds an error (with its accepted corrections), green when it is a correct decoy. Mirrors
 * HotTextFragment's pill/popover pattern so teachers never type the raw [[wrong|right]] grammar;
 * the parse/scoring layer in testScoring.ts is untouched.
 */
export const ErrorFragment = Node.create<ErrorFragmentOptions>({
    name: 'errorFragment',
    group: 'inline',
    inline: true,
    atom: true,

    addOptions() {
        return {
            textLabel: 'Fragment text:',
            isErrorLabel: 'This fragment contains an error',
            correctionsLabel: 'Accepted corrections',
            addCorrectionLabel: '+ Add correction',
            removeCorrectionLabel: 'Remove',
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
            isError: {
                default: false,
                parseHTML: (el: HTMLElement) => el.getAttribute('data-is-error') === 'true',
                renderHTML: (attrs: Record<string, unknown>) => ({ 'data-is-error': String(!!attrs.isError) }),
            },
            corrections: {
                default: [] as string[],
                parseHTML: (el: HTMLElement) => {
                    try {
                        const parsed: unknown = JSON.parse(el.getAttribute('data-corrections') ?? '[]');
                        return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
                    } catch {
                        return [];
                    }
                },
                renderHTML: (attrs: Record<string, unknown>) => ({
                    'data-corrections': JSON.stringify(attrs.corrections),
                }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-error-fragment]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes({ 'data-error-fragment': '' }, HTMLAttributes)];
    },

    addCommands() {
        return {
            markSelectionAsErrorFragment:
                (isError) =>
                ({ state, chain }) => {
                    const { from, to } = state.selection;
                    const text = stripSyntax(state.doc.textBetween(from, to)).trim() || 'word';
                    return chain()
                        .insertContentAt(
                            { from, to },
                            { type: this.name, attrs: { text, isError, corrections: isError ? [''] : [] } }
                        )
                        .run();
                },
        };
    },

    addNodeView() {
        const o = this.options;
        return ({ node, editor, getPos }) => {
            const pill = document.createElement('span');
            pill.contentEditable = 'false';

            const render = () => {
                const missing = !!node.attrs.isError && !hasCorrection(node.attrs.corrections as string[]);
                pill.className = `${ERROR_PILL_CLASS}${node.attrs.isError ? ' error' : ' fine'}${missing ? ' missing' : ''}`;
                const corrections = (node.attrs.corrections as string[]).filter(Boolean);
                pill.textContent = (node.attrs.text as string) || '—';
                if (node.attrs.isError) {
                    const hint = document.createElement('span');
                    hint.className = 'error-fragment-hint';
                    hint.textContent = corrections.length ? `→ ${corrections.join(' / ')}` : '→ ?';
                    pill.append(hint);
                }
            };
            render();

            let closePopover: (() => void) | null = null;

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                closePopover = openPillPopover(pill, 'error-fragment-popover', (popover, close) => {
                    const textLabel = document.createElement('div');
                    textLabel.className = 'error-fragment-popover-label';
                    textLabel.textContent = o.textLabel;
                    const textInput = document.createElement('input');
                    textInput.type = 'text';
                    textInput.className = 'error-fragment-popover-input';
                    textInput.value = node.attrs.text as string;

                    const errorRow = document.createElement('label');
                    errorRow.className = 'error-fragment-popover-checkbox-row';
                    const errorBox = document.createElement('input');
                    errorBox.type = 'checkbox';
                    errorBox.checked = !!node.attrs.isError;
                    errorRow.append(errorBox, document.createTextNode(o.isErrorLabel));

                    const corrLabel = document.createElement('div');
                    corrLabel.className = 'error-fragment-popover-label';
                    corrLabel.textContent = o.correctionsLabel;
                    const corrList = document.createElement('div');
                    corrList.className = 'error-fragment-popover-list';
                    const addRow = (value: string) => {
                        const row = document.createElement('div');
                        row.className = 'error-fragment-popover-row';
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'error-fragment-popover-input';
                        input.value = value;
                        input.setAttribute('aria-label', o.correctionsLabel);
                        const remove = document.createElement('button');
                        remove.type = 'button';
                        remove.textContent = '×';
                        remove.setAttribute('aria-label', o.removeCorrectionLabel);
                        remove.addEventListener('click', () => row.remove());
                        row.append(input, remove);
                        corrList.append(row);
                        return input;
                    };
                    const initial = (node.attrs.corrections as string[]).length
                        ? (node.attrs.corrections as string[])
                        : [''];
                    initial.forEach(addRow);
                    const addBtn = document.createElement('button');
                    addBtn.type = 'button';
                    addBtn.className = 'error-fragment-popover-add';
                    addBtn.textContent = o.addCorrectionLabel;
                    addBtn.addEventListener('click', () => addRow('').focus());
                    const corrSection = document.createElement('div');
                    corrSection.className = 'error-fragment-popover-section';
                    corrSection.append(corrLabel, corrList, addBtn);
                    const syncVisibility = () => {
                        corrSection.style.display = errorBox.checked ? '' : 'none';
                    };
                    errorBox.addEventListener('change', syncVisibility);
                    syncVisibility();

                    const save = () => {
                        const text = stripSyntax(textInput.value).trim();
                        /* v8 ignore next -- provably dead: tiptap always provides getPos for node views */
                        const pos = typeof getPos === 'function' ? getPos() : undefined;
                        if (!text || pos === undefined) {
                            close();
                            return;
                        }
                        const corrections = errorBox.checked
                            ? Array.from(corrList.querySelectorAll('input'))
                                  .map((i) => stripSyntax(i.value).trim())
                                  .filter(Boolean)
                            : [];
                        editor
                            .chain()
                            .focus()
                            .command(({ tr }) => {
                                tr.setNodeMarkup(pos, undefined, {
                                    text,
                                    isError: errorBox.checked,
                                    corrections: errorBox.checked && corrections.length === 0 ? [''] : corrections,
                                });
                                return true;
                            })
                            .run();
                        close();
                    };

                    popover.addEventListener('keydown', (ke) => {
                        if (ke.key === 'Enter') {
                            ke.preventDefault();
                            save();
                        } else if (ke.key === 'Escape') {
                            ke.preventDefault();
                            close();
                        }
                    });

                    const actions = document.createElement('div');
                    actions.className = 'error-fragment-popover-actions';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.textContent = o.cancelLabel;
                    cancelBtn.addEventListener('click', () => close());
                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'button';
                    saveBtn.className = 'error-fragment-popover-save';
                    saveBtn.textContent = o.saveLabel;
                    saveBtn.addEventListener('click', save);
                    actions.append(cancelBtn, saveBtn);

                    popover.append(textLabel, textInput, errorRow, corrSection, actions);
                    (errorBox.checked ? (corrList.querySelector('input') as HTMLInputElement) : textInput).focus();
                });
            });

            return {
                dom: pill,
                update: (updatedNode) => {
                    /* v8 ignore next -- provably dead: tiptap only calls update with the same node type */
                    if (updatedNode.type.name !== 'errorFragment') return false;
                    node = updatedNode;
                    render();
                    return true;
                },
                destroy: () => closePopover?.(),
            };
        };
    },
});

function hasCorrection(corrections: string[]): boolean {
    return corrections.some((c) => c.trim());
}

/** Builds TipTap JSON for the editor from a stored `[[wrong|right]]` passage. */
export function passageToErrorContent(passage: string): JSONContent {
    const paragraphs: JSONContent[][] = [[]];
    for (const segment of parseErrorPassage(passage)) {
        if (segment.type === 'fragment') {
            paragraphs[paragraphs.length - 1].push({
                type: 'errorFragment',
                attrs: {
                    text: segment.text,
                    isError: segment.corrections.length > 0,
                    corrections: segment.corrections,
                },
            });
            continue;
        }
        segment.text.split('\n').forEach((line, i) => {
            if (i > 0) paragraphs.push([]);
            if (line) paragraphs[paragraphs.length - 1].push({ type: 'text', text: line });
        });
    }
    return {
        type: 'doc',
        content: paragraphs.map((content) => ({ type: 'paragraph', content: content.length ? content : undefined })),
    };
}

/** Reconstructs the stored passage string from the editor's current document. */
export function errorContentToPassage(editor: Editor): string {
    const paragraphs: string[] = [];
    editor.state.doc.forEach((paragraph) => {
        let line = '';
        paragraph.forEach((node) => {
            if (node.type.name === 'text') {
                line += (node.text ?? '').replace(/[[\]]/g, '');
            } else if (node.type.name === 'errorFragment') {
                const corrections = node.attrs.isError
                    ? (node.attrs.corrections as string[]).map((c) => c.trim()).filter(Boolean)
                    : [];
                line += `[[${[node.attrs.text as string, ...corrections].join('|')}]]`;
            }
        });
        paragraphs.push(line);
    });
    return paragraphs.join('\n').trimEnd();
}

/** Number of error fragments still missing an accepted correction (they would silently become decoys when saved). */
export function countFragmentsMissingCorrection(editor: Editor): number {
    let missing = 0;
    editor.state.doc.descendants((node) => {
        if (node.type.name === 'errorFragment' && node.attrs.isError && !hasCorrection(node.attrs.corrections)) {
            missing++;
        }
        return true;
    });
    return missing;
}
