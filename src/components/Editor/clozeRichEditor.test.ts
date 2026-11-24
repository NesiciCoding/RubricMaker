import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { describe, expect, it } from 'vitest';
import { ClozeGap, clozeEditorContent, clozeEditorToPrompt } from './ClozeGapExtension';

const KIT = StarterKit.configure({
    heading: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
    link: false,
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
});

function load(prompt: string, wordFormation = false) {
    return new Editor({
        extensions: [KIT, Subscript, Superscript, ClozeGap],
        content: clozeEditorContent(prompt, wordFormation),
    });
}

describe('cloze editor storage', () => {
    it('keeps an unformatted prompt as the plain string it always was', () => {
        const editor = load('The {{cat|dog}} sat.\nThen {{ran}}.');
        expect(clozeEditorToPrompt(editor)).toBe('The {{cat|dog}} sat.\nThen {{ran}}.');
        editor.destroy();
    });

    it('keeps line boundaries through formatting, a reload and removing the formatting', () => {
        const plain = 'A {{one}}\nB {{two}}';
        const editor = load(plain);
        editor.commands.setTextSelection({ from: 1, to: 2 });
        editor.commands.toggleBold();
        const formatted = clozeEditorToPrompt(editor);
        expect(formatted).toBe('<p><strong>A</strong> {{one}}</p><p>B {{two}}</p>');
        editor.destroy();

        const reloaded = load(formatted);
        expect(clozeEditorToPrompt(reloaded)).toBe(formatted);
        reloaded.commands.setTextSelection({ from: 1, to: 2 });
        reloaded.commands.toggleBold();
        expect(clozeEditorToPrompt(reloaded)).toBe(plain);
        reloaded.destroy();
    });

    it('stores formatted text as HTML with the gaps still written as {{…}}', () => {
        const editor = load('The {{cat}} sat.');
        editor.commands.setTextSelection({ from: 1, to: 4 });
        editor.commands.toggleBold();
        const prompt = clozeEditorToPrompt(editor);
        expect(prompt).toBe('<p><strong>The</strong> {{cat}} sat.</p>');
        editor.destroy();
    });

    it('round-trips a formatted prompt exactly, including a gap inside bold and a gap with an ampersand', () => {
        const stored =
            '<p>A <strong>{{cat|kitten}}</strong> &amp; <em>{{=a&amp;b|~c}}</em><sup>2</sup></p><ul><li><p>{{ran}}</p></li></ul>';
        const editor = load(stored);
        expect(clozeEditorToPrompt(editor)).toBe(stored);
        editor.destroy();
    });

    it('gives the gap pills their decoded text', () => {
        const editor = load('<p><strong>{{a&amp;b}}</strong></p>');
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        expect(pill.title).toBe('a&b');
        editor.destroy();
    });

    it('goes back to the plain string when every format is removed', () => {
        const editor = load('<p><strong>The</strong> {{cat}} sat.</p>');
        editor.commands.selectAll();
        editor.commands.unsetAllMarks();
        expect(clozeEditorToPrompt(editor)).toBe('The {{cat}} sat.');
        editor.destroy();
    });

    it('treats a list or a line break as formatting', () => {
        const editor = load('One {{a}}');
        editor.commands.toggleBulletList();
        expect(clozeEditorToPrompt(editor)).toBe('<ul><li><p>One {{a}}</p></li></ul>');
        editor.destroy();
    });

    it('reads a word-formation stem after a gap in a formatted prompt and writes it back', () => {
        const stored = '<p><strong>{{happiness}}(HAPPY)</strong> showed.</p>';
        const editor = load(stored, true);
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        expect(pill.textContent).toContain('(HAPPY)');
        expect(clozeEditorToPrompt(editor)).toBe(stored);
        editor.destroy();
    });
});
