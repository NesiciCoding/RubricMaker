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

/** Comments may name the rule — a `position: fixed` mentioned in prose is not a declaration. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function offenders(): string[] {
    return sourceFiles(srcRoot)
        .map((path) => ({ path, source: readFileSync(path, 'utf8'), rel: relative(srcRoot, path) }))
        .filter(({ source, rel }) => {
            if (NOT_OVERLAYS.has(rel)) return false;
            const code = stripComments(source);
            const fixedCss = /position:\s*'fixed'/.test(code) || /position:\s*fixed/.test(code);
            return fixedCss && !/\bcreatePortal\b/.test(code);
        })
        .map(({ rel }) => rel);
}

describe('fixed-position overlays', () => {
    it('are portalled to <body> so a transformed ancestor cannot reposition them', () => {
        expect(offenders()).toEqual([]);
    });

    it('gives the body-level pill popovers one stylesheet-owned panel', () => {
        // The cloze-gap, error-fragment and hot-text popovers are built imperatively, so their
        // shell cannot be a React component — it is `.pill-popover` in index.css, and the editors
        // only style the contents. If an editor declares the shell again the panel has two owners
        // and drifts (#1022).
        const css = readFileSync(resolve(srcRoot, 'index.css'), 'utf8');
        expect(css).toMatch(/\.pill-popover \{[^}]*position: fixed/);
        for (const editor of ['ClozeGapEditor.tsx', 'ErrorPassageEditor.tsx', 'HotTextEditor.tsx']) {
            const source = readFileSync(resolve(srcRoot, 'components/Tests', editor), 'utf8');
            expect(source, editor).not.toMatch(/position:\s*fixed/);
            expect(source, editor).not.toMatch(/\.(cloze-gap|error-fragment|hot-text)-popover \{/);
        }
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
