import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout engine, so the grab target `CardGrip` provides is pinned at the source
// level: the cards get 25px from the default 5px padding around a 15px glyph, and any call site
// that tightens that padding has to declare the minimum itself (#1025).
const srcRoot = resolve(__dirname, '..');
const css = readFileSync(resolve(srcRoot, 'index.css'), 'utf8');

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(path);
        return entry.name.endsWith('.tsx') ? [path] : [];
    });
}

/** The opening tag of every `<CardGrip …>` in the tree, as `{ file, tag }`. */
function gripCallSites(): { file: string; tag: string; inDragHandle: boolean }[] {
    const sites: { file: string; tag: string; inDragHandle: boolean }[] = [];
    for (const path of tsxFiles(srcRoot)) {
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(/<CardGrip/g)) {
            const end = source.indexOf('>', match.index! + match[0].length);
            if (end === -1) continue;
            // TipTap's `<DragHandle>` is itself the draggable element and pads its child by 4px on
            // every side, so a grip inside it inherits a larger target than its own box suggests.
            const before = source.slice(0, match.index);
            sites.push({
                file: relative(srcRoot, path),
                tag: source.slice(match.index!, end),
                inDragHandle: before.lastIndexOf('<DragHandle') > before.lastIndexOf('</DragHandle>'),
            });
        }
    }
    return sites;
}

describe('CardGrip targets', () => {
    const sites = gripCallSites();

    it('finds the grips in the tree, so the scans below are not vacuous', () => {
        expect(sites.length).toBeGreaterThanOrEqual(8);
    });

    it('only names a grip that carries a role', () => {
        // `label` becomes `aria-label`, which is prohibited on a role-less span. The role comes
        // from @hello-pangea/dnd's `dragHandleProps`, so a named grip must spread them; TipTap's
        // handle owns the drag itself and names its grip with sr-only text instead.
        const named = sites.filter((s) => /\slabel=/.test(s.tag));
        expect(named.length).toBeGreaterThan(0);
        for (const site of named) {
            expect(site.tag, `${site.file} names a grip without dragHandleProps`).toMatch(/dragHandleProps/);
        }
    });

    it('declares the 25px minimum wherever it tightens the default padding', () => {
        // The TipTap grip is the one exception: its 18px box sits inside a wrapper that pads 4px
        // around it, which is the area a drag actually starts from.
        const tightened = sites.filter((s) => !s.inDragHandle && /padding:/.test(s.tag));
        expect(tightened.length).toBeGreaterThan(0);
        for (const site of tightened) {
            expect(site.tag, `${site.file} shrinks the grab target below 25px`).toMatch(/minWidth:\s*25/);
            expect(site.tag, `${site.file} shrinks the grab target below 25px`).toMatch(/minHeight:\s*25/);
        }
    });

    it("keeps TipTap's drag wrapper out of touch panning", () => {
        // The wrapper, not the grip, is the element TipTap makes draggable, and its 4px padding
        // is inside that area — a touch there would otherwise scroll the page instead.
        expect(css).toMatch(/\.drag-handle \{[^}]*touch-action: none/);
    });
});
