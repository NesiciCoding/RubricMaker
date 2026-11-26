import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { useProofRail } from './useProofRail';
import type { DocumentMark } from '../../types';

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

// Stable references: the hook measures layout, so a new array or element per render would
// re-measure on the render it just caused.
const ONE_MARK: DocumentMark[] = [makeMark()];
const TWO_MARKS: DocumentMark[] = [makeMark(), makeMark({ id: 'm2', anchor: { from: 7, to: 12 } })];
const NO_MARKS: DocumentMark[] = [];
const STALE_MARK: DocumentMark[] = [makeMark({ anchor: { from: 2, to: 900 } })];

function domRect(values: Partial<DOMRect>): DOMRect {
    return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...values,
    } as DOMRect;
}

let lineTop = 200;
const originalGetClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

function rectList() {
    const rect = domRect({ top: lineTop, bottom: lineTop + 20, height: 20, left: 96, right: 160, width: 64 });
    return Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) }) as unknown as DOMRectList;
}

function makeEditor() {
    const editor = new Editor({ extensions: [KIT], content: '<p>Hello world</p>' });
    vi.spyOn(editor.view.dom, 'getBoundingClientRect').mockReturnValue(
        domRect({ top: 96, left: 96, right: 794, height: 1123 })
    );
    return editor;
}

function makePage() {
    const page = document.createElement('div');
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(domRect({ top: 0, left: 0, right: 800, height: 1200 }));
    return page;
}

beforeEach(() => {
    lineTop = 200;
    // jsdom defines this as read-only, so a plain assignment (or spyOn) throws.
    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        writable: true,
        value: rectList,
    });
});

afterEach(() => {
    if (originalGetClientRects) Object.defineProperty(Range.prototype, 'getClientRects', originalGetClientRects);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useProofRail', () => {
    it('measures a mark onto its line and places the rail beside the text block', () => {
        const editor = makeEditor();
        const page = makePage();
        const { result } = renderHook(() => useProofRail({ editor, pageElement: page, marks: ONE_MARK }));

        expect(result.current.rows).toHaveLength(1);
        expect(result.current.rows[0]!.marks[0]!.id).toBe('m1');
        expect(result.current.rows[0]!.top).toBe(200);
        expect(result.current.box).toEqual({ top: 96, left: 804, height: 1123, width: 800 });
        expect(result.current.dir).toBe('ltr');
        editor.destroy();
    });

    it('re-measures on demand, which is what a resize lands on', () => {
        const editor = makeEditor();
        const page = makePage();
        const { result } = renderHook(() => useProofRail({ editor, pageElement: page, marks: ONE_MARK }));

        lineTop = 400;
        act(() => result.current.remeasure());

        expect(result.current.rows[0]!.top).toBe(400);
        editor.destroy();
    });

    it('groups two marks on the same line into one row', () => {
        const editor = makeEditor();
        const page = makePage();
        const { result } = renderHook(() => useProofRail({ editor, pageElement: page, marks: TWO_MARKS }));

        expect(result.current.rows).toHaveLength(1);
        expect(result.current.rows[0]!.ids).toEqual(['m1', 'm2']);
        editor.destroy();
    });

    it('divides measured pixels by the zoom factor', () => {
        const editor = makeEditor();
        const page = makePage();
        const { result } = renderHook(() => useProofRail({ editor, pageElement: page, marks: ONE_MARK, zoom: 2 }));

        // The line centre is measured (210 px) and divided by the zoom; the chip stays 20 CSS px.
        expect(result.current.rows[0]!.top).toBe(95);
        expect(result.current.box.height).toBe(561.5);
        editor.destroy();
    });

    it('returns nothing without marks, an editor or a page box', () => {
        const editor = makeEditor();
        const page = makePage();
        const empty = renderHook(() => useProofRail({ editor, pageElement: page, marks: NO_MARKS }));
        expect(empty.result.current.rows).toEqual([]);
        expect(empty.result.current.box).toEqual({ top: 0, left: 0, height: 0, width: 0 });

        const noEditor = renderHook(() => useProofRail({ editor: null, pageElement: page, marks: ONE_MARK }));
        expect(noEditor.result.current.rows).toEqual([]);

        const noPage = renderHook(() => useProofRail({ editor, pageElement: null, marks: ONE_MARK }));
        expect(noPage.result.current.rows).toEqual([]);
        editor.destroy();
    });

    it('drops a mark whose anchor no longer resolves', () => {
        const editor = makeEditor();
        const page = makePage();
        const { result } = renderHook(() => useProofRail({ editor, pageElement: page, marks: STALE_MARK }));

        expect(result.current.rows).toEqual([]);
        editor.destroy();
    });

    it('observes the content and page boxes and re-measures when they resize', () => {
        const observed: Element[] = [];
        const callbacks: ResizeObserverCallback[] = [];
        class FakeResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                callbacks.push(callback);
            }
            observe(element: Element) {
                observed.push(element);
            }
            unobserve() {}
            disconnect() {}
        }
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);

        const editor = makeEditor();
        const page = makePage();
        const { result } = renderHook(() => useProofRail({ editor, pageElement: page, marks: ONE_MARK }));
        expect(observed).toEqual([editor.view.dom, page]);

        lineTop = 300;
        act(() => callbacks[0]!([], {} as ResizeObserver));
        expect(result.current.rows[0]!.top).toBe(300);
        editor.destroy();
    });
});
