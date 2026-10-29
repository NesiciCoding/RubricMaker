import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(__dirname, '..');

/**
 * Fixed-position overlays must be portalled, not rendered where they are declared (#1017).
 *
 * `position: fixed` is resolved against the nearest ancestor with a transform, filter, perspective
 * or `will-change`, not the viewport. Page content sits inside `.fade-in`, which used to end its
 * animation on `transform: translateY(0)` — so a menu or toast rendered in the page was positioned
 * against that box and appeared anchored mid-card. The CSS is fixed, but the guarantee belongs to
 * the components: portal them to <body> and an animated ancestor can never capture them again.
 */

// Files that are not React overlays. Everything else that is `position: fixed` has to be portalled.
const NOT_OVERLAYS = new Set([
    // The test builder's A4 preview column is part of the page's own layout (it replaces a sticky
    // column at narrow widths), not a floating overlay.
    'pages/TestBuilderPage.tsx',
    // Offscreen textarea created imperatively and appended to <body> to measure text.
    'pages/StudentEssayPage.tsx',
    // `position: fixed` in a stylesheet for the generated PDF document, never rendered in the app.
    'utils/pdfExport.ts',
    // TipTap pill popovers: inserted by editor extensions that own their own DOM, so they are not
    // React portals yet. Tracked in #1022 — remove these entries as each one migrates.
    'components/Tests/ClozeGapEditor.tsx',
    'components/Tests/ErrorPassageEditor.tsx',
    'components/Tests/HotTextEditor.tsx',
]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(path);
        }
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
    });
}

function offenders(): string[] {
    return sourceFiles(srcRoot)
        .map((path) => ({ path, source: readFileSync(path, 'utf8'), rel: relative(srcRoot, path) }))
        .filter(({ source, rel }) => {
            if (NOT_OVERLAYS.has(rel)) return false;
            const fixedCss = /position:\s*'fixed'/.test(source) || /position:\s*fixed/.test(source);
            return fixedCss && !/\bcreatePortal\b/.test(source);
        })
        .map(({ rel }) => rel);
}

describe('fixed-position overlays', () => {
    it('are portalled to <body> so a transformed ancestor cannot reposition them', () => {
        expect(offenders()).toEqual([]);
    });

    it('keeps the page-entrance animation off an identity transform', () => {
        const css = readFileSync(resolve(srcRoot, 'index.css'), 'utf8');
        const start = css.indexOf('@keyframes fadeIn');
        expect(start).toBeGreaterThan(-1);
        // Brace-matched block, so the `from { … }` frame's closing brace can't truncate the slice.
        let depth = 0;
        let end = start;
        for (let i = css.indexOf('{', start); i < css.length; i++) {
            if (css[i] === '{') depth++;
            if (css[i] === '}' && --depth === 0) {
                end = i;
                break;
            }
        }
        const block = css.slice(start, end + 1);
        const to = block.slice(block.indexOf('to {'));
        // `translateY(0)` or `scale(1)` would make `.fade-in` a containing block for good.
        expect(to).not.toMatch(/transform:\s*(translate[^;]*\(0[a-z%]*\)|scale\(1\))/);
        expect(to).toContain('transform: none');
    });
});
