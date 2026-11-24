import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { ClozeGap, promptToClozeContent } from './ClozeGapExtension';
import { HotTextFragment, passageToHotTextContent } from './HotTextFragmentExtension';
import { ErrorFragment, passageToErrorContent } from './ErrorFragmentExtension';

const KIT = StarterKit.configure({
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

const editors: Editor[] = [];
function mount(extension: typeof ClozeGap | typeof HotTextFragment | typeof ErrorFragment, content: object) {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new Editor({ element, extensions: [KIT, extension], content });
    editors.push(editor);
    return editor;
}

afterEach(() => {
    editors.splice(0).forEach((e) => {
        e.view.dom.parentElement?.remove();
        e.destroy();
    });
    document.querySelectorAll('.pill-popover').forEach((p) => p.remove());
});

const press = (el: Element, key: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe.each([
    ['cloze gap', ClozeGap, () => promptToClozeContent('The {{cat}} sat'), '.cloze-gap-pill', 'Edit gap: cat'],
    [
        'hot-text fragment',
        HotTextFragment,
        () => passageToHotTextContent('Pick [[this]] one', [0]),
        '.hot-text-fragment-pill',
        'Edit fragment: this',
    ],
    [
        'error fragment',
        ErrorFragment,
        () => passageToErrorContent('He [[go|goes]] home'),
        '[class*="error-fragment-pill"]',
        'Edit fragment: go',
    ],
] as const)('%s pill keyboard access', (_name, extension, content, selector, label) => {
    it('is a focusable button with an accessible name', () => {
        const editor = mount(extension, content());
        const pill = editor.view.dom.querySelector(selector) as HTMLElement;
        expect(pill.getAttribute('role')).toBe('button');
        expect(pill.tabIndex).toBe(0);
        expect(pill.getAttribute('aria-haspopup')).toBe('dialog');
        expect(pill.getAttribute('aria-label')).toBe(label);
    });

    it.each(['Enter', ' '])('opens its dialog with %j without touching the text', (key) => {
        const editor = mount(extension, content());
        const before = editor.getHTML();
        const pill = editor.view.dom.querySelector(selector) as HTMLElement;
        press(pill, key);
        const dialog = document.querySelector('.pill-popover');
        expect(dialog?.getAttribute('role')).toBe('dialog');
        expect(dialog?.getAttribute('aria-label')).toBeTruthy();
        expect(dialog?.contains(document.activeElement)).toBe(true);
        expect(editor.getHTML()).toBe(before);
    });

    it('ignores other keys', () => {
        const editor = mount(extension, content());
        press(editor.view.dom.querySelector(selector) as HTMLElement, 'a');
        expect(document.querySelector('.pill-popover')).toBeNull();
    });

    it('closes with Escape from a control other than the text input', () => {
        const editor = mount(extension, content());
        const pill = editor.view.dom.querySelector(selector) as HTMLElement;
        press(pill, 'Enter');
        const buttons = document.querySelectorAll<HTMLButtonElement>('.pill-popover button');
        const last = buttons[buttons.length - 1];
        last.focus();
        press(last, 'Escape');
        expect(document.querySelector('.pill-popover')).toBeNull();
        expect(document.activeElement).toBe(pill);
    });

    it('leaves focus on the pill after Save, even though Save focuses the editor first', async () => {
        const editor = mount(extension, content());
        const pill = editor.view.dom.querySelector(selector) as HTMLElement;
        press(pill, 'Enter');
        const buttons = document.querySelectorAll<HTMLButtonElement>('.pill-popover button');
        buttons[buttons.length - 1].click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const savedPill = editor.view.dom.querySelector(selector) as HTMLElement;
        expect(document.querySelector('.pill-popover')).toBeNull();
        expect(document.activeElement).toBe(savedPill);
    });

    it('returns focus to the pill when the dialog is cancelled with Escape', () => {
        const editor = mount(extension, content());
        const pill = editor.view.dom.querySelector(selector) as HTMLElement;
        press(pill, 'Enter');
        const input = document.querySelector('.pill-popover input') as HTMLInputElement;
        input.focus();
        press(input, 'Escape');
        expect(document.querySelector('.pill-popover')).toBeNull();
        expect(document.activeElement).toBe(pill);
    });
});

describe('dropdown gap keyboard access', () => {
    it('starts inside the dialog when opened from the keyboard', () => {
        const editor = mount(ClozeGap, promptToClozeContent('The {{cat|dog}} sat'));
        editor.view.dom.setAttribute('data-cloze-dropdown', 'true');
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        press(pill, 'Enter');
        const dialog = document.querySelector('.pill-popover') as HTMLElement;
        expect(dialog.contains(document.activeElement)).toBe(true);
        expect(document.activeElement?.tagName).toBe('INPUT');
    });
});
