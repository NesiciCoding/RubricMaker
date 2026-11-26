import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { DocumentMark } from '../types';

/**
 * Geometry for the margin rail, promoted unchanged from the Phase 0 spike. A mark's position is a
 * function of layout, font metrics, wrapping and zoom, so it is measured with `getClientRects()`
 * and never derived from its character offset.
 */

export interface TextRange {
    from: number;
    to: number;
}

/** Finds a plain-text needle inside the document and returns its absolute ProseMirror range. */
export function findTextRange(doc: PMNode, needle: string, occurrence = 0): TextRange | null {
    const blocks: { text: string; start: number }[] = [];
    doc.descendants((node, pos) => {
        if (node.isText && node.text) blocks.push({ text: node.text, start: pos });
        return true;
    });

    let seen = 0;
    for (const block of blocks) {
        let at = block.text.indexOf(needle);
        while (at !== -1) {
            if (seen === occurrence) return { from: block.start + at, to: block.start + at + needle.length };
            seen += 1;
            at = block.text.indexOf(needle, at + 1);
        }
    }
    return null;
}

/**
 * FNV-1a. Not a security hash: it only has to notice that the text under an anchor changed, which
 * is enough to drop a stale mark instead of drawing it over the wrong words.
 */
export function hashSnippet(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

/**
 * Resolves a stored anchor against the current document. Out-of-bounds and empty anchors are
 * dropped the way `commentDecorationSpecs` drops them; a mark whose `snippetHash` no longer matches
 * the text under it is dropped too, because a mark drawn on the wrong words is worse than no mark.
 * (The snippet itself is not stored, so there is nothing to re-search for. Documents are locked
 * after submission, so a mismatch means the record was written against other content.)
 */
export function resolveMarkRange(doc: PMNode, mark: Pick<DocumentMark, 'anchor' | 'snippetHash'>): TextRange | null {
    const { from, to } = mark.anchor;
    if (from < 0 || to > doc.content.size || from >= to) return null;
    if (mark.snippetHash) {
        const text = doc.textBetween(from, to, ' ', ' ');
        if (hashSnippet(text) !== mark.snippetHash) return null;
    }
    return { from, to };
}

export interface LineBox {
    /** Vertical centre of the range's first line box, in px from `origin.top`. */
    center: number;
    left: number;
    right: number;
    /** Number of distinct lines the range covers — a mark spanning lines needs a decision. */
    lines: number;
    /** Raw rect count, to show how noisy `getClientRects()` is at boundaries. */
    fragments: number;
}

/** Measures where a document range actually sits relative to `origin`. */
export function firstLineBox(view: EditorView, range: TextRange, origin: DOMRect): LineBox | null {
    try {
        const start = view.domAtPos(range.from);
        const end = view.domAtPos(range.to);
        const domRange = document.createRange();
        domRange.setStart(start.node, start.offset);
        domRange.setEnd(end.node, end.offset);
        const rects = Array.from(domRange.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        const first = rects[0];
        if (!first) return null;
        // `getClientRects()` can return more than one rect for a range that never wraps (inline
        // wrappers, boundary nodes), so "lines" is counted by distinct vertical positions.
        const lines = new Set(rects.map((r) => Math.round(r.top))).size;
        return {
            center: first.top - origin.top + first.height / 2,
            left: first.left - origin.left,
            right: first.right - origin.left,
            lines,
            fragments: rects.length,
        };
    } catch {
        // Range construction throws if a position resolved into a node it cannot address.
        return null;
    }
}

export interface RailTarget {
    id: string;
    /** Where the mark's line actually is, in rail-local px. */
    center: number;
    /** Distinct lines the anchored range covers; anything above 1 anchors to its first line. */
    lines?: number;
}

export interface RailOptions {
    chipHeight: number;
    gap: number;
    minTop: number;
    maxTop: number;
}

export interface RailSlot {
    id: string;
    center: number;
    top: number;
    /** How far the chip was pushed down from its own line to avoid the chip above it. */
    drift: number;
    stacked: boolean;
    /** True when the chip had to be clamped at the bottom and no longer fits cleanly. */
    overflow: boolean;
}

/**
 * Collision stacking, kept pure so it can be reasoned about and checked without a browser.
 * Chips keep document order, sit at their line when there is room, and are pushed down by
 * `chipHeight + gap` when the line above already has a chip.
 */
export function stackRail(targets: RailTarget[], options: RailOptions): RailSlot[] {
    const ordered = [...targets].sort((a, b) => a.center - b.center || a.id.localeCompare(b.id));
    const slots: RailSlot[] = [];
    let previousBottom = Number.NEGATIVE_INFINITY;

    for (const target of ordered) {
        const desired = target.center - options.chipHeight / 2;
        const pushed = Math.max(desired, previousBottom + options.gap, options.minTop);
        const top = Math.min(pushed, options.maxTop);
        slots.push({
            id: target.id,
            center: target.center,
            top,
            drift: top - desired,
            stacked: top - desired > 0.5,
            overflow: top < pushed - 0.5,
        });
        previousBottom = top + options.chipHeight;
    }

    return slots;
}

export interface LineGroup {
    /** 1-based line index in the rail, top to bottom. */
    line: number;
    ids: string[];
    /** The group's line position, taken from its first mark. */
    center: number;
}

/**
 * Folds marks that sit on the same visual line into one rail entry. `tolerance` is in rail px; a
 * line-height of 28 px means anything within a few px is the same line even when the words differ
 * in font size.
 */
export function groupByLine(targets: RailTarget[], tolerance = 8): LineGroup[] {
    const sorted = [...targets].sort((a, b) => a.center - b.center || a.id.localeCompare(b.id));
    const groups: LineGroup[] = [];

    for (const target of sorted) {
        const last = groups[groups.length - 1];
        if (last && Math.abs(target.center - last.center) <= tolerance) {
            last.ids.push(target.id);
        } else {
            groups.push({ line: groups.length + 1, ids: [target.id], center: target.center });
        }
    }

    return groups;
}

/** True when any two chips overlap, which stacking must never allow. */
export function hasOverlap(slots: RailSlot[], chipHeight: number, gap: number): boolean {
    const ordered = [...slots].sort((a, b) => a.top - b.top);
    for (let i = 1; i < ordered.length; i += 1) {
        const previous = ordered[i - 1];
        const current = ordered[i];
        if (previous && current && current.top < previous.top + chipHeight + gap - 0.01) return true;
    }
    return false;
}

export interface RailRow extends RailSlot {
    /** 1-based visual line, top to bottom. */
    line: number;
    ids: string[];
    /** True when any mark in the group spans more than one line. */
    multiLine: boolean;
}

/** Group → stack → one row per line, the exact pipeline Phase 0 measured. */
export function planRail(targets: RailTarget[], options: RailOptions, tolerance = 8): RailRow[] {
    const groups = groupByLine(targets, tolerance);
    const byLine = new Map(groups.map((group) => [group.line, group]));
    const byId = new Map(targets.map((target) => [target.id, target]));

    return stackRail(
        groups.map((group) => ({ id: String(group.line), center: group.center })),
        options
    ).map((slot) => {
        const group = byLine.get(Number(slot.id));
        const ids = group?.ids ?? [];
        return {
            ...slot,
            line: group?.line ?? 0,
            ids,
            multiLine: ids.some((id) => (byId.get(id)?.lines ?? 1) > 1),
        };
    });
}
