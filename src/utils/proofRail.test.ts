import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
    findTextRange,
    groupByLine,
    hasOverlap,
    hashSnippet,
    PANEL_SHEET_MAX_WIDTH,
    placePanel,
    planRail,
    resolveMarkRange,
    stackRail,
    type RailSlot,
} from './proofRail';

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

function docFrom(html: string) {
    const editor = new Editor({ extensions: [KIT], content: html });
    const doc = editor.state.doc;
    editor.destroy();
    return doc;
}

describe('findTextRange', () => {
    const doc = docFrom('<p>one two one two</p>');

    it('finds the first occurrence by default', () => {
        expect(findTextRange(doc, 'one')).toMatchObject({ from: 1 });
    });

    it('finds a later occurrence when asked', () => {
        const first = findTextRange(doc, 'one', 0)!;
        const second = findTextRange(doc, 'one', 1)!;
        expect(second.from).toBeGreaterThan(first.to);
        expect(doc.textBetween(second.from, second.to)).toBe('one');
    });

    it('returns null when the needle is absent or the occurrence is out of range', () => {
        expect(findTextRange(doc, 'absent')).toBeNull();
        expect(findTextRange(doc, 'one', 2)).toBeNull();
    });
});

describe('hashSnippet', () => {
    it('is stable and notices a changed text', () => {
        expect(hashSnippet('recieve')).toBe(hashSnippet('recieve'));
        expect(hashSnippet('recieve')).not.toBe(hashSnippet('receive'));
    });
});

describe('resolveMarkRange', () => {
    const doc = docFrom('<p>Hello world</p>');
    const mark = { anchor: { from: 1, to: 6 } };

    it('keeps an in-bounds anchor', () => {
        expect(resolveMarkRange(doc, mark)).toEqual({ from: 1, to: 6 });
    });

    it('keeps an anchor whose stored snippet hash still matches', () => {
        expect(resolveMarkRange(doc, { ...mark, snippetHash: hashSnippet(doc.textBetween(1, 6)) })).toEqual({
            from: 1,
            to: 6,
        });
    });

    it('drops an anchor whose text no longer matches the stored hash', () => {
        expect(resolveMarkRange(doc, { ...mark, snippetHash: hashSnippet('Goodbye') })).toBeNull();
    });

    it('drops out-of-bounds, empty and inverted anchors', () => {
        expect(resolveMarkRange(doc, { anchor: { from: -1, to: 5 } })).toBeNull();
        expect(resolveMarkRange(doc, { anchor: { from: 2, to: 900 } })).toBeNull();
        expect(resolveMarkRange(doc, { anchor: { from: 4, to: 4 } })).toBeNull();
        expect(resolveMarkRange(doc, { anchor: { from: 8, to: 3 } })).toBeNull();
    });
});

describe('groupByLine', () => {
    it('folds marks on the same line and numbers the groups top to bottom', () => {
        const groups = groupByLine([
            { id: 'c', center: 200 },
            { id: 'a', center: 100 },
            { id: 'b', center: 104 },
        ]);
        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatchObject({ line: 1, ids: ['a', 'b'], center: 100 });
        expect(groups[1]).toMatchObject({ line: 2, ids: ['c'], center: 200 });
    });

    it('keeps marks further apart than the tolerance on separate lines', () => {
        expect(
            groupByLine(
                [
                    { id: 'a', center: 100 },
                    { id: 'b', center: 120 },
                ],
                8
            )
        ).toHaveLength(2);
    });
});

describe('stackRail', () => {
    const options = { chipHeight: 20, gap: 4, minTop: 0, maxTop: Number.POSITIVE_INFINITY };

    it('sits a spread of chips on their own lines with no drift', () => {
        const slots = stackRail(
            [100, 128, 156, 184].map((center, index) => ({ id: `m${index}`, center })),
            options
        );
        expect(slots.map((slot) => slot.top)).toEqual([90, 118, 146, 174]);
        expect(slots.every((slot) => slot.drift === 0 && !slot.stacked && !slot.overflow)).toBe(true);
        expect(hasOverlap(slots, options.chipHeight, options.gap)).toBe(false);
    });

    it('pushes a near-collision down by chip height plus gap and flags the drift', () => {
        const slots = stackRail(
            [
                { id: 'a', center: 100 },
                { id: 'b', center: 110 },
            ],
            options
        );
        expect(slots[0]!.top).toBe(90);
        expect(slots[1]!.top).toBe(114);
        expect(slots[1]!.drift).toBe(14);
        expect(slots[1]!.stacked).toBe(true);
    });

    it('clamps at the top of the rail', () => {
        const [slot] = stackRail([{ id: 'a', center: 4 }], options);
        expect(slot!.top).toBe(0);
        expect(slot!.drift).toBe(6);
    });

    it('clamps at the bottom and reports the overflow instead of hiding it', () => {
        const [slot] = stackRail([{ id: 'a', center: 500 }], { ...options, maxTop: 100 });
        expect(slot!.top).toBe(100);
        expect(slot!.overflow).toBe(true);
    });

    it('never overlaps with one chip per line on a full page', () => {
        const slots = stackRail(
            Array.from({ length: 20 }, (_, index) => ({ id: `l${index}`, center: 100 + index * 28 })),
            options
        );
        expect(slots).toHaveLength(20);
        expect(hasOverlap(slots, options.chipHeight, options.gap)).toBe(false);
        expect(slots.every((slot) => slot.drift === 0)).toBe(true);
    });

    it('detects an overlap when slots are forced together', () => {
        const overlapping: RailSlot[] = [
            { id: 'a', center: 0, top: 0, drift: 0, stacked: false, overflow: false },
            { id: 'b', center: 0, top: 10, drift: 0, stacked: false, overflow: false },
        ];
        expect(hasOverlap(overlapping, 20, 4)).toBe(true);
    });
});

describe('planRail', () => {
    const options = { chipHeight: 20, gap: 4, minTop: 0, maxTop: Number.POSITIVE_INFINITY };

    it('produces one row per line with the group ids', () => {
        const rows = planRail(
            [
                { id: 'a', center: 100 },
                { id: 'b', center: 102 },
                { id: 'c', center: 128 },
            ],
            options
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ line: 1, ids: ['a', 'b'], multiLine: false });
        expect(rows[1]).toMatchObject({ line: 2, ids: ['c'] });
    });

    it('flags a row whose mark spans more than one line', () => {
        const rows = planRail([{ id: 'a', center: 100, lines: 2 }], options);
        expect(rows[0]!.multiLine).toBe(true);
    });

    it('keeps 40 marks on 20 lines free of drift and overlap', () => {
        const targets = Array.from({ length: 40 }, (_, index) => ({
            id: `m${index}`,
            center: 100 + Math.floor(index / 2) * 28,
        }));
        const rows = planRail(targets, options);
        expect(rows).toHaveLength(20);
        expect(rows.reduce((sum, row) => sum + row.ids.length, 0)).toBe(40);
        expect(rows.every((row) => row.drift === 0)).toBe(true);
        expect(hasOverlap(rows, options.chipHeight, options.gap)).toBe(false);
    });
});

describe('placePanel', () => {
    const PAGE = { top: 0, left: 0, right: 1000, bottom: 1200, width: 1000 };
    const PANEL = { width: 260, height: 160 };
    const chip = { top: 200, left: 100, width: 28, height: 20 };

    it('prefers the right of the chip when the page has room', () => {
        const placement = placePanel(chip, PANEL, PAGE);
        expect(placement.side).toBe('right');
        expect(placement.left).toBe(136);
        expect(placement.top).toBe(200);
        expect(placement.width).toBe(260);
    });

    it('flips to the left of the chip when the right side would leave the page', () => {
        const placement = placePanel({ ...chip, left: 900 }, PANEL, PAGE);
        expect(placement.side).toBe('left');
        expect(placement.left).toBe(632);
    });

    it('clamps to the page margin when neither side fits', () => {
        const narrow = { ...PAGE, right: 420, width: 420 };
        const placement = placePanel({ ...chip, left: 120 }, PANEL, narrow);
        expect(placement.left).toBe(8);
    });

    it('clamps vertically so the panel never leaves the page', () => {
        const placement = placePanel({ ...chip, top: 1180 }, PANEL, PAGE);
        expect(placement.top).toBe(1032);
        expect(placePanel({ ...chip, top: -40 }, PANEL, PAGE).top).toBe(8);
    });

    it('becomes a full-width sheet under the narrow breakpoint', () => {
        const narrow = { ...PAGE, right: 600, width: PANEL_SHEET_MAX_WIDTH - 40 };
        const placement = placePanel(chip, PANEL, narrow);
        expect(placement.side).toBe('sheet');
        expect(placement.left).toBe(8);
        expect(placement.width).toBe(584);
    });
});
