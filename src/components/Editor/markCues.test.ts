import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { MarkCues, markCueSpecs } from './markCues';
import type { DocumentMark } from '../../types';
import { hashSnippet } from '../../utils/proofRail';

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

const makeMark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 'u1',
    symbolId: 'sp',
    anchor: { from: 1, to: 6 },
    status: 'noted',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

describe('markCueSpecs', () => {
    const doc = new Editor({ extensions: [MINIMAL_KIT], content: '<p>Hello world</p>' }).state.doc;

    it('maps a mark to its range and family', () => {
        const specs = markCueSpecs(doc, [makeMark()]);
        expect(specs).toEqual([{ id: 'm1', from: 1, to: 6, family: 'replace', status: 'noted', active: false }]);
    });

    it('reads an unknown symbol id as the advisory family instead of throwing', () => {
        expect(markCueSpecs(doc, [makeMark({ symbolId: 'stet' })])[0]?.family).toBe('advisory');
    });

    it('marks the active ids', () => {
        expect(markCueSpecs(doc, [makeMark()], ['m1'])[0]?.active).toBe(true);
        expect(markCueSpecs(doc, [makeMark()], ['other'])[0]?.active).toBe(false);
    });

    it('drops out-of-bounds, empty and hash-mismatched anchors', () => {
        const specs = markCueSpecs(doc, [
            makeMark({ id: 'oob', anchor: { from: 2, to: 500 } }),
            makeMark({ id: 'empty', anchor: { from: 3, to: 3 } }),
            makeMark({ id: 'stale', snippetHash: hashSnippet('Goodbye') }),
            makeMark({ id: 'ok', anchor: { from: 1, to: 5 } }),
        ]);
        expect(specs.map((spec) => spec.id)).toEqual(['ok']);
    });

    it('keeps an anchor whose snippet hash still matches', () => {
        const specs = markCueSpecs(doc, [makeMark({ snippetHash: hashSnippet('Hello') })]);
        expect(specs).toHaveLength(1);
    });
});

describe('MarkCues extension', () => {
    function makeEditor() {
        return new Editor({
            extensions: [MINIMAL_KIT, MarkCues],
            content: '<p>Hello world</p>',
        });
    }

    function findPlugin(editor: Editor) {
        return editor.state.plugins.find((plugin) =>
            String((plugin as unknown as { key: unknown }).key).startsWith('markCues')
        )!;
    }

    function decorations(editor: Editor) {
        const plugin = findPlugin(editor);
        return (
            plugin.props.decorations as unknown as (state: unknown) => {
                find: (from?: number, to?: number) => { from: number; to: number }[];
            }
        )(editor.state);
    }

    it('draws a decoration per anchor without touching the document HTML', () => {
        const editor = makeEditor();
        const htmlBefore = editor.getHTML();

        editor.commands.setDocumentMarks([makeMark()]);

        expect(decorations(editor).find(2, 8).length).toBeGreaterThanOrEqual(1);
        expect(editor.getHTML()).toBe(htmlBefore);
        editor.destroy();
    });

    it('rebuilds on a document change and keeps the cue mapped', () => {
        const editor = makeEditor();
        editor.commands.setDocumentMarks([makeMark()]);

        editor.commands.insertContent(' more');

        expect(decorations(editor).find(2, 8).length).toBeGreaterThanOrEqual(1);
        expect(editor.getHTML()).not.toContain('proof-cue');
        editor.destroy();
    });

    it('replaces the decorative classes when marks are cleared', () => {
        const editor = makeEditor();
        editor.commands.setDocumentMarks([makeMark()]);
        editor.commands.setDocumentMarks([]);
        expect(decorations(editor).find().length).toBe(0);
        editor.destroy();
    });

    it('accepts an active-mark update', () => {
        const editor = makeEditor();
        editor.commands.setDocumentMarks([makeMark()]);
        expect(() => editor.commands.setActiveDocumentMarks(['m1'])).not.toThrow();
        expect(decorations(editor).find().length).toBe(1);
        editor.destroy();
    });
});
