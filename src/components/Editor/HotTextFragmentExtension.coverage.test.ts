import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { describe, it, expect } from 'vitest';
import StarterKit from '@tiptap/starter-kit';
import { HotTextFragment, passageToHotTextContent, hotTextContentToPassage } from './HotTextFragmentExtension';

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
    return new Editor({ extensions: [MINIMAL_KIT, HotTextFragment], content });
}

function getPopover(): HTMLElement {
    const popover = document.querySelector('.hot-text-popover') as HTMLElement | null;
    expect(popover).not.toBeNull();
    return popover!;
}

describe('HotTextFragmentExtension node view', () => {
    it('renders the pill (styled correct/incorrect) and edits text/correctness through the popover', () => {
        const editor = makeEditor(passageToHotTextContent('Click [[here]] now', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        expect(pill).not.toBeNull();
        expect(pill.textContent).toBe('here');
        expect(pill.className).not.toContain('correct');

        pill.click();
        const popover = getPopover();
        expect(popover.querySelector('.hot-text-popover-label')?.textContent).toBe('Fragment text:');
        const input = popover.querySelector('.hot-text-popover-input') as HTMLInputElement;
        expect(input.value).toBe('here');
        const checkbox = popover.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
        input.value = 'there';
        checkbox.checked = true;
        (popover.querySelector('.hot-text-popover-save') as HTMLButtonElement).click();

        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'Click [[there]] now', correctIndices: [0] });
        expect(document.querySelector('.hot-text-popover')).toBeNull();
        const updatedPill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        expect(updatedPill.className).toContain('correct');
        editor.destroy();
    });

    it('keeps the fragment untouched when the popover is cancelled', () => {
        const editor = makeEditor(passageToHotTextContent('[[old]]', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        pill.click();
        const popover = getPopover();
        (popover.querySelector('.hot-text-popover-actions button') as HTMLButtonElement).click();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: '[[old]]', correctIndices: [] });
        expect(document.querySelector('.hot-text-popover')).toBeNull();
        editor.destroy();
    });

    it('keeps the fragment untouched when the text is blank', () => {
        const editor = makeEditor(passageToHotTextContent('[[old]]', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        pill.click();
        const popover = getPopover();
        const input = popover.querySelector('.hot-text-popover-input') as HTMLInputElement;
        input.value = '   ';
        (popover.querySelector('.hot-text-popover-save') as HTMLButtonElement).click();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: '[[old]]', correctIndices: [] });
        editor.destroy();
    });

    it('saves on Enter and cancels on Escape from the input', () => {
        const editor = makeEditor(passageToHotTextContent('[[old]]', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        pill.click();
        let input = getPopover().querySelector('.hot-text-popover-input') as HTMLInputElement;
        input.value = 'fresh';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(hotTextContentToPassage(editor)).toEqual({ passage: '[[fresh]]', correctIndices: [] });
        expect(document.querySelector('.hot-text-popover')).toBeNull();

        pill.click();
        input = getPopover().querySelector('.hot-text-popover-input') as HTMLInputElement;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.querySelector('.hot-text-popover')).toBeNull();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: '[[fresh]]', correctIndices: [] });
        editor.destroy();
    });

    it('closes the previous popover when opening a second fragment, and on outside click', () => {
        const editor = makeEditor(passageToHotTextContent('[[a]] and [[b]]', []));
        const pills = editor.view.dom.querySelectorAll('.hot-text-fragment-pill');
        (pills[0] as HTMLElement).click();
        expect(document.querySelectorAll('.hot-text-popover').length).toBe(1);
        (pills[1] as HTMLElement).click();
        expect(document.querySelectorAll('.hot-text-popover').length).toBe(1);

        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelectorAll('.hot-text-popover').length).toBe(0);
        editor.destroy();
    });

    it('closes an open popover when the node view is destroyed', () => {
        const editor = makeEditor(passageToHotTextContent('[[old]]', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        pill.click();
        expect(document.querySelector('.hot-text-popover')).not.toBeNull();
        editor.destroy();
        expect(document.querySelector('.hot-text-popover')).toBeNull();
    });

    it('markSelectionAsFragment wraps the selected text as a new, not-yet-correct fragment', () => {
        const editor = makeEditor('<p>Click here now</p>');
        // "Click here now": doc position 1 is right after <p>, so "here" (string index 6-10) is doc pos 7-11.
        editor.commands.setTextSelection({ from: 7, to: 11 });
        editor.commands.markSelectionAsFragment();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'Click [[here]] now', correctIndices: [] });
        editor.destroy();
    });

    it('markSelectionAsFragment inserts a "word" placeholder when nothing is selected', () => {
        const editor = makeEditor('<p>Text</p>');
        editor.commands.setTextSelection(5);
        editor.commands.markSelectionAsFragment();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'Text[[word]]', correctIndices: [] });
        editor.destroy();
    });

    it('parses a fragment without data-text/data-correct attributes as the defaults', () => {
        const editor = makeEditor('<p>Hi <span data-hot-text-fragment></span></p>');
        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'Hi [[word]]', correctIndices: [] });
        editor.destroy();
    });

    it('round-trips a multi-paragraph document with newlines', () => {
        const editor = makeEditor('<p>One</p><p>Two</p>');
        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'One\nTwo', correctIndices: [] });
        editor.destroy();
    });

    it('rejects an update for a different node type at the fragment position', () => {
        const editor = makeEditor(passageToHotTextContent('Fill [[old]] here.', []));
        const fragmentPos = editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'hotTextFragment') {
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
        expect(fragmentPos).not.toBe(false);
        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'Fill replaced here.', correctIndices: [] });
        editor.destroy();
    });

    it('serializes the fragment back to HTML via renderHTML', () => {
        const editor = makeEditor(passageToHotTextContent('Fill [[old]] here.', [0]));
        const html = editor.getHTML();
        expect(html).toContain('data-hot-text-fragment');
        expect(html).toContain('data-text="old"');
        expect(html).toContain('data-correct="true"');
        editor.destroy();
    });

    it('renders a dash pill for an empty fragment text', () => {
        const editor = makeEditor(passageToHotTextContent('[[]]', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        expect(pill.textContent).toBe('—');
        editor.destroy();
    });

    it('strips [[/]] out of plain text typed alongside a fragment, so it cannot be reparsed as a fake fragment boundary', () => {
        const editor = makeEditor(
            '<p>[[b]] <span data-hot-text-fragment data-text="a" data-correct="true"></span></p>'
        );
        // Without stripping, reparsing "[b] [[a]]" would see 2 fragments and shift which one is correct;
        // with stripping to a single bracket, only the real "a" fragment node round-trips.
        expect(hotTextContentToPassage(editor)).toEqual({ passage: '[b] [[a]]', correctIndices: [0] });
        editor.destroy();
    });

    it('strips [[/]] typed into the popover text input before saving, so it cannot corrupt the fragment count', () => {
        const editor = makeEditor(passageToHotTextContent('[[old]]', []));
        const pill = editor.view.dom.querySelector('.hot-text-fragment-pill') as HTMLElement;
        pill.click();
        const popover = getPopover();
        const input = popover.querySelector('.hot-text-popover-input') as HTMLInputElement;
        input.value = 'a]]b[[c';
        (popover.querySelector('.hot-text-popover-save') as HTMLButtonElement).click();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: '[[a]b[c]]', correctIndices: [] });
        editor.destroy();
    });

    it('strips [[/]] out of a selection wrapped via markSelectionAsFragment', () => {
        const editor = makeEditor('<p>Say [[x]] please</p>');
        // "Say [[x]] please" as literal text: "[[x]]" (5 chars) sits at string index 4-9 → doc pos 5-10.
        editor.commands.setTextSelection({ from: 5, to: 10 });
        editor.commands.markSelectionAsFragment();
        expect(hotTextContentToPassage(editor)).toEqual({ passage: 'Say [[[x]]] please', correctIndices: [] });
        editor.destroy();
    });
});
