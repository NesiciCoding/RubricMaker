import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { DocumentMark } from '../../types';
import { firstLineBox, planRail, resolveMarkRange, type RailRow } from '../../utils/proofRail';

export interface ProofRailRow extends RailRow {
    marks: DocumentMark[];
    /** 1-based top-level block the row's first mark sits in, for the list's ¶ grouping. */
    block?: number;
}

export interface ProofRailBox {
    top: number;
    left: number;
    height: number;
    /** Width of the page box, so a panel opened from a chip can stay inside it. */
    width: number;
}

const EMPTY_BOX: ProofRailBox = { top: 0, left: 0, height: 0, width: 0 };

/** Gap between the text block and the chips, in rail px. */
const RAIL_INSET = 10;

export interface UseProofRailOptions {
    editor: Editor | null;
    /** The box the rail is positioned in — the A4 sheet in page mode, the editor column otherwise. */
    pageElement: HTMLElement | null;
    marks: readonly DocumentMark[];
    chipHeight?: number;
    gap?: number;
    /** CSS `zoom` factor, when the caller scales its stage; browser zoom needs no correction. */
    zoom?: number;
}

export interface UseProofRailResult {
    rows: ProofRailRow[];
    box: ProofRailBox;
    dir: 'ltr' | 'rtl';
    remeasure: () => void;
}

/**
 * Measures every mark against the page box and folds it into one row per visual line.
 *
 * Coordinates: with plain layout, measured px are layout px and dividing by `zoom` (default 1)
 * changes nothing. A caller that paints the rail inside a CSS `zoom`/transform stage must pass the
 * factor, because measured pixels are then scaled while the absolutely positioned chips are not —
 * skipping that is a 25–33 % drift at the zoom levels Phase 0 tested.
 *
 * Nothing here writes a layout-affecting style: chips are absolutely positioned only, so the
 * `ResizeObserver` cannot feed its own measurements back into a resize loop.
 */
export function useProofRail({
    editor,
    pageElement,
    marks,
    chipHeight = 20,
    gap = 4,
    zoom = 1,
}: UseProofRailOptions): UseProofRailResult {
    const [rows, setRows] = useState<ProofRailRow[]>([]);
    const [box, setBox] = useState<ProofRailBox>(EMPTY_BOX);
    const [dir, setDir] = useState<'ltr' | 'rtl'>('ltr');

    const measure = useCallback(() => {
        const content = editor?.view?.dom as HTMLElement | undefined;
        if (!editor || !pageElement || !content || marks.length === 0) {
            setRows([]);
            setBox(EMPTY_BOX);
            return;
        }

        const origin = pageElement.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const height = contentRect.height / zoom;
        const targets: { id: string; center: number; lines: number }[] = [];
        const byId = new Map(marks.map((mark) => [mark.id, mark]));
        const blocks = new Map<string, number>();

        for (const mark of marks) {
            const range = resolveMarkRange(editor.state.doc, mark);
            if (!range) continue;
            const line = firstLineBox(editor.view, range, origin);
            if (!line) continue;
            targets.push({ id: mark.id, center: line.center / zoom, lines: line.lines });
            try {
                blocks.set(mark.id, editor.state.doc.resolve(range.from).index(0) + 1);
            } catch {
                // A range that resolves to no top-level block simply has no ¶ number to show.
            }
        }

        const planned = planRail(targets, {
            chipHeight,
            gap,
            minTop: 0,
            maxTop: Math.max(0, height - chipHeight),
        });

        setRows(
            planned.map((row) => ({
                ...row,
                marks: row.ids.map((id) => byId.get(id)).filter((mark): mark is DocumentMark => Boolean(mark)),
                block: row.ids.map((id) => blocks.get(id)).find((block) => block !== undefined),
            }))
        );
        setBox({
            top: (contentRect.top - origin.top) / zoom,
            left: (contentRect.right - origin.left) / zoom + RAIL_INSET,
            height,
            width: (origin.right - origin.left) / zoom,
        });
        setDir(window.getComputedStyle(content).direction === 'rtl' ? 'rtl' : 'ltr');
        // `marks` must be a stable array (memoize it at the call site): measuring sets layout state,
        // so a fresh array on every render would re-measure on the render it just caused.
    }, [editor, pageElement, marks, chipHeight, gap, zoom]);

    useLayoutEffect(() => {
        measure();
    }, [measure]);

    useEffect(() => {
        const content = editor?.view?.dom as HTMLElement | undefined;
        if (!content || typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(() => measure());
        observer.observe(content);
        if (pageElement) observer.observe(pageElement);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [editor, pageElement, measure]);

    useEffect(() => {
        let cancelled = false;
        // Web fonts change line breaks after first paint; measure once they have settled.
        void document.fonts?.ready.then(() => {
            if (!cancelled) measure();
        });
        return () => {
            cancelled = true;
        };
    }, [measure]);

    return { rows, box, dir, remeasure: measure };
}
