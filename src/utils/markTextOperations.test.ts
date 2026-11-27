import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import type { DocumentMark, MarkPayload } from '../types';
import { applyTextMark, planTextOperation, suggestionFor } from './markTextOperations';
import { applyFormattingMark } from './markOperations';
import { hashSnippet } from './proofRail';

const editors: Editor[] = [];

function makeEditor(content = '<p>Hello world again</p>', { editable = true } = {}): Editor {
    const editor = new Editor({
        extensions: [
            StarterKit.configure({ link: false, underline: false, undoRedo: {} }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
        ],
        content,
        editable,
    });
    editors.push(editor);
    return editor;
}

afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy();
});

function markFor(editor: Editor, symbolId: string, from: number, to: number, payload?: MarkPayload): DocumentMark {
    return {
        id: 'm1',
        attachmentId: 'a1',
        authorId: 't1',
        symbolId,
        anchor: { from, to },
        snippetHash: hashSnippet(editor.state.doc.textBetween(from, to, ' ', ' ')),
        status: 'noted',
        createdAt: '2024-01-01T00:00:00Z',
        ...(payload ? { payload } : {}),
    };
}

describe('applyTextMark — delete and close up', () => {
    it('deletes the marked word and the space after it', () => {
        const editor = makeEditor('<p>Hello world again</p>');

        const result = applyTextMark(editor, markFor(editor, 'del', 7, 12));

        expect(result).toMatchObject({ ok: true, plan: { kind: 'deleteRange', removesSpace: true } });
        expect(editor.state.doc.textContent).toBe('Hello again');
    });

    it('takes the space before a word at the end of the block', () => {
        const editor = makeEditor('<p>Hello world again</p>');

        applyTextMark(editor, markFor(editor, 'del', 13, 18));

        expect(editor.state.doc.textContent).toBe('Hello world');
    });

    it('deletes just the range when no space is adjacent', () => {
        const editor = makeEditor('<p>Hello world</p>');

        const result = applyTextMark(editor, markFor(editor, 'del', 1, 3));

        expect(result).toMatchObject({ ok: true, plan: { kind: 'deleteRange' } });
        expect(result.ok && result.plan.removesSpace).toBeFalsy();
        expect(editor.state.doc.textContent).toBe('llo world');
    });

    it('closes up a space the mark covers', () => {
        const editor = makeEditor('<p>Hello world</p>');

        const result = applyTextMark(editor, markFor(editor, 'closeup', 6, 7));

        expect(result.ok).toBe(true);
        expect(editor.state.doc.textContent).toBe('Helloworld');
    });

    it('closes up the space next to the marked word', () => {
        const editor = makeEditor('<p>Hello world</p>');

        applyTextMark(editor, markFor(editor, 'closeup', 1, 6));

        expect(editor.state.doc.textContent).toBe('Helloworld');
    });

    it('refuses to close up where there is no space at all', () => {
        const editor = makeEditor('<p>Hello world</p>');
        const original = editor.getJSON();

        const result = applyTextMark(editor, markFor(editor, 'closeup', 1, 5));

        expect(result).toEqual({ ok: false, reason: 'advisory', advisory: 'no-whitespace' });
        expect(editor.getJSON()).toEqual(original);
    });
});

describe('applyTextMark — insert and replace', () => {
    it('inserts the punctuation a mark contributes', () => {
        const editor = makeEditor('<p>Hello world</p>');

        applyTextMark(editor, markFor(editor, 'comma', 7, 12));

        expect(editor.state.doc.textContent).toBe('Hello world,');
    });

    it('refuses punctuation that is already there', () => {
        const editor = makeEditor('<p>Hello world.</p>');
        const original = editor.getJSON();

        const result = applyTextMark(editor, markFor(editor, 'period', 7, 12));

        expect(result).toEqual({ ok: false, reason: 'advisory', advisory: 'already-there' });
        expect(editor.getJSON()).toEqual(original);
    });

    it('inserts the text the teacher wrote for an insertion mark', () => {
        const editor = makeEditor('<p>Hello world</p>');

        applyTextMark(editor, markFor(editor, 'ins', 1, 6, { text: '!' }));

        expect(editor.state.doc.textContent).toBe('Hello! world');
    });

    it('refuses an insertion mark with no text', () => {
        const editor = makeEditor('<p>Hello world</p>');

        expect(applyTextMark(editor, markFor(editor, 'ins', 1, 6))).toEqual({
            ok: false,
            reason: 'advisory',
            advisory: 'no-replacement',
        });
    });

    it('replaces the marked word with the spelling correction', () => {
        const editor = makeEditor('<p>Hello recieve again</p>');

        applyTextMark(editor, markFor(editor, 'sp', 7, 14, { text: 'receive' }));

        expect(editor.state.doc.textContent).toBe('Hello receive again');
    });

    it('never guesses a spelling: without a correction it is advisory', () => {
        const editor = makeEditor('<p>Hello recieve again</p>');
        const original = editor.getJSON();

        expect(applyTextMark(editor, markFor(editor, 'sp', 7, 14))).toEqual({
            ok: false,
            reason: 'advisory',
            advisory: 'no-replacement',
        });
        expect(editor.getJSON()).toEqual(original);
    });

    it('refuses a correction that is already the text', () => {
        const editor = makeEditor('<p>Hello world again</p>');

        expect(applyTextMark(editor, markFor(editor, 'sp', 7, 12, { text: 'world' }))).toEqual({
            ok: false,
            reason: 'advisory',
            advisory: 'already-there',
        });
    });
});

describe('applyTextMark — transpose, split and align', () => {
    it('swaps the two words a transpose mark covers, keeping the separator', () => {
        const editor = makeEditor('<p>Hello world again</p>');

        applyTextMark(editor, markFor(editor, 'tr', 1, 12));

        expect(editor.state.doc.textContent).toBe('world Hello again');
    });

    it('refuses a transpose that does not cover exactly two words', () => {
        const editor = makeEditor('<p>Hello world</p>');

        expect(applyTextMark(editor, markFor(editor, 'tr', 1, 6))).toEqual({
            ok: false,
            reason: 'advisory',
            advisory: 'needs-two-words',
        });
    });

    it('splits the paragraph at the end of the marked text', () => {
        const editor = makeEditor('<p>Hello world</p>');

        applyTextMark(editor, markFor(editor, 'para', 1, 6));

        expect(editor.state.doc.childCount).toBe(2);
        expect(editor.state.doc.textContent).toBe('Hello world');
    });

    it('refuses to split at the end of a paragraph that already ends there', () => {
        const editor = makeEditor('<p>Hello world</p>');

        expect(applyTextMark(editor, markFor(editor, 'para', 7, 12))).toEqual({
            ok: false,
            reason: 'advisory',
            advisory: 'already-there',
        });
    });

    it('sets the alignment the mark names on the marked paragraph', () => {
        const editor = makeEditor('<p>Hello world</p>');

        applyTextMark(editor, markFor(editor, 'align-center', 1, 6));

        expect(editor.getHTML()).toContain('text-align: center');

        editor.commands.undo();
        expect(editor.getHTML()).not.toContain('text-align: center');
    });
});

describe('planTextOperation — guards', () => {
    it('refuses a range that spans two paragraphs', () => {
        const editor = makeEditor('<p>Hello</p><p>world</p>');
        const original = editor.getJSON();
        const mark = markFor(editor, 'del', 3, 10);

        expect(planTextOperation(editor.state.doc, mark)).toEqual({
            ok: false,
            reason: 'advisory',
            advisory: 'across-blocks',
        });
        expect(applyTextMark(editor, mark)).toMatchObject({ ok: false, reason: 'advisory' });
        expect(editor.getJSON()).toEqual(original);
    });

    it('refuses a mark whose stored snippet no longer matches', () => {
        const editor = makeEditor('<p>Hello world</p>');
        const original = editor.getJSON();
        const stale = { ...markFor(editor, 'del', 7, 12), snippetHash: hashSnippet('gone') };

        expect(applyTextMark(editor, stale)).toEqual({ ok: false, reason: 'stale-anchor' });
        expect(editor.getJSON()).toEqual(original);
    });

    it('has no plan for a symbol without a text rule', () => {
        const editor = makeEditor('<p>Hello world</p>');

        expect(applyTextMark(editor, markFor(editor, 'query', 1, 6))).toEqual({
            ok: false,
            reason: 'not-text-operation',
        });
        expect(applyTextMark(editor, markFor(editor, 'ital', 1, 6))).toEqual({
            ok: false,
            reason: 'not-text-operation',
        });
    });
});

describe('suggestionFor', () => {
    it('names what a deletion removes', () => {
        const editor = makeEditor('<p>Hello world again</p>');

        expect(suggestionFor(editor.state.doc, markFor(editor, 'del', 7, 12))).toEqual({
            key: 'proofMarks.apply.suggestion.deleteWithSpace',
            values: { text: 'world' },
        });
    });

    it('shows the before and after of a replacement', () => {
        const editor = makeEditor('<p>Hello recieve again</p>');

        expect(suggestionFor(editor.state.doc, markFor(editor, 'sp', 7, 14, { text: 'receive' }))).toEqual({
            key: 'proofMarks.apply.suggestion.replace',
            values: { text: 'recieve', replacement: 'receive' },
        });
    });

    it('explains why an ambiguous mark stays advisory', () => {
        const editor = makeEditor('<p>Hello world</p>');

        expect(suggestionFor(editor.state.doc, markFor(editor, 'tr', 1, 6))).toEqual({
            key: 'proofMarks.apply.advisory',
            reasonKey: 'proofMarks.apply.reason.needsTwoWords',
        });
    });

    it('says nothing for formatting marks and unanchored ones', () => {
        const editor = makeEditor('<p>Hello world</p>');

        expect(suggestionFor(editor.state.doc, markFor(editor, 'ital', 1, 6))).toBeNull();
        expect(
            suggestionFor(editor.state.doc, { ...markFor(editor, 'del', 7, 12), snippetHash: hashSnippet('gone') })
        ).toBeNull();
    });
});

describe('applyTextMark — history', () => {
    it('applies, undoes and redoes on the read-only review editor', () => {
        const editor = makeEditor('<p>Hello world again</p>', { editable: false });
        const original = editor.getJSON();

        expect(applyTextMark(editor, markFor(editor, 'del', 7, 12)).ok).toBe(true);
        const applied = editor.getJSON();

        editor.commands.undo();
        expect(editor.getJSON()).toEqual(original);

        editor.commands.redo();
        expect(editor.getJSON()).toEqual(applied);
    });

    it('applies a realistic set of corrections and undoes back to the original', () => {
        const editor = makeEditor('<p>Hello recieve world</p>');
        const original = editor.getJSON();

        expect(applyFormattingMark(editor, markFor(editor, 'ital', 1, 6)).ok).toBe(true);
        expect(applyTextMark(editor, markFor(editor, 'sp', 7, 14, { text: 'receive' })).ok).toBe(true);
        expect(applyTextMark(editor, markFor(editor, 'comma', 15, 20)).ok).toBe(true);

        expect(editor.state.doc.textContent).toBe('Hello receive world,');

        for (let index = 0; index < 3; index += 1) editor.commands.undo();
        expect(editor.getJSON()).toEqual(original);
    });
});

describe('text operations — property invariants', () => {
    const SYMBOLS = [
        'del',
        'closeup',
        'ins',
        'space',
        'comma',
        'period',
        'apostrophe',
        'para',
        'tr',
        'sp',
        'align-left',
        'align-center',
        'align-right',
    ] as const;

    const PAYLOADS: Readonly<Record<string, MarkPayload>> = {
        ins: { text: 'x' },
        sp: { text: 'fixed' },
    };

    it('never loses text outside the operation, and undo/redo round-trip exactly', () => {
        fc.assert(
            fc.property(
                fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 2, maxLength: 6 }),
                fc.nat(),
                fc.nat(),
                fc.constantFrom(...SYMBOLS),
                (words, fromSeed, toSeed, symbolId) => {
                    const text = words.join(' ');
                    const editor = makeEditor(`<p>${text}</p>`);
                    const from = 1 + (fromSeed % text.length);
                    const to = Math.min(text.length + 1, from + 1 + (toSeed % (text.length + 1 - from)));
                    const mark = markFor(editor, symbolId, from, to, PAYLOADS[symbolId]);
                    const before = editor.getJSON();

                    const result = applyTextMark(editor, mark);
                    const after = editor.getJSON();

                    if (result.ok) expect(after).not.toEqual(before);

                    editor.commands.undo();
                    expect(editor.getJSON()).toEqual(before);

                    editor.commands.redo();
                    expect(editor.getJSON()).toEqual(after);

                    // Applying the same mark again may refuse or be a no-op, but it never edits further.
                    applyTextMark(editor, mark);
                    expect(editor.getJSON()).toEqual(after);
                }
            ),
            { numRuns: 40 }
        );
    });
});
