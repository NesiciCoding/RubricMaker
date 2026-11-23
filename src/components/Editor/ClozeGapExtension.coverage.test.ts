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
        expect(popover.querySelector('.cloze-gap-popover-label')?.textContent).toBe('Correct answers');
        const chipTexts = () =>
            [...popover.querySelectorAll('.cloze-gap-popover-chip > span:first-child')].map((c) => c.textContent);
        expect(chipTexts()).toEqual(['old', 'alt']);

        const input = popover.querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.value = 'new|alt2';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(chipTexts()).toEqual(['old', 'alt', 'new', 'alt2']);
        (popover.querySelector('.cloze-gap-popover-chip-remove') as HTMLButtonElement).click();
        expect(chipTexts()).toEqual(['alt', 'new', 'alt2']);
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();

        expect(clozeContentToPrompt(editor)).toBe('Fill {{alt|new|alt2}} here.');
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
        editor.destroy();
    });

    it('does not add an answer twice, ignoring case', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{Old}} here.'));
        (editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement).click();
        const popover = getPopover();
        const input = popover.querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.value = 'old|Other';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{Old|Other}} here.');
        editor.destroy();
    });

    it('keeps =/~ markers typed into the answer box, and on gaps that already have them', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{=yes|~no}} here.'));
        (editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement).click();
        const popover = getPopover();
        expect(
            [...popover.querySelectorAll('.cloze-gap-popover-chip > span:first-child')].map((c) => c.textContent)
        ).toEqual(['=yes', '~no']);
        const input = popover.querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.value = '=ok';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{=yes|~no|=ok}} here.');
        editor.destroy();
    });

    it('saves an answer that was typed but not yet added', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        (editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement).click();
        const popover = getPopover();
        (popover.querySelector('.cloze-gap-popover-input') as HTMLInputElement).value = 'extra';
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old|extra}} here.');
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

    it('closes without changes when every answer is removed', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        (editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement).click();
        const popover = getPopover();
        (popover.querySelector('.cloze-gap-popover-chip-remove') as HTMLButtonElement).click();
        (popover.querySelector('.cloze-gap-popover-save') as HTMLButtonElement).click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old}} here.');
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
        editor.destroy();
    });

    it('saves on Enter and cancels on Escape from the input', () => {
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        let input = getPopover().querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.value = 'fresh';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        // The first Enter adds the chip; Enter on the now-empty box saves.
        expect(document.querySelector('.cloze-gap-popover')).not.toBeNull();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old|fresh}} here.');
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();

        pill.click();
        input = getPopover().querySelector('.cloze-gap-popover-input') as HTMLInputElement;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('.cloze-gap-popover')).toBeNull();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old|fresh}} here.');
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
