import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { PROOF_MARK_DEMO_ESSAY, buildProofMarkDemo } from './proofMarkDemo';
import { getTipTapExtensions } from '../components/Editor/tiptapExtensions';
import { resolveMarkRange } from '../utils/proofRail';

describe('proof-mark demo fixture', () => {
    const marks = buildProofMarkDemo('att-1', 'teacher-1');

    it('samples 40 marks, each with its own id', () => {
        expect(marks).toHaveLength(40);
        expect(new Set(marks.map((m) => m.id)).size).toBe(40);
        expect(new Set(marks.map((m) => m.symbolId)).size).toBeGreaterThan(1);
    });

    it('anchors every mark on text the parsed essay really contains', () => {
        const editor = new Editor({ content: PROOF_MARK_DEMO_ESSAY, extensions: getTipTapExtensions() });
        try {
            for (const mark of marks) {
                const range = resolveMarkRange(editor.state.doc, mark);
                expect(range, `${mark.id} does not resolve against the essay`).not.toBeNull();
                expect(editor.state.doc.textBetween(range!.from, range!.to).length).toBeGreaterThanOrEqual(3);
            }
        } finally {
            editor.destroy();
        }
    });

    it('keeps the anchors in document order', () => {
        const froms = marks.map((m) => m.anchor.from);
        expect([...froms].sort((a, b) => a - b)).toEqual(froms);
    });
});
