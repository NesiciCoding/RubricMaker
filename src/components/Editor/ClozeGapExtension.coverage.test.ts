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

describe('ClozeGapExtension node view', () => {
    it('renders the pill with a badge and edits alternatives through the prompt', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('new|alt2');
        const editor = makeEditor(promptToClozeContent('Fill {{old|alt}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        expect(pill).not.toBeNull();
        expect(pill.textContent).toContain('old');
        expect(pill.textContent).toContain('+1');
        expect(pill.title).toBe('old | alt');

        pill.click();
        expect(window.prompt).toHaveBeenCalledWith('Alternatives (pipe-separated), first = correct answer:', 'old|alt');
        expect(clozeContentToPrompt(editor)).toBe('Fill {{new|alt2}} here.');
        editor.destroy();
    });

    it('keeps the gap untouched when the prompt is cancelled', () => {
        vi.spyOn(window, 'prompt').mockReturnValue(null);
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old}} here.');
        editor.destroy();
    });

    it('keeps the gap untouched when the alternatives are all blank', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('   |   ');
        const editor = makeEditor(promptToClozeContent('Fill {{old}} here.'));
        const pill = editor.view.dom.querySelector('.cloze-gap-pill') as HTMLElement;
        pill.click();
        expect(clozeContentToPrompt(editor)).toBe('Fill {{old}} here.');
        editor.destroy();
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
