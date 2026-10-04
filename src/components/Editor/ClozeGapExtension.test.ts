import { Editor } from '@tiptap/core';
import { describe, it, expect } from 'vitest';
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

function roundTrip(prompt: string): string {
    const editor = new Editor({ extensions: [MINIMAL_KIT, ClozeGap], content: promptToClozeContent(prompt) });
    const result = clozeContentToPrompt(editor);
    editor.destroy();
    return result;
}

describe('ClozeGapExtension prompt <-> doc conversion', () => {
    it('round-trips plain text with no gaps', () => {
        expect(roundTrip('No gaps here.')).toBe('No gaps here.');
    });

    it('round-trips a single-answer gap', () => {
        expect(roundTrip('Fill in {{blank}}.')).toBe('Fill in {{blank}}.');
    });

    it('round-trips a dropdown gap with multiple alternatives', () => {
        expect(roundTrip('Pick {{correct|wrong1|wrong2}} carefully.')).toBe(
            'Pick {{correct|wrong1|wrong2}} carefully.'
        );
    });

    it('round-trips multiple gaps in one prompt', () => {
        expect(roundTrip('{{a}} and {{b|c}} together.')).toBe('{{a}} and {{b|c}} together.');
    });

    it('round-trips an empty prompt', () => {
        expect(roundTrip('')).toBe('');
    });

    it('builds the expected doc shape for a single gap', () => {
        const doc = promptToClozeContent('Say {{hi}}');
        expect(doc).toEqual({
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'Say ' },
                        { type: 'clozeGap', attrs: { alternatives: ['hi'] } },
                    ],
                },
            ],
        });
    });
});

describe('ClozeGap word-formation stems', () => {
    const make = (prompt: string, wordFormation: boolean) =>
        new Editor({ extensions: [MINIMAL_KIT, ClozeGap], content: promptToClozeContent(prompt, wordFormation) });

    it('moves a (STEM) after a gap into the gap and writes it back unchanged', () => {
        const prompt = 'Her {{happiness}}(HAPPY) was clear but the {{end}} was not.';
        const editor = make(prompt, true);
        expect(editor.state.doc.firstChild!.child(1).attrs.stem).toBe('HAPPY');
        expect(clozeContentToPrompt(editor)).toBe(prompt);
        editor.destroy();
    });

    it('leaves a parenthesis after a gap as plain text when word formation is off', () => {
        const editor = make('A {{b}}(c) d', false);
        expect(editor.state.doc.firstChild!.child(1).attrs.stem).toBeNull();
        expect(clozeContentToPrompt(editor)).toBe('A {{b}}(c) d');
        editor.destroy();
    });
});
