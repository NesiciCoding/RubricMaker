import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import StarterKit from '@tiptap/starter-kit';
import { ClozeGap, promptToClozeContent, clozeContentToPrompt } from './ClozeGapExtension';

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

function makeEditor(content: string | JSONContent) {
    return new Editor({ extensions: [MINIMAL_KIT, ClozeGap], content });
}

afterEach(() => {
    vi.restoreAllMocks();
});

function getPopover(): HTMLElement {
    const popover = document.querySelector('.cloze-gap-popover') as HTMLElement | null;
    expect(popover).not.toBeNull();
    return popover!;
}

describe('ClozeGapExtension node view', () => {
    it('renders the pill with a badge and edits alternatives through the popover', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old|alt}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        expect(pill).not.toBeNull();
        expect(pill.textContent).toContain('old');
        expect(pill.textContent).toContain('+1');
        expect(pill.title).toBe('old | alt');

        pill.click();
        const popover = getPopover();
        expect(popover.querySelector('.cloze-gap-popover-label')?.textContent).toBe(
            'Alternatives (pipe-separated), first = correct answer:'
        );
        const input = popover.querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        expect(input.value).toBe('old|alt');
        input.value = 'new|alt2';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();

        expect(clozeContentToPrompt(editor)).toBe('Fill {{new|alt2}} here.');
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
        editor.destroy();
    });

    it('keeps the gap untouched when the popover is cancelled', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        const popover = getPopover();
        (popover.querySelector('.cloze-gap-popover-actions button') as HTMLButtonElement).click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old}} here.');
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
        editor.destroy();
    });

    it('keeps the gap untouched when the alternatives are all blank', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        const popover = getPopover();
        const input = popover.querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.value = '   |   ';
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old}} here.');
        editor.destroy();
    });

    it('saves on Enter and cancels on Escape from the input', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        let input = getPopover().querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.value = 'fresh';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(clozeContentToPrompt(editor)).toBe('Fill {{fresh}} here.');
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();

        pill.click();
        input = getPopover().querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{fresh}} here.');
        editor.destroy();
    });

    it('closes the previous popover when opening a second gap, and on outside click', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{a}} and {{b}} here.'));
        const pills = editor.view.dom.querySelectorAll('.cloze-gap-pill');
        (pills[0] as HTMLElement).click();
        expect(document.querySelectorAll('.cloze-gap-popover').length).toBe(1);
        (pills[1] as HTMLElement).click();
        expect(document.querySelectorAll('.cloze-gap-popover').length).toBe(1);

        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelectorAll('.cloze-gap-popover').length).toBe(0);
        editor.destroy();
    });

    it('closes an open popover when the node view is destroyed', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        expect(document.querySelector('.cloze-gap-popover')).not.toBeNull();
        editor.destroy();
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
    });

    it('renders a dash pill when the alternatives list is empty', () => {
        const editor = makeEditor(promptToClozeContent(''));
        editor.commands.insertClozeGap([]);
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        expect(pill.textContent).toBe('—');
        editor.destroy();
    });

    it('parses a gap without a data-alternatives attribute as the default answer', () => {
        const editor = makeEditor('<p>Hi <span data-cloze-gap></span></p>');
        expect(clozeContentToPrompt(editor)).toBe('Hi {{answer}}');
        editor.destroy();
    });

    it('round-trips a multi-paragraph document with newlines', () => {
        const editor = makeEditor('<p>One</p><p>Two</p>');
        expect(clozeContentToPrompt(editor)).toBe('One\nTwo');
        editor.destroy();
    });

    it('rejects an update for a different node type at the gap position', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        // Replace the gap node with a plain text node via a transaction so the
        // node view's update() receives a different node type.
        const gapPos = editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'clozeGap') {
                editor
                    .chain()
                    .focus()
                    .command(({ tr }) => {
                        tr.replaceWith(pos, pos + node.nodeSize, editor.schema.text('replaced'));
                        return true;
                    })
                    .run();
                return false;
            }
            return true;
        });
        expect(gapPos).not.toBe(false);
        expect(clozeContentToPrompt(editor)).toBe('Fill replaced here.');
        editor.destroy();
    });

    it('serializes the gap back to HTML via renderHTML', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old|alt}} here.'));
        const html = editor.getHTML();
        expect(html).toContain('data-cloze-gap');
        expect(html).toContain('data-alternatives="old|alt"');
        editor.destroy();
    });

    it('updates the pill content when the node changes in place', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        editor.commands.insertClozeGap(['fresh']);
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        expect(pill.textContent).toBe('fresh');
        editor.destroy();
    });
});
