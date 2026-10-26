import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom has no layout/animation engine, so this is pinned at the stylesheet level,
// the same way the phone-width rules are (see mobileLayoutCss.test.ts).
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

function mediaBlock(query: string): string {
    const re = new RegExp(`@media \\(${query}\\) \\{`);
    const match = css.match(re);
    if (!match) return '';
    let depth = 1;
    let i = match.index! + match[0].length;
    while (depth > 0 && i < css.length) {
        if (css[i] === '{') depth++;
        if (css[i] === '}') depth--;
        i++;
    }
    return css.slice(match.index!, i);
}

describe('modal animations respect prefers-reduced-motion (#533)', () => {
    it('disables both the overlay fade and the grow-in scale animation', () => {
        const reduced = mediaBlock('prefers-reduced-motion: reduce');
        expect(reduced).toMatch(/\.modal-overlay,\s*\.modal-grow\s*\{[^}]*animation: none/);
    });

    it('still animates them by default', () => {
        expect(css).toMatch(/\.modal-overlay \{[^}]*animation: modal-overlay-in/);
        expect(css).toMatch(/\.modal-grow \{\s*animation: modal-grow-in/);
    });
});
