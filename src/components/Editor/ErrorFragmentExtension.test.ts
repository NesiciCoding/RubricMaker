import { Editor } from '@tiptap/core';
import { describe, it, expect } from 'vitest';
import StarterKit from '@tiptap/starter-kit';
import {
    ErrorFragment,
    countFragmentsMissingCorrection,
    errorContentToPassage,
    passageToErrorContent,
} from './ErrorFragmentExtension';

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

const make = (passage: string) =>
    new Editor({ extensions: [KIT, ErrorFragment], content: passageToErrorContent(passage) });

const roundTrip = (passage: string) => {
    const editor = make(passage);
    const out = errorContentToPassage(editor);
    editor.destroy();
    return out;
};

describe('ErrorFragmentExtension passage <-> doc conversion', () => {
    it('round-trips errors with several corrections and correct decoys', () => {
        const passage = 'He [[go|goes|is going]] to school [[every]] day.';
        expect(roundTrip(passage)).toBe(passage);
    });

    it('round-trips multi-paragraph passages and plain text', () => {
        expect(roundTrip('Line [[one|1]]\nLine two')).toBe('Line [[one|1]]\nLine two');
        expect(roundTrip('No fragments at all.')).toBe('No fragments at all.');
    });

    it('marks a selection as an error with an empty correction to fill in', () => {
        const editor = make('He go home');
        editor.commands.setTextSelection({ from: 4, to: 6 });
        editor.commands.markSelectionAsErrorFragment(true);
        expect(countFragmentsMissingCorrection(editor)).toBe(1);
        // an error without a correction cannot be stored, so it serialises as a decoy until one is added
        expect(errorContentToPassage(editor)).toBe('He [[go]] home');
        editor.destroy();
    });

    it('marks a selection as a correct decoy and strips bracket syntax from the text', () => {
        const editor = make('He [x] home');
        editor.commands.setTextSelection({ from: 4, to: 7 });
        editor.commands.markSelectionAsErrorFragment(false);
        expect(errorContentToPassage(editor)).toBe('He [[x]] home');
        expect(countFragmentsMissingCorrection(editor)).toBe(0);
        editor.destroy();
    });
});
