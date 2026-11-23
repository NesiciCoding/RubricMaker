import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import {
    clozeGapToSyntax,
    gapCorrectAnswers,
    renderClozeSegments,
    splitClozeOptions,
    type ClozeGap as ClozeGapSyntax,
    type ClozeOptionRole,
} from '../../utils/clozeParse';
import { openPillPopover } from './pillPopover';

export interface ClozeGapOptions {
    /** Label shown above the alternatives input in the click-to-edit popover. */
    editLabel: string;
    /** Label for the popover's save button. */
    saveLabel: string;
    /** Label for the popover's cancel button. */
    cancelLabel: string;
    /** Label for the word-formation stem input. */
    stemLabel: string;
    /** Label above a dropdown gap's accepted answers. */
    correctLabel: string;
    /** Label above a dropdown gap's wrong options. */
    wrongLabel: string;
    /** Label for a chip section's add button. */
    addLabel: string;
    /** Accessible label for removing a chip; `{{value}}` is replaced with the option text. */
    removeLabel: string;
}

// Parentheses delimit the stem in the stored `{{answer}}(STEM)` form (see gapStems), so one inside it would end the stem early.
function cleanStem(stem: string): string {
    return stem.replace(/[()]/g, '').trim();
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        clozeGap: {
            insertClozeGap: (alternatives: string[], roles?: (ClozeOptionRole | null)[]) => ReturnType;
        };
    }
}

/**
 * An inline atom node representing one cloze gap. Renders as a clickable pill; clicking opens an
 * in-app popover anchored to the pill. A typed gap edits a pipe-separated alternatives list; a
 * dropdown gap (the editor carries `data-cloze-dropdown`) edits its correct answers and its wrong
 * options as two separate chip lists, stored as `=`/`~` markers in the same `{{…}}` syntax.
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
            correctLabel: 'Correct answers',
            wrongLabel: 'Wrong options',
            addLabel: 'Add',
            removeLabel: 'Remove {{value}}',
        };
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
            roles: {
                default: null as (ClozeOptionRole | null)[] | null,
                parseHTML: (el: HTMLElement) => {
                    const raw = el.getAttribute('data-roles');
                    if (!raw) return null;
                    return raw
                        .split('|')
                        .map(
                            (role) => (role === 'correct' || role === 'wrong' ? role : null) as ClozeOptionRole | null
                        );
                },
                renderHTML: (attrs: Record<string, unknown>) => {
                    const roles = attrs.roles as (ClozeOptionRole | null)[] | null;
                    return roles ? { 'data-roles': roles.map((role) => role ?? '').join('|') } : {};
                },
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
            // A selection inside one paragraph becomes the gap's first (correct) answer, so marking
            // an existing word needs no retyping; with no selection the given alternatives go in at the caret.
            insertClozeGap:
                (alternatives: string[], roles?: (ClozeOptionRole | null)[]) =>
                ({ state, commands }) => {
                    const { from, to, $from, $to } = state.selection;
                    const selected = from !== to && $from.sameParent($to) ? state.doc.textBetween(from, to) : '';
                    const word = selected.trim();
                    if (/[\n\r\u2028\u2029]/.test(word)) return false;
                    if (!word) {
                        return commands.insertContent({
                            type: this.name,
                            attrs: { alternatives, roles: roles ?? null, stem: null },
                        });
                    }
                    const start = from + (selected.length - selected.trimStart().length);
                    const end = to - (selected.length - selected.trimEnd().length);
                    return commands.insertContentAt(
                        { from: start, to: end },
                        {
                            type: this.name,
                            attrs: { alternatives: [word, ...alternatives.slice(1)], roles: roles ?? null, stem: null },
                        }
                    );
                },
        };
    },

    addKeyboardShortcuts() {
        return {
            'Mod-Shift-g': ({ editor }) =>
                editor.view.dom.getAttribute('data-cloze-dropdown') === 'true'
                    ? editor.commands.insertClozeGap(['correct', 'wrong1', 'wrong2'], ['correct', 'wrong', 'wrong'])
                    : editor.commands.insertClozeGap(['answer']),
        };
    },

    addNodeView() {
        const { editLabel, saveLabel, cancelLabel, stemLabel, correctLabel, wrongLabel, addLabel, removeLabel } =
            this.options;
        return ({ node, editor, getPos }) => {
            const pill = document.createElement('span');
            pill.className = 'cloze-gap-pill';
            pill.contentEditable = 'false';

            // The node view is built before the editor's DOM is mounted, so read the host attribute through
            // the pill itself (null while detached, which only affects the badge's initial primary answer).
            const isDropdown = () => pill.closest('[data-cloze-dropdown="true"]') !== null;
            const alternatives = () => node.attrs.alternatives as string[];
            const roles = () => node.attrs.roles as (ClozeOptionRole | null)[] | null;
            const gap = (): ClozeGapSyntax => ({
                index: 0,
                alternatives: alternatives(),
                ...(roles() ? { roles: roles() as (ClozeOptionRole | null)[] } : {}),
            });

            const render = () => {
                pill.textContent = '';
                const primary = gapCorrectAnswers(gap(), isDropdown())[0] ?? alternatives()[0] ?? '—';
                pill.textContent = primary;
                if (alternatives().length > 1) {
                    const badge = document.createElement('sup');
                    badge.textContent = `+${alternatives().length - 1}`;
                    pill.appendChild(badge);
                }
                const stem = node.attrs.stem as string | null;
                if (stem) {
                    const hint = document.createElement('span');
                    hint.className = 'cloze-gap-stem';
                    hint.textContent = `(${stem})`;
                    pill.appendChild(hint);
                }
                pill.title = alternatives()
                    .map((alternative, i) => (roles()?.[i] === 'wrong' ? `~${alternative}` : alternative))
                    .join(' | ');
            };
            render();

            let closePopover: (() => void) | null = null;

            const applyNode = (next: string[], nextRoles: (ClozeOptionRole | null)[] | null, stem: string | null) => {
                /* v8 ignore next -- tiptap always provides getPos for node views */
                const pos = typeof getPos === 'function' ? getPos() : undefined;
                /* v8 ignore next -- getPos is always a function */
                if (pos === undefined) return;
                editor
                    .chain()
                    .focus()
                    .command(({ tr }) => {
                        tr.setNodeMarkup(pos, undefined, { alternatives: next, roles: nextRoles, stem });
                        return true;
                    })
                    .run();
            };

            const fillChips = (container: HTMLElement, values: string[]) => {
                container.replaceChildren(
                    ...values.map((value, index) => {
                        const chip = document.createElement('span');
                        chip.className = 'cloze-gap-popover-chip';
                        const text = document.createElement('span');
                        text.textContent = value;
                        const remove = document.createElement('button');
                        remove.type = 'button';
                        remove.className = 'cloze-gap-popover-chip-remove';
                        remove.setAttribute('aria-label', removeLabel.replace('{{value}}', value));
                        remove.textContent = '×';
                        remove.addEventListener('click', () => {
                            values.splice(index, 1);
                            fillChips(container, values);
                        });
                        chip.append(text, remove);
                        return chip;
                    })
                );
            };

            const optionSection = (labelText: string, values: string[]) => {
                const section = document.createElement('div');
                section.className = 'cloze-gap-popover-section';
                section.setAttribute('role', 'group');
                section.setAttribute('aria-label', labelText);
                const label = document.createElement('div');
                label.className = 'cloze-gap-popover-label';
                label.setAttribute('aria-hidden', 'true');
                label.textContent = labelText;
                const chips = document.createElement('div');
                chips.className = 'cloze-gap-popover-chips';
                fillChips(chips, values);

                const row = document.createElement('div');
                row.className = 'cloze-gap-popover-add';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'cloze-gap-popover-input';
                // The headings are not form labels, so name each input explicitly for screen readers.
                input.setAttribute('aria-label', labelText);
                const add = document.createElement('button');
                add.type = 'button';
                add.textContent = addLabel;
                add.addEventListener('click', () => commit());
                const commit = () => {
                    const value = input.value.trim();
                    if (!value) return;
                    const exists = [...values].some((existing) => existing.toLowerCase() === value.toLowerCase());
                    if (!exists) values.push(value);
                    input.value = '';
                    fillChips(chips, values);
                    input.focus();
                };
                input.addEventListener('keydown', (ke) => {
                    if (ke.key === 'Enter') {
                        ke.preventDefault();
                        commit();
                    } else if (ke.key === 'Escape') {
                        ke.preventDefault();
                        closePopover?.();
                    }
                });
                row.append(input, add);

                section.append(label, chips, row);
                return section;
            };

            const stemInput = (popover: HTMLElement) => {
                // Read at click time from the editor's DOM so toggling word formation needs no editor rebuild.
                if (editor.view.dom.getAttribute('data-word-formation') !== 'true') return undefined;
                const label = document.createElement('div');
                label.className = 'cloze-gap-popover-label';
                label.textContent = stemLabel;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'cloze-gap-popover-input';
                input.value = (node.attrs.stem as string | null) ?? '';
                input.addEventListener('keydown', (ke) => {
                    if (ke.key === 'Escape') {
                        ke.preventDefault();
                        closePopover?.();
                    }
                });
                popover.append(label, input);
                return input;
            };

            const actions = (onSave: () => void) => {
                const row = document.createElement('div');
                row.className = 'cloze-gap-popover-actions';
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.textContent = cancelLabel;
                cancel.addEventListener('click', () => closePopover?.());
                const save = document.createElement('button');
                save.type = 'button';
                save.className = 'cloze-gap-popover-save';
                save.textContent = saveLabel;
                save.addEventListener('click', onSave);
                row.append(cancel, save);
                return row;
            };

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                closePopover = openPillPopover(pill, 'cloze-gap-popover', (popover, close) => {
                    const dropdown = isDropdown();

                    if (!dropdown) {
                        const label = document.createElement('div');
                        label.className = 'cloze-gap-popover-label';
                        label.textContent = editLabel;

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'cloze-gap-popover-input';
                        // Markers stay visible, so opening and saving a marked gap round-trips unchanged.
                        input.value = alternatives()
                            .map((alternative, i) => {
                                const role = roles()?.[i];
                                return role === 'wrong'
                                    ? `~${alternative}`
                                    : role === 'correct'
                                      ? `=${alternative}`
                                      : alternative;
                            })
                            .join('|');
                        input.addEventListener('keydown', (ke) => {
                            if (ke.key === 'Enter') {
                                ke.preventDefault();
                                saveAlternatives();
                            } else if (ke.key === 'Escape') {
                                ke.preventDefault();
                                close();
                            }
                        });
                        popover.append(label, input);
                        const stem = stemInput(popover);
                        const saveAlternatives = () => {
                            const parsed = splitClozeOptions(input.value);
                            if (parsed.alternatives.length === 0) {
                                close();
                                return;
                            }
                            applyNode(
                                parsed.alternatives,
                                parsed.roles.some(Boolean) ? parsed.roles : null,
                                stem ? cleanStem(stem.value) || null : (node.attrs.stem as string | null)
                            );
                            close();
                        };
                        popover.append(actions(saveAlternatives));
                        input.focus();
                        input.select();
                        return;
                    }

                    const currentRoles = roles();
                    const isCorrect = (i: number) => (currentRoles ? currentRoles[i] !== 'wrong' : i === 0);
                    const correct = alternatives().filter((_, i) => isCorrect(i));
                    const wrong = alternatives().filter((_, i) => !isCorrect(i));

                    popover.append(optionSection(correctLabel, correct), optionSection(wrongLabel, wrong));
                    popover.append(
                        actions(() => {
                            if (correct.length === 0) {
                                close();
                                return;
                            }
                            applyNode(
                                [...correct, ...wrong],
                                [
                                    ...correct.map((): ClozeOptionRole => 'correct'),
                                    ...wrong.map((): ClozeOptionRole => 'wrong'),
                                ],
                                node.attrs.stem as string | null
                            );
                            close();
                        })
                    );
                });
            });

            return {
                dom: pill,
                update: (updatedNode) => {
                    /* v8 ignore next -- tiptap only calls update with the same node type */
                    if (updatedNode.type.name !== 'clozeGap') return false;
                    node = updatedNode;
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
                attrs: {
                    alternatives: segment.gap.alternatives,
                    roles: segment.gap.roles ?? null,
                    ...(match && { stem: match[1].trim() }),
                },
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
            const gap: ClozeGapSyntax = {
                index: 0,
                alternatives: node.attrs.alternatives as string[],
                ...(node.attrs.roles ? { roles: node.attrs.roles as (ClozeOptionRole | null)[] } : {}),
            };
            result += `${clozeGapToSyntax(gap)}${stem ? `(${stem})` : ''}`;
        } else if (node.type.name === 'paragraph' && result.length > 0) {
            result += '\n';
        }
        return true;
    });
    return result.trimEnd();
}
