import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import type { DocumentMark } from '../types';
import { TextTransform } from '../components/Editor/tiptapExtensions';
import { hashSnippet } from './proofRail';
import {
    applyFormattingMark,
    applyFormattingMarks,
    formattingTargetFor,
    isFormattingMark,
    markStatusAfter,
} from './markOperations';

const editors: Editor[] = [];

function makeEditor(content = '<p>Hello world again</p>', { underline = true } = {}): Editor {
    const editor = new Editor({
        extensions: [
            StarterKit.configure({ link: false, underline: false, undoRedo: {} }),
            ...(underline ? [Underline] : []),
            TextStyle,
            TextTransform,
        ],
        content,
    });
    editors.push(editor);
    return editor;
}

afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy();
});

const mark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'ital',
    anchor: { from: 7, to: 12 },
    snippetHash: hashSnippet('world'),
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
});

function allTextHasMark(editor: Editor, from: number, to: number, name: string): boolean {
    let all = true;
    editor.state.doc.nodesBetween(from, to, (node) => {
        if (node.isText && !node.marks.some((m) => m.type.name === name)) all = false;
    });
    return all;
}

describe('formattingTargetFor', () => {
    it('maps the five type-style symbols onto marks and text transforms', () => {
        expect(formattingTargetFor({ symbolId: 'ital' })).toEqual({ kind: 'mark', name: 'italic' });
        expect(formattingTargetFor({ symbolId: 'bf' })).toEqual({ kind: 'mark', name: 'bold' });
        expect(formattingTargetFor({ symbolId: 'ul' })).toEqual({ kind: 'mark', name: 'underline' });
        expect(formattingTargetFor({ symbolId: 'caps' })).toEqual({ kind: 'textTransform', value: 'uppercase' });
        expect(formattingTargetFor({ symbolId: 'lc' })).toEqual({ kind: 'textTransform', value: 'lowercase' });
    });

    it('has no target for the text and advisory operations', () => {
        for (const symbolId of ['sp', 'del', 'tr', 'ins', 'query', 'align-left', 'not-a-symbol']) {
            expect(formattingTargetFor({ symbolId })).toBeNull();
        }
        expect(isFormattingMark({ symbolId: 'sp' })).toBe(false);
    });

    it('ignores a payload mark on a symbol that is not a type-style mark', () => {
        expect(formattingTargetFor({ symbolId: 'sp', payload: { mark: 'bold' } })).toBeNull();
        expect(formattingTargetFor({ symbolId: 'ital', payload: { mark: 'bold' } })).toEqual({
            kind: 'mark',
            name: 'italic',
        });
    });
});

describe('applyFormattingMark', () => {
    it('applies italic to exactly the marked range', () => {
        const editor = makeEditor();

        expect(applyFormattingMark(editor, mark())).toEqual({ ok: true, target: { kind: 'mark', name: 'italic' } });

        expect(editor.getHTML()).toBe('<p>Hello <em>world</em> again</p>');
        expect(allTextHasMark(editor, 7, 12, 'italic')).toBe(true);
        expect(allTextHasMark(editor, 1, 6, 'italic')).toBe(false);
    });

    it('applies bold and underline', () => {
        const editor = makeEditor();

        applyFormattingMark(editor, mark({ symbolId: 'bf' }));
        expect(editor.getHTML()).toContain('<strong>world</strong>');

        applyFormattingMark(editor, mark({ id: 'm2', symbolId: 'ul' }));
        expect(editor.getHTML()).toContain('<u>');
    });

    it('sets the case with a text-transform rather than rewriting the text', () => {
        const editor = makeEditor();

        applyFormattingMark(editor, mark({ symbolId: 'caps' }));
        expect(editor.getHTML()).toContain('text-transform: uppercase');
        expect(editor.state.doc.textBetween(7, 12)).toBe('world');

        applyFormattingMark(editor, mark({ id: 'm2', symbolId: 'lc' }));
        expect(editor.getHTML()).toContain('text-transform: lowercase');
    });

    it('reads a text-transform back from stored HTML', () => {
        const editor = makeEditor('<p><span style="text-transform: uppercase">loud</span></p>');
        expect(editor.getHTML()).toContain('text-transform: uppercase');
        expect(editor.getHTML()).toContain('loud');
    });

    it('is idempotent, so accepting twice leaves one mark', () => {
        const editor = makeEditor();

        applyFormattingMark(editor, mark());
        const once = editor.getHTML();
        expect(applyFormattingMark(editor, mark()).ok).toBe(true);

        expect(editor.getHTML()).toBe(once);
        expect(once.match(/<em>/g)).toHaveLength(1);
    });

    it('applies across a range that already carries other formatting', () => {
        const editor = makeEditor('<p><strong>Hello</strong> world again</p>');

        const whole = mark({ anchor: { from: 1, to: 12 }, snippetHash: hashSnippet('Hello world') });
        expect(applyFormattingMark(editor, whole).ok).toBe(true);

        expect(allTextHasMark(editor, 1, 12, 'italic')).toBe(true);
        expect(allTextHasMark(editor, 1, 6, 'bold')).toBe(true);
    });

    it('runs as one transaction, so the editor undo and redo cover it', () => {
        const editor = makeEditor();
        const original = editor.getHTML();

        applyFormattingMark(editor, mark());
        const applied = editor.getHTML();

        editor.commands.undo();
        expect(editor.getHTML()).toBe(original);

        editor.commands.redo();
        expect(editor.getHTML()).toBe(applied);
    });

    it('leaves the teacher selection where it was', () => {
        const editor = makeEditor();
        editor.commands.setTextSelection({ from: 1, to: 3 });

        applyFormattingMark(editor, mark({ symbolId: 'caps' }));

        expect(editor.state.selection.from).toBe(1);
        expect(editor.state.selection.to).toBe(3);
    });

    it('refuses a mark whose stored snippet no longer matches', () => {
        const editor = makeEditor();
        const original = editor.getHTML();

        expect(applyFormattingMark(editor, mark({ snippetHash: hashSnippet('other words') }))).toEqual({
            ok: false,
            reason: 'stale-anchor',
        });
        expect(editor.getHTML()).toBe(original);
    });

    it('refuses an anchor outside the document', () => {
        const editor = makeEditor();

        expect(applyFormattingMark(editor, mark({ anchor: { from: 900, to: 905 }, snippetHash: undefined }))).toEqual({
            ok: false,
            reason: 'stale-anchor',
        });
    });

    it('refuses a symbol that changes no formatting', () => {
        const editor = makeEditor();
        const original = editor.getHTML();

        expect(applyFormattingMark(editor, mark({ symbolId: 'sp' }))).toEqual({
            ok: false,
            reason: 'not-formatting',
        });
        expect(editor.getHTML()).toBe(original);
    });

    it('refuses when the editor does not carry that mark', () => {
        const editor = makeEditor('<p>Hello world again</p>', { underline: false });

        expect(applyFormattingMark(editor, mark({ symbolId: 'ul' }))).toEqual({
            ok: false,
            reason: 'unsupported',
        });
    });
});

describe('applyFormattingMarks', () => {
    it('applies the formatting marks and reports the stale one without stopping', () => {
        const editor = makeEditor();
        const good = mark();
        const stale = mark({ id: 'm2', symbolId: 'bf', snippetHash: hashSnippet('gone') });
        const notFormatting = mark({ id: 'm3', symbolId: 'sp' });

        const result = applyFormattingMarks(editor, [good, stale, notFormatting]);

        expect(result.applied.map((m) => m.id)).toEqual(['m1']);
        expect(result.refused.map((r) => [r.mark.id, r.reason])).toEqual([['m2', 'stale-anchor']]);
        expect(editor.getHTML()).toContain('<em>world</em>');
    });

    it('does nothing for a page with no formatting marks', () => {
        const editor = makeEditor();
        const original = editor.getHTML();

        expect(applyFormattingMarks(editor, [mark({ symbolId: 'sp' })])).toEqual({ applied: [], refused: [] });
        expect(editor.getHTML()).toBe(original);
    });
});

describe('markStatusAfter', () => {
    it('moves noted to proposed to a decision', () => {
        expect(markStatusAfter('noted', 'propose')).toBe('proposed');
        expect(markStatusAfter('proposed', 'accept')).toBe('accepted');
        expect(markStatusAfter('proposed', 'reject')).toBe('rejected');
    });

    it('lets a decision be taken straight from a placed mark', () => {
        expect(markStatusAfter('noted', 'accept')).toBe('accepted');
        expect(markStatusAfter('noted', 'reject')).toBe('rejected');
    });

    it('lets a decision be reversed', () => {
        expect(markStatusAfter('accepted', 'reject')).toBe('rejected');
        expect(markStatusAfter('rejected', 'accept')).toBe('accepted');
        expect(markStatusAfter('accepted', 'propose')).toBe('proposed');
    });

    it('returns null when the mark is already in that state', () => {
        expect(markStatusAfter('accepted', 'accept')).toBeNull();
        expect(markStatusAfter('rejected', 'reject')).toBeNull();
        expect(markStatusAfter('proposed', 'propose')).toBeNull();
    });
});
